# Playmatch — Revisión de arquitectura, seguridad e infraestructura
**Fecha:** 4 de octubre de 2026 · **Alcance:** código del repo, configuración de despliegue (Docker/EasyPanel/Nginx), y la base de datos de producción en Supabase (vía los "advisors" automáticos de seguridad y rendimiento).

## Veredicto general

Para ser una aplicación construida en semanas y no meses, el nivel técnico es bueno: usa TypeScript de punta a punta, Row Level Security real en la base de datos (no solo validación en el frontend), triggers que refuerzan reglas de negocio a nivel de base de datos (anti-doble-reserva, anti-autoaprobación), y ya se le han hecho tres rondas de auditoría de seguridad. No es "código hecho por una IA sin criterio" — tiene decisiones de diseño conscientes y documentadas.

Dicho esto, **hoy la aplicación está diseñada para funcionar bien con tráfico bajo-medio en un solo servidor, no para crecer de forma elástica sin cambios**. Eso es normal y esperable en esta etapa (MVP, pocos usuarios reales todavía) — no es un error, es una decisión correcta de no sobre-construir infraestructura que no necesitas aún. Pero si el plan es crecer, hay una lista concreta de qué cambiar y en qué orden, abajo.

---

## 1. Seguridad

### Corregido en esta sesión
- **Vulnerabilidad crítica de Next.js** (RCE no autenticada) — ya resuelto, ver sesión anterior.
- **CSP sin `object-src`** y **campos de login sin `autocomplete`** — ya resuelto (hallazgos del pentest Argus).
- **Funciones de base de datos innecesariamente expuestas como endpoints públicos** (`handle_new_user`, `protect_court_approval`, `protect_profile_privilege_fields`, `enforce_booking_cancellation`): son funciones de *trigger* — Postgres ya impide llamarlas directo, así que no eran explotables en la práctica, pero quedaban listadas como endpoints RPC públicos (`/rest/v1/rpc/...`) sin necesidad. Se revocó el permiso de ejecución directa para los roles públicos (`anon`/`authenticated`) — los triggers siguen funcionando igual, solo se cerró una puerta que no debía estar abierta. Migración aplicada directo en producción: `20261004000001_perf_and_security_hardening_argus_followup.sql`.
- **Índices faltantes en 9 columnas de llave foránea** (ver sección de rendimiento) — también cierra una vía de degradación a futuro.

### Pendiente — acción manual tuya, 2 minutos, sin riesgo
- **"Protección contra contraseñas filtradas" está desactivada en Supabase.** Es una opción que compara la contraseña que alguien intenta usar contra bases de datos públicas de contraseñas filtradas (HaveIBeenPwned) y la rechaza si ya está comprometida. Actívala en: Supabase → tu proyecto → **Authentication → Policies → Password Security** (o "Auth Settings" según la versión del panel) → activa "Leaked password protection". No requiere cambios de código ni redeploy.

### Revisado, sin hallazgos nuevos
`npm audit` sin vulnerabilidades críticas pendientes tras el fix de Next.js (queda una de severidad alta en una dependencia de *build* de Tailwind, de riesgo real bajo — ver sección de deuda técnica).

---

## 2. Rendimiento y escalabilidad de la base de datos

Se revisaron los "advisors" automáticos de Supabase (seguridad + rendimiento) contra la base de datos real de producción — no es una opinión, son hallazgos concretos que Supabase mismo detecta analizando tus tablas y policies.

### Corregido en esta sesión
- **9 columnas de llave foránea sin índice** (`court_id`, `owner_id`, `venue_id`, etc. en varias tablas). Con pocos datos no se nota nada; según crezcan las reservas y canchas, cualquier consulta tipo "todas las reservas de esta cancha" o "todas las canchas de esta sede" empieza a recorrer la tabla completa en vez de usar un índice — es la causa más común de que una app "que funcionaba bien" se vuelva lenta solo por crecer en datos, sin que el código haya cambiado. Ya se agregaron los 9 índices en producción.

### Pendiente — recomendado antes de crecer en tráfico, no urgente hoy
- **16 políticas de Row Level Security re-evalúan `auth.uid()` fila por fila** en vez de una sola vez por consulta (patrón recomendado: `(select auth.uid())` en vez de `auth.uid()` directo dentro de la policy). Con el volumen actual es imperceptible; con miles de reservas empieza a costar. Corregirlo bien requiere reescribir cada policy con cuidado (son 16) y probar que el control de acceso se mantenga idéntico — no es algo para hacer de pasada sin pruebas dedicadas, pero queda identificado y priorizado para la próxima sesión de trabajo en base de datos.
- **Políticas de lectura duplicadas** en 5 tablas (`courts`, `court_photos`, `court_schedules`, `court_closures`, `payouts`): cada una tiene dos policies de `SELECT` separadas que aplican a la vez (una para "público ve lo activo", otra para "el dueño ve lo suyo"), lo que hace que Postgres evalúe ambas en cada consulta en vez de una sola combinada. Mismo caso: arreglarlo bien implica combinarlas en una sola policy con `OR`, y conviene hacerlo junto con el punto anterior en una sesión dedicada a la base de datos.

---

## 3. Calidad del código y arquitectura de la app

**Bien:**
- TypeScript estricto en todo el proyecto, sin `any` sueltos que haya encontrado.
- Patrón consistente: todas las páginas de `/panel` y `/admin` repiten el mismo guard de autenticación/rol.
- La seguridad real vive en la base de datos (RLS + triggers), no solo en el código de la app — así que aunque alguien se salte la interfaz y llame la API de Supabase directo, las reglas de negocio se mantienen. Esto es una decisión de diseño correcta y poco común en proyectos de esta etapa.
- El constraint anti-doble-reserva vive en la base de datos (a nivel de `EXCLUDE` constraint), no en el código — matemáticamente imposible que se traslapen dos reservas, sin importar condiciones de carrera.

**Falta (deuda técnica, no bloqueante hoy):**
- **No hay ninguna prueba automatizada** (unit tests, integration tests, e2e) en todo el repo. Hoy cada cambio se verifica manualmente (compilar + revisar visualmente). Funciona mientras el equipo es una persona y los cambios los revisa Claude antes de entregarlos, pero es el primer punto que se vuelve riesgoso si el proyecto crece: no hay red de seguridad automática que avise si un cambio rompe el flujo de pago o de reservas.
- Flujo de IA (`buscar_canchas`) sigue haciendo hasta 3 consultas a Supabase por cada cancha candidata (hasta 20 candidatas = 60 consultas por una sola búsqueda del chat) — ya mitigado con rate limiting, pero sigue siendo ineficiente si el chat se vuelve popular. Optimizarlo (una sola consulta con JOIN en vez de N+1) es un cambio de rendimiento pendiente, no urgente con el tráfico actual.

---

## 4. Infraestructura y qué tan "elástica" es hoy

Esta es la pregunta central que hiciste, así que va directo:

**Hoy Playmatch corre en un solo contenedor, en un solo VPS, sin forma automática de escalar.** Concretamente:

- **Una sola instancia de la app.** Si ese contenedor se cae o el VPS se queda sin recursos en un pico de tráfico, el sitio se cae — no hay un segundo contenedor ni balanceador que tome el relevo.
- **El rate limiting del chat de IA vive en memoria del proceso** (ya documentado en auditorías anteriores): funciona bien con una sola instancia, pero si en el futuro agregas una segunda instancia para repartir carga, cada una contaría las peticiones por separado y el límite dejaría de ser confiable — hay que migrar a un store compartido (Redis/Upstash) en ese momento, no antes.
- **Sin caché compartida ni cola de trabajos.** Todo se calcula en cada request (disponibilidad de canchas, etc.) — razonable al volumen actual, pero si el tráfico crece 10-20x, conviene agregar una capa de caché (Redis) para las consultas más repetidas.
- **Encontré un detalle de infraestructura que vale la pena que confirmes**: el repo tiene un GitHub Action (`.github/workflows/deploy.yml`) que, en cada push a `main`, intenta conectarse por SSH al VPS y correr `docker compose build/up` — un mecanismo de despliegue *distinto* al que describiste que usas (EasyPanel, con el botón "Deploy" manual). No sé si ese Action sigue activo (depende de si los secretos `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY` siguen configurados en GitHub) ni si apunta al mismo contenedor que EasyPanel administra. Si está activo y apunta a otro lado, podrías tener dos mecanismos de despliegue compitiendo sin saberlo. Vale la pena que revises en GitHub → tu repo → Settings → Secrets and variables → Actions, y si no lo usas, lo deshabilites o borres para evitar confusión futura.
- **Un solo correo SMTP compartido entre dos flujos ahora.** El SMTP por defecto de Supabase está limitado a ~2-3 correos por hora (ya documentado antes para la confirmación de registro). Con el nuevo flujo de "olvidé mi contraseña" que se agregó hoy, **ambos flujos comparten ese mismo límite** — si varios usuarios se registran y otros piden recuperar contraseña en la misma hora, algunos correos simplemente no se van a enviar, sin error visible para el usuario. Esto ya estaba en tu lista de pendientes ("email transaccional real, ej. Resend") pero ahora es más urgente, porque ya no es solo onboarding, es también gente que no puede entrar a su cuenta.
- **Sin ambiente de staging**, sin monitoreo/alertas (ej. UptimeRobot), sin logs centralizados fuera de lo que EasyPanel guarda — todo esto ya estaba en el checklist "antes de clientes reales" del documento que te entregué en agosto, sigue vigente.

### Qué tan difícil es hacerla elástica después
La buena noticia: el diseño actual no te encierra. La autenticación es con JWT de Supabase (sin estado de sesión en el servidor), la base de datos ya está separada de la app (Supabase, no una base local), y el contenedor usa `output: "standalone"` de Next.js — todo eso es exactamente lo que se necesita para poder correr **varias instancias detrás de un balanceador** el día que haga falta, sin rediseñar nada grande. Los únicos bloqueos reales para escalar horizontalmente son los dos que ya mencioné (rate limit en memoria, sin caché compartida), y ambos son cambios acotados cuando llegue el momento — no hace falta resolverlos hoy, solo saber que existen.

---

## 5. Prioridad sugerida

**Ya hecho hoy:** fix crítico de Next.js, CSP, autocomplete, índices de base de datos, cierre de RPCs innecesarios.

**Siguiente (bajo esfuerzo, antes de más usuarios reales):**
1. Activar "leaked password protection" en Supabase (2 minutos).
2. Configurar un proveedor de correo real (Resend u otro) — ya urgente por el nuevo flujo de recuperación de contraseña.
3. Confirmar/limpiar el GitHub Action de deploy duplicado.

**Después, cuando el tráfico empiece a crecer de verdad (no antes, no vale la pena invertir ahí todavía):**
4. Optimizar las 16 policies de RLS y consolidar las políticas duplicadas.
5. Mover el rate limiting a un store compartido (Redis/Upstash) si agregas una segunda instancia.
6. Agregar pruebas automatizadas al menos para el flujo de pago y de reservas (el código que más cuesta si se rompe en silencio).
7. Monitoreo/alertas y ambiente de staging.
