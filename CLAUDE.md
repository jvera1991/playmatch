# Playmatch — Blueprint de arquitectura

> Documento autocontenido. Una nueva sesión de Claude Code, sin contexto previo, puede
> construir/continuar este proyecto solo con este archivo + el código ya generado.

## Qué es esto

Marketplace tipo Airbnb de canchas sintéticas (fútbol, pádel, vóley) en Medellín.
Dos lados: **dueños de cancha** (publican, gestionan horarios, reciben pagos menos
comisión) y **jugadores** (buscan, reservan, pagan en línea). Playmatch cobra 10% de
comisión por reserva confirmada, a partir del segundo mes de operación.

## Stack (verificado en vivo el 2026-08-18)

| Capa | Tecnología | Versión pineada |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | 16.3.1 |
| UI | React + Tailwind CSS | 19.2.8 / 3.4.17 |
| Datos/Auth/Storage | Supabase (Postgres) | proyecto `qtkudukcmjypjsvsxpvl` |
| Pagos | Wompi (Colombia) | API REST + webhook de eventos |
| Notificaciones | WhatsApp Cloud API (Meta, directo) | — |
| Despliegue | Docker Compose + Nginx + Let's Encrypt | VPS propio (VH Cloud, 2vCPU/4GB) |
| CI/CD | GitHub Actions → SSH deploy | `.github/workflows/deploy.yml` |

Nota de versiones: se fijó **TypeScript 5.7.3** (no la 7.x recién liberada, reescritura
nativa del compilador — todavía sin suficiente adopción del ecosistema) y **Tailwind
3.4.17** (no la 4.x, que cambia el modelo de configuración) a propósito, para minimizar
riesgo de romper el tooling en un proyecto recién generado. Next/React/Supabase sí van
en su versión estable más reciente verificada. Antes de actualizar cualquier pin,
volver a verificar en el registro de npm — nunca asumir de memoria.

## Modelo de datos (ya aplicado en Supabase, ver `supabase/migrations/`)

`profiles` (rol: player/owner/admin) · `venues` (sedes de un dueño) · `courts`
(cancha, deporte, precio/hora) · `court_photos` · `court_schedules` (horario semanal
recurrente) · `court_closures` (cierres puntuales que el dueño crea desde el panel) ·
`bookings` (reserva, con constraint `EXCLUDE` a nivel de base de datos que impide
matemáticamente dos reservas traslapadas en la misma cancha — no depende del código de
la app) · `payouts` (liquidaciones a dueños) · `notifications_log`.

Seguridad: RLS activo en las 9 tablas. Un jugador solo ve sus propias reservas: un
dueño solo ve/edita lo de sus canchas; admin ve todo.

## Flujo de reserva y pago

1. Jugador elige cancha + franja horaria → `POST /api/bookings` crea el registro en
   estado `pending_payment` (el `EXCLUDE` constraint rechaza si ya está ocupada).
2. Frontend abre el widget/checkout de Wompi con `booking.id` como referencia.
3. Wompi llama a `POST /api/webhooks/wompi` (firma verificada con
   `WOMPI_EVENTS_SECRET`) → si `APPROVED`, marca la reserva `confirmed`.
4. Un job periódico (`GET /api/cron/reminders`, protegido con `CRON_SECRET`) busca
   reservas confirmadas que empiezan en ~1h y manda el recordatorio de WhatsApp.

**Importante — split de pagos**: Wompi no reparte automáticamente entre Playmatch y
cada dueño (no existe un "Stripe Connect" colombiano equivalente). El dinero completo
entra a la cuenta Wompi de Playmatch; `bookings.owner_payout_amount` lleva la cuenta de
cuánto se le debe a cada dueño. `payouts` registra las liquidaciones manuales
(transferencia bancaria periódica). Fase 2: automatizar con la API bancaria o un
agregador de pagos con split nativo si el volumen lo justifica.

## Lo que falta por construir (fase 1 → MVP funcional)

Hecho hasta ahora (2026-08-18): auth completa (login/registro/logout/aprobación de
dueños), calendario de disponibilidad y reserva conectada, checkout de Wompi (Web
Checkout redirect, firma de integridad server-side en `lib/wompi.ts`), liberación
automática de cupos no pagados a los 15 min, rediseño visual completo (Tailwind +
animaciones, ver sección "Sistema de diseño"), panel del dueño completo
(resumen/canchas/calendario/reservas/pagos), panel admin completo
(resumen/dueños/canchas/reservas/pagos), página `/buscar` con filtros, subida de
fotos de canchas (Supabase Storage), calendario mensual del dueño estilo Google
Calendar (`/panel/calendario`), mapa con Google Maps (`/mapa`) con filtro por
comuna/barrio/punto cardinal de Medellín (`lib/medellin.ts`), geocodificación
automática de la dirección al publicar una cancha (`lib/geocoding.ts`), edición
completa de canchas por el dueño (`/panel/canchas/[id]/editar`), campo de tamaño/
formato (5v5/7v7/9v9/11v11, etc. — `lib/court-sizes.ts`) y de "cancha techada",
sitio responsivo (nav móvil con hamburguesa, tablas/calendario con scroll horizontal
en pantallas chicas), y **aprobación admin obligatoria para publicar canchas**
(ver sección siguiente).

**Aprobación de canchas por admin (2026-08-18):** antes, una cancha nueva quedaba
visible en el sitio apenas el dueño la creaba, sin revisión — riesgo de que se
publicara contenido basura. Ahora toda cancha nace con `courts.is_approved = false`
y solo se muestra públicamente (home, `/buscar`, `/mapa`, `/canchas/[id]`) cuando
`is_active = true AND is_approved = true`. El admin la aprueba desde
`/admin/canchas` (sección "Canchas pendientes de aprobación" arriba de la lista
general). Esto está reforzado en dos capas:
- **RLS**: la política `courts_public_read_active` exige ambas columnas en true
  para lectura pública (migración `20260818000009_court_approval_gate.sql`).
- **Trigger de base de datos** (`protect_court_approval`, misma migración): un
  dueño no puede auto-aprobar su propia cancha ni al crearla ni al editarla,
  aunque llame a la API de Supabase directamente saltándose el formulario — solo
  un usuario con `role = 'admin'` puede cambiar `is_approved`. Esta es defensa en
  profundidad a propósito, porque el usuario planteó esto como un tema de
  seguridad/moderación de contenido, no solo de UX.
- Nota de diseño: editar una cancha ya aprobada (precio, descripción, etc.) NO la
  regresa a "pendiente" — si en el futuro se detecta abuso vía ediciones después
  de la aprobación inicial, considerar resetear `is_approved` en cambios de
  `name`/`description`/fotos.

**Bug corregido (2026-08-18):** el trigger `on_auth_user_created` que crea el
`profile` al registrarse existía como función pero nunca se conectó a
`auth.users` — cada cuenta nueva se creaba sin perfil (navbar roto, sin acceso a
paneles). Se corrigió con la migración `20260818000005_fix_missing_new_user_trigger.sql`,
que también rellena el perfil de las cuentas que ya se habían visto afectadas.
Si en el futuro una cuenta nueva vuelve a aparecer "sin rol", revisar primero que
este trigger siga existiendo (`select * from pg_trigger where tgname = 'on_auth_user_created'`).

**Bug corregido (2026-08-18) — canchas sin ubicación en el mapa:** la geocodificación
(`lib/geocoding.ts`) fallaba en silencio para TODAS las canchas porque usaba la misma
llave de Google Maps que el navegador (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`), la cual está
restringida por "HTTP referrer". Esa restricción es correcta para el mapa en el
navegador, pero bloquea llamadas servidor-a-servidor (Node.js no manda header
`Referer` de navegador), así que la API de Google rechazaba la geocodificación con
`REQUEST_DENIED` y la función devolvía `null` sin loguear nada. Se corrigió así:
- `lib/geocoding.ts` ahora usa `GOOGLE_MAPS_SERVER_API_KEY` (una llave **separada**,
  sin restricción de referrer — ver `.env.example` para cómo crearla), con fallback a
  la llave pública si no está configurada.
- Ahora loguea con `console.error` la razón exacta que devuelve Google
  (`data.status` + `data.error_message`) en vez de fallar en silencio total — la
  próxima vez que algo similar pase, revisar los logs del servidor primero.
- Se agregó un botón "📍 Volver a ubicar en el mapa" en
  `/panel/canchas/[id]/editar` para que el dueño pueda forzar un nuevo intento de
  geocodificación sin tener que cambiar el texto de la dirección (antes solo se
  regeocodificaba si la dirección/barrio cambiaban de valor).
- **Pendiente para el usuario**: crear la llave `GOOGLE_MAPS_SERVER_API_KEY` en Google
  Cloud Console (ver instrucciones en `.env.example`) y agregarla a `.env.local` y a
  las variables de entorno de producción (EasyPanel) — mientras no exista, la
  geocodificación seguirá fallando en producción por la misma restricción de referrer.

**Bug corregido (2026-08-19) — reserva fallaba con "Unexpected end of JSON input":**
`POST /api/bookings` llama a `createAdminClient()` (usa `SUPABASE_SERVICE_ROLE_KEY`)
para liberar cupos abandonados; si esa variable está vacía, `@supabase/supabase-js`
lanza una excepción no controlada y Next.js devuelve una respuesta sin cuerpo — el
navegador fallaba al hacer `res.json()`. Se corrigió envolviendo el handler en
try/catch para siempre devolver JSON con el error real. La causa de fondo era que
`SUPABASE_SERVICE_ROLE_KEY` no estaba puesta en `.env.local` — recordar copiarla desde
Supabase → Settings → API → "service_role secret" (nunca subirla a GitHub).

**Nueva funcionalidad (2026-08-19) — cancelación de reservas por el jugador:**
Antes no existía ninguna página donde un jugador viera sus propias reservas. Se
agregó `/reservas` ("Mis reservas", enlace nuevo en el navbar) donde el jugador ve
todas sus reservas y puede cancelar las que estén en `pending_payment` o `confirmed`,
siempre que falten más de 3 horas para el inicio, dando un motivo obligatorio. Igual
que con la aprobación de canchas, la regla de negocio (motivo obligatorio + ventana de
3 horas) está reforzada con un trigger de base de datos
(`enforce_booking_cancellation`, migración
`20260819000001_booking_cancellation_by_player.sql`) — no es solo una validación del
formulario. Nuevas columnas en `bookings`: `cancellation_reason`, `cancelled_at`,
`cancelled_by`. El dueño de cancha y el admin pueden cancelar sin esa restricción de
horario (mantenimiento, etc.), y el proceso automático que libera cupos no pagados
sigue funcionando igual (el trigger detecta que no hay `auth.uid()` — service role —
y no exige motivo ni ventana). El motivo de cancelación ahora se muestra también en
`/panel/reservas` (dueño) y `/admin/reservas` (admin).

**Nueva funcionalidad (2026-08-19) — calendario interactivo estilo Google Calendar:**
Los chips de `/panel/calendario` (reservas y bloqueos) ahora son interactivos vía
`components/calendar-event-chip.tsx`: al pasar el mouse muestra una vista previa
flotante resumida, y al hacer clic abre una tarjeta centrada con el detalle completo
(fecha larga, horario, sede/dirección, jugador y teléfono, precio para reservas; motivo
y rango de fechas para bloqueos). La página server-side ahora trae más columnas por
evento (venues, teléfono del jugador, total_price) para poder mostrar ese detalle sin
otra consulta. Se agregó `bogotaFechaLarga()` con el mismo patrón manual (sin
`Intl`/`toLocaleString`) que ya usa `slot-picker.tsx`, para evitar el mismo bug de
hydration mismatch entre servidor y navegador.

**Bug corregido (2026-08-19) — franja bloqueada se guardaba con la hora incorrecta:**
en `/panel/canchas/[id]/horarios`, el formulario "Cerrar una franja puntual" usa
`<input type="datetime-local">`, que devuelve texto sin zona horaria (ej.
"2026-08-23T09:14"). Antes se guardaba ese texto tal cual en la columna
`timestamptz` — Postgres lo interpretaba como UTC en vez de hora de Bogotá, así que
un bloqueo de "9:00 a 11:00 a.m." quedaba guardado como si fuera "9:00-11:00 UTC" (es
decir, 4:00-6:00 a.m. hora de Bogotá) — por eso el calendario mostraba una hora
distinta a la que el dueño escribió. Se corrigió con `bogotaLocalToUtcIso()` en esa
misma página, que convierte la hora local ingresada a UTC antes de guardarla (suma 5
horas). El bloqueo que ya estaba mal guardado en producción se corrigió directamente
en la base de datos.

Pendiente, con TODOs marcados en el código correspondiente:

1. ~~Fotos de canchas~~ — hecho: bucket `court-photos`, subida en
   `/panel/canchas/[id]/fotos` (hasta 6 fotos, se muestra en cards/detalle).
2. **Conexión real de Wompi**: el checkout ya está construido (`lib/wompi.ts`,
   `/reservas/[id]/pagar`) pero necesita las llaves reales del comercio
   (`WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`) — el usuario
   está creando su cuenta de comercio en https://comercios.wompi.co. Mientras tanto la
   página de pago muestra un aviso amigable en vez de romperse.
3. **Conexión real de WhatsApp Cloud API**: `lib/whatsapp.ts`, plantilla "utility"
   aprobada por Meta para el recordatorio (el cron `/api/cron/reminders` ya detecta
   qué reservas avisar, solo falta el envío real).
4. **Email transaccional en producción**: el SMTP por defecto de Supabase está
   limitado a ~2-3 correos/hora (solo sirve para pruebas). Antes de lanzar, configurar
   un proveedor propio (recomendado: Resend, plan gratis 3,000/mes) en Authentication →
   Settings → SMTP Settings del panel de Supabase.
5. **Ledger de payouts sin vínculo a reservas individuales**: `/admin/pagos` calcula
   "pendiente por pagar" sumando TODAS las reservas confirmadas y jugadas de un dueño,
   sin marcar cuáles ya se incluyeron en un payout anterior — si el admin registra dos
   pagos sin que pase suficiente tiempo entre uno y otro, puede contar dos veces las
   mismas reservas. Antes de operar con volumen real, agregar una tabla intermedia
   `payout_bookings` (booking_id, payout_id) para excluir lo ya liquidado.
6. **Variables de entorno que faltan por completar en `.env` real** (no en el ejemplo):
   `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API), `WOMPI_PUBLIC_KEY` /
   `WOMPI_INTEGRITY_SECRET` / `WOMPI_EVENTS_SECRET` (Wompi → Desarrolladores → Llaves,
   empezar en sandbox), `WHATSAPP_*` (Meta for Developers).

## Sistema de diseño

Paleta en `tailwind.config.ts`: `brand` (verde, gradiente principal `bg-brand-gradient`)
e `ink` (grises neutros para texto/fondos, en vez del `neutral` de Tailwind). Fuente:
pila de fuentes del sistema (`-apple-system`, `Segoe UI`, etc. en `tailwind.config.ts`)
— deliberadamente sin `next/font/google`, porque el build falló en el sandbox sin acceso
a fonts.googleapis.com; así evitamos esa fragilidad también en producción. Clases reutilizables
en `app/globals.css` con `@layer components`: `.btn-primary`, `.btn-secondary`, `.card`,
`.input`, `.badge`. Animaciones de entrada: `animate-fade-up` / `animate-fade-in`
(definidas en `tailwind.config.ts`). `components/dashboard-shell.tsx` es el layout
compartido de `/panel` y `/admin` (sidebar + `StatCard`). Mantener este sistema al
agregar páginas nuevas — no introducir colores o componentes sueltos que no sigan la
paleta `brand`/`ink`.

## Cómo desplegar en el VPS (VH Cloud, 2vCPU/4GB, con EasyPanel)

Ver `README.md`, sección 3 — el usuario despliega con **EasyPanel** (ya instalado en
su VPS), no con docker-compose manual. El `Dockerfile` de la raíz es compatible con
EasyPanel tal cual (build type: Dockerfile, puerto 3000). `docker-compose.yml` +
`nginx/` quedan como alternativa manual documentada en la sección 3-B, por si el
usuario deja EasyPanel en el futuro.

## Auditoría de seguridad (28/08/2026)

Se hizo una revisión completa (SAST + secretos + dependencias + config + storage) del
código y del despliegue en producción. Hallazgos y arreglos:

- **CRÍTICO — corregido**: la policy RLS `profiles_update_own` no tenía `with check`,
  así que cualquier usuario autenticado podía, con una llamada directa a la API de
  Supabase (sin pasar por la UI), poner su propio `role='admin'` o
  `is_approved_owner=true`. Se corrigió con el trigger `protect_profile_privilege_fields`
  (migración `20260828000001_security_hardening.sql`), que repone esos dos campos a su
  valor anterior salvo que quien edite ya sea admin — mismo patrón que ya se usaba para
  `courts.is_approved`.
- **MEDIO — corregido**: el bucket `court-photos` no tenía `file_size_limit` ni
  `allowed_mime_types` en Storage — la validación de `photo-uploader.tsx` es solo en el
  navegador y se salta con una llamada directa a la API. Ahora el bucket mismo limita a
  5MB y a `image/jpeg`, `image/png`, `image/webp`.
- **MEDIO — corregido**: no había ningún header de seguridad HTTP (CSP, HSTS,
  X-Frame-Options, etc.) — se agregaron en `next.config.ts` vía `headers()`.
- **MEDIO — corregido**: la verificación de firma del webhook de Wompi
  (`app/api/webhooks/wompi/route.ts`) y del secreto del cron de recordatorios
  (`app/api/cron/reminders/route.ts`) usaban `!==` para comparar strings, vulnerable a
  timing attack. Se cambiaron a `crypto.timingSafeEqual`.
- **BAJO — corregido**: se quitaron los tres bloques de `console.error`/`RUN echo` de
  diagnóstico temporal que quedaron activos en producción tras el despliegue
  (`lib/supabase/middleware.ts`, `lib/supabase/server.ts`, `Dockerfile`) — el de
  middleware corría en cada request.
- **PENDIENTE — acción manual del usuario**: `CRON_SECRET` sigue con el valor de
  ejemplo/placeholder en `.env.example` y en desarrollo (`dev-secret`). Hay que
  confirmar que en las variables de entorno de producción en EasyPanel tenga un valor
  aleatorio real (no el placeholder), y rotarlo si no.
- **Revisado, sin hallazgos**: `npm audit` sin vulnerabilidades; sin `eval`/
  `dangerouslySetInnerHTML`; sin secretos hardcodeados en el código; `.gitignore` cubre
  correctamente `.env`/`.env.local`; todas las páginas de `/panel` y `/admin` llaman
  `requireOwner()`/`requireAdmin()`.

## Documento de arquitectura y rediseño visual (28/08/2026)

Se entregó al usuario un Word (`Playmatch_Documento_de_Arquitectura.docx`) explicando
toda la app en términos no técnicos, con un checklist de qué falta antes de operar con
clientes reales (Wompi real, dominio, términos y condiciones, correo transaccional,
WhatsApp real, backups, monitoreo, rate limiting, etc. — ver el documento o el
resumen guardado en el proyecto de Claude).

También se hizo un primer rediseño visual (dirección: premium/confiable, estilo
Airbnb/Booking):
- Nuevas dependencias: `@phosphor-icons/react` (íconos) y `motion` (animaciones). Si
  clonas el repo de cero, corre `npm install` antes de `npm run build`.
- `components/sport-icon.tsx` es la fuente única del ícono de cada deporte — no
  vuelvas a poner emojis (⚽🎾🏐) sueltos en componentes nuevos, importa `SportIcon`.
- El hero de la homepage usa una foto de Unsplash como marcador de posición
  (`HERO_PHOTO` en `app/(public)/page.tsx`) — reemplázala por fotos reales de canchas
  cuando haya suficientes publicadas.
- El CSP de `next.config.ts` incluye `images.unsplash.com` en `img-src` por esa foto;
  si la reemplazas por otra fuente externa, actualiza el CSP o el navegador la
  bloquea.
- `components/how-it-works.tsx` es un Client Component con `motion/react` — patrón a
  seguir para futuras animaciones de scroll (usar `whileInView`, nunca
  `window.addEventListener("scroll")`).
- Quedó pendiente (fuera de alcance por ahora): íconos dentro de `<select>` nativos,
  marcadores del mapa de Google (limitación de la API), y el sidebar de `/admin`
  (herramienta interna).

## Asistente de IA "PlayMatch AI" (29/08/2026)

Primera fase del asistente conversacional (chat web), decidida con el usuario a
partir de una propuesta técnica externa que compartió. Decisiones tomadas:
proveedor OpenAI (function-calling), empezar por API + chat web, WhatsApp vía
n8n queda diseñado pero NO construido todavía (falta conectar WhatsApp Cloud
API, ver checklist del documento de arquitectura).

Principio de seguridad no negociable: **la IA nunca escribe en la base de
datos ni crea reservas directamente.** Solo puede llamar una herramienta de
solo lectura; para reservar, siempre entrega el link real a `/canchas/[id]`
donde el usuario completa el flujo ya existente (con su sesión, el candado de
15 minutos y el constraint anti-doble-reserva a nivel de base de datos). Si en
el futuro se agrega una herramienta que sí escriba (ej. crear reserva desde el
chat), debe reutilizar `app/api/bookings/route.ts` tal cual, nunca duplicar su
lógica de validación.

Piezas nuevas:
- `app/api/ai/canchas/buscar/route.ts` — endpoint de "herramienta" de solo
  lectura. Reutiliza `lib/availability.ts` (la misma función que usan
  `/buscar`, `/mapa` y `/canchas/[id]`) para calcular disponibilidad real por
  cancha en una fecha dada. No requiere sesión (info pública). Pensado para
  ser reutilizado después por el flujo de WhatsApp/n8n, no solo por el chat
  web — por eso no depende de nada específico del widget.
- `app/api/ai/chat/route.ts` — orquesta la conversación con `gpt-4o-mini` vía
  el SDK `openai`, con `buscar_canchas` como única tool disponible. Sin
  memoria en servidor: el cliente reenvía el historial en cada request (se
  recorta a los últimos 20 mensajes). Requiere `OPENAI_API_KEY` en el entorno
  del servidor (nunca `NEXT_PUBLIC_`).
- `components/ai-chat-widget.tsx` — burbuja de chat flotante, montada en
  `app/layout.tsx` (visible en toda la app, incluido `/panel` y `/admin` por
  ahora — no se filtró por ruta). Los links `/canchas/...` que devuelve la IA
  se convierten automáticamente en botones "Ver cancha y reservar".

Pendiente para activar en producción: agregar `OPENAI_API_KEY` en las
variables de entorno de EasyPanel (obtenerla en platform.openai.com). Sin esa
llave el endpoint responde 503 de forma controlada (no rompe el resto del
sitio). **Importante:** no se sobrescribió `.env.local` del usuario al
desplegar este cambio — el sandbox de desarrollo no tiene los secretos reales
(Supabase service role, Wompi, etc.), así que solo se le indicó agregar la
línea `OPENAI_API_KEY=` a mano para no arriesgar borrar sus llaves de
producción.

Siguiente fase (diseñada, no construida): workflow de n8n para WhatsApp —
nodo WhatsApp Trigger → nodo AI Agent (con las mismas tools, apuntando a
`/api/ai/canchas/buscar`) → nodo de respuesta WhatsApp. Se retoma cuando
WhatsApp Business Cloud API esté conectado.

## Auditoría de seguridad del asistente de IA (29/08/2026)

El usuario pidió revisar específicamente la capa de IA recién construida
(`/api/ai/chat`, `/api/ai/canchas/buscar`, `lib/ai-tools.ts`,
`components/ai-chat-widget.tsx`) con el skill **cyber-neo**, enfocado en que
son endpoints públicos sin autenticación que gastan dinero real (OpenAI) y
consultan Supabase. Hallazgos y arreglos:

- **ALTO — corregido**: ninguno de los dos endpoints (`/api/ai/chat`,
  `/api/ai/canchas/buscar`) tenía rate limit. Al ser públicos y sin sesión,
  cualquiera podía escribir un script en bucle contra ellos y (a) generarle a
  Playmatch una factura de OpenAI sin control, y (b) tumbar Supabase a punta
  de requests. Se agregó `lib/rate-limit.ts` (ventana deslizante en memoria,
  por IP vía `X-Forwarded-For`/`X-Real-IP`): 15 req/5min en `/api/ai/chat`,
  30 req/5min en `/api/ai/canchas/buscar`. Responde `429` con header
  `Retry-After`. **Limitación conocida**: es en memoria de un solo proceso —
  funciona bien porque Playmatch corre en una sola instancia (ver sección de
  despliegue), pero si en el futuro se escala a varias instancias detrás de
  un balanceador, cada una cuenta aparte y hay que migrar a un store
  compartido (Redis/Upstash). También se resetea en cada redeploy.
- **MEDIO — corregido**: no había tope de tamaño en la entrada del chat — un
  mensaje (o el array de mensajes) podía ser arbitrariamente grande,
  inflando el costo de tokens de OpenAI por request. Se agregó
  `MAX_MESSAGE_LENGTH = 800` caracteres por mensaje (se filtran los que se
  pasan) y se mantuvo el tope ya existente de 20 mensajes de historial. El
  input del widget (`ai-chat-widget.tsx`) ahora tiene `maxLength={800}` para
  dar feedback inmediato en vez de que el mensaje se descarte en silencio.
- **MEDIO — corregido**: `buscarCanchas()` no tenía tope de respuesta por
  llamada al modelo — se agregó `max_completion_tokens: 400` a la llamada de
  OpenAI para acotar el costo máximo de cada respuesta.
- **MEDIO — corregido**: amplificación de consultas — una búsqueda sin
  filtros calculaba disponibilidad para hasta 40 canchas, y cada una dispara
  3 consultas más a Supabase (horarios/cierres/reservas) — hasta 120
  consultas por un solo request HTTP. Se bajó el tope de candidatos de 40 a
  20 (`lib/ai-tools.ts`), reduciendo el fan-out máximo a la mitad; combinado
  con el rate limit, el costo total queda acotado.
- **BAJO — corregido (defensa en profundidad)**: se agregó una regla
  explícita al `SYSTEM_PROMPT` para que el modelo ignore cualquier
  instrucción incrustada en un mensaje de usuario o en el resultado de una
  herramienta que le pida cambiar sus reglas o revelar el system prompt
  (mitigación básica de prompt injection). El impacto real era bajo — el
  system prompt no contiene secretos y la única tool es de solo lectura —
  pero es buena práctica no depender solo de eso.
- **BAJO — corregido**: los errores del endpoint de chat se perdían en
  silencio (`catch {}` sin loguear) — ahora se hace `console.error` del error
  real antes de devolver el mensaje genérico al usuario, para poder
  diagnosticar desde los logs de EasyPanel si algo vuelve a fallar (esto fue
  justo lo que ocultó el bug del self-fetch que se corrigió en la sesión
  anterior).
- **Revisado, sin hallazgos**: no hay `dangerouslySetInnerHTML` ni
  interpolación insegura en el widget (el texto de la IA se renderiza como
  texto plano, los links se arman con JSX, no con HTML crudo); no hay CORS
  abierto (`Access-Control-Allow-Origin` no se setea en ningún lado, así que
  por defecto los endpoints solo aceptan same-origin); las herramientas de la
  IA solo leen, nunca escriben (ver principio de diseño en la sección de
  arriba); no hay secretos ni API keys expuestas al cliente (`OPENAI_API_KEY`
  solo se lee server-side).
- **PENDIENTE — decisión futura, no crítico ahora**: si el volumen de
  visitas crece mucho, considerar mover el rate limit a un store compartido
  y/o agregar un límite de gasto mensual configurable en la cuenta de OpenAI
  (platform.openai.com → Billing → límites de uso) como última línea de
  defensa contra abuso sostenido.

## Pentest externo de caja negra con Argus (01/10/2026) + CRÍTICO hallado aparte

Al corregir los hallazgos de Argus se revisó `npm audit` (no lo cubre un scan
de caja negra) y apareció algo más grave que todo el reporte de Argus junto:
**Next.js 16.3.1 (la versión pineada del proyecto) tiene una vulnerabilidad
CRÍTICA de ejecución remota de código no autenticada** (RCE en servidores
Windows, en la API de optimización de imágenes con AVIF, y en
`next/og ImageResponse` — GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4,
GHSA-vcvr-r3jv-pc5j), parchada en **16.3.8**. Se actualizó
`package.json`/`package-lock.json` a `next@16.3.8` (mismo major/minor, sin
cambios de API) y se verificó `tsc --noEmit` + `npm run build` limpios tras
el cambio. **Acción para el usuario**: después del próximo `git pull` en el
VPS, el build de EasyPanel instalará automáticamente la 16.3.8 (ya está en
`package.json`) — no requiere ninguna variable de entorno nueva.

También quedó un hallazgo de severidad alta sin corregir, a propósito:
`braces`/`chokidar`/`tailwindcss` (cadena de dependencias de desarrollo, no
de runtime) tiene una DoS de agotamiento de pila con patrones glob muy
anidados — el único fix disponible es saltar a `tailwindcss@4.x`, que el
proyecto evita deliberadamente (ver sección de Stack, cambia el modelo de
configuración). Riesgo real bajo porque es una dependencia de build, no
expuesta a input de un atacante en producción. Revisar si en algún momento
se decide migrar a Tailwind 4.

Reporte de Argus en sí (hallazgos propios del scan externo):

El usuario corrió "Argus" (herramienta de recon/pentest tipo Kali) contra la
producción y pegó los dos reportes crudos (infraestructura + aplicación web).
Triage hallazgo por hallazgo:

**Reales, corregidos en esta sesión:**
- **CSP sin `object-src`** (marcado ALTO por el analizador de CSP de Argus en
  las 8 páginas rastreadas): sin esa directiva, un atacante que lograra
  inyectar HTML podría cargar un `<object>`/`<embed>` para ejecutar código,
  sorteando `script-src`. Se agregó `object-src 'none'` en `next.config.ts`
  — costo cero porque la app no usa esos tags.
- **Campos de login/registro sin `autocomplete`** (hallazgo menor del
  "Autocomplete Vulnerability Checker"): se agregó `autoComplete="email"` /
  `"current-password"` (login) y `"email"` / `"new-password"` / `"name"`
  (registro) en `app/(auth)/login/page.tsx` y `app/(auth)/registro/page.tsx`.

**Reales pero fuera del código (acción manual o aceptados conscientemente):**
- `script-src` sigue con `'unsafe-inline'` — Next.js inyecta scripts/estilos
  inline en el App Router y quitarlo sin nonces/hashes rompería la app;
  migrar a nonces es un cambio más grande que requiere pruebas dedicadas, no
  se hizo en esta pasada. Queda como mejora futura si se quiere endurecer más.
- `npm audit` reporta 9 altas / 1 crítica tras un `npm install` limpio en
  esta sesión — no se tocó en esta pasada (fuera del alcance del reporte de
  Argus, que es caja negra externa); revisar con `npm audit` y aplicar
  `npm audit fix` con cuidado (probar build después) en la próxima sesión.
- `CRON_SECRET`/secretos reales en EasyPanel: sigue pendiente de que el
  usuario confirme valores no-placeholder (ver auditoría de 28/08/2026).

**Falsos positivos / artefactos de la herramienta (sin acción, explicado al
usuario):**
- "Cifrados TLS 1.3 débiles" (tabla larga con CAMELLIA/SEED/SRP/PSK/anon-DH
  etc.): TLS 1.3 solo soporta 3 cifrados AEAD fijos
  (`TLS_AES_128_GCM_SHA256`, `TLS_AES_256_GCM_SHA384`,
  `TLS_CHACHA20_POLY1305_SHA256`) — esos nombres ni existen en TLS 1.3, es un
  bug de etiquetado de Argus, no un hallazgo real.
- Detección de CMS como "OpenCart"/"Joomla": la app es Next.js a medida, no
  usa ningún CMS — falso positivo de coincidencia genérica de firmas.
- "Hidden parameter discovery" (24 "hits"): Next.js responde con una página
  de tamaño similar a cualquier query string arbitrario; no implica que el
  valor se refleje sin escapar en el HTML. No se verificó la respuesta cruda
  pero es el patrón típico de falso positivo de esta clase de scanner —
  revisar solo si se quiere confirmar al 100%.
- Fuzzing de subdominios (26 probados, todos 404 legítimos): no hay
  exposición real, los subdominios simplemente no existen.
- Reverse-IP mostrando otro dominio no relacionado en la misma IP: esperado
  en hosting compartido (EasyPanel/VPS), no es una mala configuración de
  Playmatch.
- Enumerador de métodos HTTP marcando PUT/DELETE/PATCH/OPTIONS como
  "soportados" en casi todas las rutas: las páginas de Next.js (App Router)
  solo implementan `GET` — lo más probable es que el servidor/framework
  responda genéricamente (ej. 405) y la herramienta lo cuente como "método
  disponible" sin verificar el código de estado real. No se confirmó código
  por código pero no hay rutas de página con handlers de escritura expuestos
  fuera de las APIs explícitas (`/api/...`), que sí están protegidas.

## Recuperación de contraseña ("olvidé mi contraseña") (04/10/2026)

No existía ningún flujo para que un usuario (jugador, dueño o admin — todos
usan la misma pantalla `/login`) recuperara su cuenta si olvidaba la
contraseña. Se construyó usando el mecanismo nativo de Supabase Auth (no se
guarda ni se puede leer la contraseña real — Supabase solo guarda el hash,
ver conversación con el usuario sobre por qué una contraseña nunca se puede
"dar" directamente):

- `/login` ahora tiene un link "¿Olvidaste tu contraseña?" junto al campo de
  contraseña.
- `/recuperar` — formulario de un solo campo (correo). Llama a
  `requestPasswordReset()` en `app/(auth)/actions.ts`, que usa
  `supabase.auth.resetPasswordForEmail()` con `redirectTo` apuntando a
  `/auth/callback?next=/actualizar-contrasena`.
- `/recuperar/revisa-tu-correo` — mensaje genérico de confirmación.
- `/actualizar-contrasena` — formulario para la contraseña nueva. Llama a
  `updatePassword()`, que usa `supabase.auth.updateUser({ password })`
  **sobre la sesión temporal** que Supabase crea automáticamente cuando el
  usuario abre el link del correo (el mismo `app/auth/callback/route.ts` que
  ya existía para la confirmación de registro se reutiliza tal cual — no se
  tocó ese archivo).

**Decisiones de seguridad explícitas:**
- `requestPasswordReset()` **siempre** redirige al mismo "revisa tu correo",
  exista o no esa cuenta, y aunque el rate limit la haya bloqueado — si
  respondiera distinto en cada caso, el formulario se podría usar para
  averiguar qué correos están registrados en Playmatch (enumeración de
  usuarios).
- Tiene su propio rate limit (`lib/rate-limit.ts`, reutilizado): 5
  solicitudes cada 15 minutos por IP, para que no se pueda usar para
  mandar spam de correos a una bandeja ajena en bucle.
- `updatePassword()` depende de que haya sesión activa (la crea el link del
  correo); si no la hay (link vencido o ya usado), redirige a `/login` con
  un mensaje claro en vez de fallar feo.

**Pendiente — ya no es solo "bonito tenerlo", ahora es urgente**: el SMTP
por defecto de Supabase (~2-3 correos/hora) ahora lo comparten DOS flujos
(confirmación de registro + recuperación de contraseña). Configurar un
proveedor real (Resend, gratis hasta 3,000/mes) antes de que esto cause que
gente no pueda entrar a su cuenta en un día con varios registros/reseteos a
la vez.

## Revisión de arquitectura, seguridad e infraestructura (04/10/2026)

El usuario pidió una revisión completa en rol de "arquitecto experto" —
código, seguridad, infraestructura, y qué tan lista está la app para
crecer/escalar. Se usaron los advisors automáticos de seguridad y
rendimiento de Supabase (`mcp__Supabase__get_advisors`) contra la base de
datos real de producción, más revisión manual del Dockerfile/docker-compose/
Nginx/GitHub Actions. Reporte completo entregado al usuario como
`PLAYMATCH_REVISION_ARQUITECTURA_2026-10-04.md` — resumen de lo accionado:

**Aplicado directo en producción (vía Supabase MCP, sin necesitar deploy de
la app):** migración `20261004000001_perf_and_security_hardening_argus_followup.sql`
— agrega 9 índices en columnas de llave foránea que no los tenían (afectan
rendimiento a medida que crece el volumen de reservas/canchas, no se nota
hoy) y revoca `EXECUTE` público sobre 4 funciones de trigger
(`handle_new_user`, `protect_court_approval`,
`protect_profile_privilege_fields`, `enforce_booking_cancellation`) que
quedaban listadas como endpoints RPC públicos sin necesidad (Postgres ya
impedía llamarlas directo por ser `returns trigger`, así que no eran
explotables, pero es higiene correcta cerrar esa puerta). **Importante:**
`current_role()` (también `security definer`) NO se tocó — se verificó que
16 policies de RLS la llaman activamente bajo `anon`/`authenticated`;
revocarle el `EXECUTE` habría roto el acceso a toda la app.

**Pendiente, identificado y priorizado (no se tocó esta sesión por riesgo/alcance):**
- Activar "leaked password protection" en Supabase Auth — acción manual del
  usuario en el dashboard, 2 minutos, sin código.
- 16 policies de RLS re-evalúan `auth.uid()` fila por fila en vez de
  `(select auth.uid())` — optimización real pero requiere reescribir cada
  policy con cuidado y probar que el control de acceso no cambie; queda para
  una sesión dedicada a base de datos, no para hacer de pasada.
- 5 tablas con policies de `SELECT` duplicadas (público + dueño) que podrían
  consolidarse en una sola con `OR` — mismo caso, mismo momento.
- Se encontró `.github/workflows/deploy.yml` — un mecanismo de despliegue
  por SSH + docker-compose, *distinto* del que el usuario realmente usa
  (EasyPanel manual). No se sabe si sigue activo (depende de si los
  secretos de GitHub siguen configurados) — el usuario debe revisarlo y
  desactivarlo si no se usa, para evitar un despliegue fantasma compitiendo
  con EasyPanel.
- Sin pruebas automatizadas en todo el repo — deuda técnica real, no
  bloqueante hoy pero el primer punto que se vuelve riesgoso si el proyecto
  crece.

**Veredicto de arquitectura para crecer/escalar**: el diseño actual no
encierra al proyecto — JWT sin estado de sesión en servidor, base de datos
ya separada de la app (Supabase), `output: "standalone"` en Next.js — todo
compatible con correr varias instancias detrás de un balanceador el día que
haga falta. Los únicos bloqueos reales hoy son el rate limit del chat en
memoria de un solo proceso (ya documentado) y la falta de una caché
compartida — ninguno de los dos urgente con el tráfico actual, pero ambos
quedan identificados para cuando el tráfico crezca de verdad.

## Bug de redirecciones detrás del proxy + endurecimiento de recuperación (06/10/2026)

**Causa raíz del "link de recuperación no funciona":** los Route Handlers
(`app/auth/callback`, `app/auth/recuperar-callback`) redirigían con
`new URL(request.url).origin`. En producción Next.js corre en un contenedor
Docker detrás del proxy de EasyPanel, y ahí `request.url` trae el nombre
INTERNO del contenedor (ej. `https://134e426ea6db:3000`), no el dominio
público. Resultado: el link validaba el código y dejaba la sesión iniciada,
pero redirigía a una dirección inexistente; al volver al dominio a mano el
usuario quedaba logueado sin haber puesto contraseña. Se reprodujo localmente
(standalone con `HOSTNAME=134e426ea6db`) antes de corregir.

**Regla:** NUNCA usar `request.url`/`origin` para armar redirecciones. Usar
`getPublicOrigin(request)` de `lib/public-url.ts` (prefiere
`NEXT_PUBLIC_APP_URL`). Las redirecciones del middleware con
`request.nextUrl.clone()` salen relativas y sí funcionan.

**También corregido en la misma auditoría:**
- Open redirect: `/auth/callback?next=@evil.com` y el `next` de `signIn`
  permitían mandar al usuario a otro dominio. Ahora pasan por `safeNextPath()`.
- Sesión de recuperación: al validar el link se pone la cookie httpOnly
  `pm_password_recovery`; mientras exista, el middleware solo permite
  `/actualizar-contrasena` (además de `/auth/*` y `/api/*`). Al guardar la
  contraseña nueva se hace `signOut()` y se pide entrar con la contraseña
  nueva; hay botón "Cancelar" (`cancelPasswordRecovery`). Así una sesión
  obtenida por el link del correo nunca sirve para navegar la cuenta.
- Formulario: confirmación de contraseña y mínimo 8 caracteres (servidor).

**Nota de uso:** el link de recuperación usa PKCE — debe abrirse en el MISMO
navegador/perfil donde se pidió. Edge con "cambio automático de perfil" puede
abrirlo en otro perfil; en ese caso ahora se muestra un mensaje claro.

## Auditoría OWASP Top 10 (cyber-neo) + cambio de mapa (06/10/2026)

**Aplicado directo en Supabase** (migración `20261006000001_booking_integrity_and_auth_fixes.sql`,
probada con ataques simulados antes y después):
- **CRÍTICO (A01)** — un jugador podía, llamando la API de Supabase directo,
  crear reservas `confirmed` a $0 o auto-confirmar/cambiar precio de las suyas;
  un dueño podía inflar `owner_payout_amount`. Ahora el trigger
  `protect_booking_integrity` es la autoridad: en INSERT fuerza
  `pending_payment`, recalcula precio/comisión desde la cancha y valida cancha
  activa+aprobada, horario futuro, duración múltiplo del slot, dentro del
  horario semanal (hora Bogotá) y sin cierres. En UPDATE de jugador/dueño solo
  permite cancelar. Service role (webhook, cron, liberación de cupos) y admin
  no se restringen. **Si cambias COMMISSION_RATE en app/api/bookings, cámbialo
  también en el trigger.**
- Admin no podía aprobar/rechazar dueños (faltaba policy UPDATE para admin en
  `profiles`) → policy `profiles_admin_update`.
- Registrarse como dueño no tenía efecto → `handle_new_user` lee
  `raw_user_meta_data.wants_owner` (signUp lo envía; sigue requiriendo aprobación).
- Funciones de trigger seguían ejecutables vía RPC (EXECUTE a PUBLIC) → revocado.

**En código:**
- **CRÍTICO** webhook Wompi: con `WOMPI_EVENTS_SECRET` vacío cualquiera podía
  falsificar un pago aprobado. Ahora sin secreto responde 503; además valida
  monto+moneda contra la reserva y solo confirma desde `pending_payment`.
- Cron: exige `CRON_SECRET` real (≥16 caracteres).
- **ALTO (A03, XSS almacenado)** en el mapa: el globo insertaba el nombre de
  la cancha como HTML. Ahora se arma con `textContent` (verificado con payload
  `<img onerror>`: no se ejecuta).
- /api/bookings valida fechas y devuelve 400 con el mensaje del trigger (P0001).
- Registro y nueva contraseña: mínimo 8 caracteres.
- `.dockerignore` creado (NO excluye `.env`: EasyPanel lo necesita en el build).
- Eliminado `.github/workflows/deploy.yml` (deploy SSH/docker-compose que no se
  usa; el despliegue real es EasyPanel).

**Mapa:** Google Maps (navegador) reemplazado por **Leaflet 1.9.4 + teselas de
OpenStreetMap**: sin llave, sin facturación. Atribución obligatoria visible.
Si el tráfico crece, cambiar de proveedor con `NEXT_PUBLIC_MAP_TILE_URL` /
`NEXT_PUBLIC_MAP_ATTRIBUTION` (el CSP se ajusta solo en next.config.ts).
Geocodificación (`lib/geocoding.ts`): Google solo si existe
`GOOGLE_MAPS_SERVER_API_KEY`, si no Nominatim (gratis; User-Agent propio,
≤1 req/s, solo al guardar una cancha; fallback a barrio/comuna).
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` ya no se usa.

**Pendiente / aceptado:** `script-src 'unsafe-inline'` (requiere nonces);
dependencias de build con alertas (Tailwind 3 / eslint-config-next, no llegan
a runtime); activar "Leaked password protection" en Supabase Auth (manual);
el repo de GitHub es PÚBLICO (considerar hacerlo privado); la llave de Google
Maps del navegador quedó en el historial público de git → borrarla en Google
Cloud ya que no se usa.

## Panel del dueño: KPIs + mini-CRM + reservas manuales (06/10/2026)

Solo se AGREGÓ (pedido explícito del usuario: "agrega, no modifiques").
- **BD** (migración `20261006000002_owner_crm_and_manual_bookings.sql`, ya
  aplicada): tabla `owner_customers` (RLS: solo su dueño); `bookings.source`
  (`online`|`manual`), `customer_id`, `payment_method`. El trigger
  `protect_booking_integrity` tiene rama manual: solo el dueño de la cancha,
  `player_id = auth.uid()`, cliente propio, ≤12h, inicio ≥ hace 7 días;
  queda `confirmed` con comisión 0 y payout = total. El anti-traslape aplica
  igual. Policy `profiles_owner_reads_customers`: el dueño ve el perfil de
  quien reservó sus canchas.
- **Reglas**: las reservas manuales NO cuentan para pagos/liquidaciones
  (`.eq("source","online")` en `/panel/pagos`, `/admin/pagos`, "Por cobrar"
  del resumen), ni en "Mis reservas" del jugador, ni en el cron de
  recordatorios. Cualquier consulta nueva de dinero debe filtrar igual.
- **Código**: `lib/owner-metrics.ts` (KPIs, funciones puras), `lib/owner-data.ts`,
  `lib/owner-crm.ts`, `components/owner/*`, `app/(owner)/panel/crm-actions.ts`,
  `/panel/clientes` y `/panel/clientes/[key]` (key `c-<owner_customer>` o
  `p-<profile>`). Resumen: sección "Indicadores del negocio" (periodo
  `?periodo=7|30|90|mes`). Calendario: botón "+ Reserva manual" (`?nueva=1`
  lo abre). Gráficos en SVG propio, sin librerías.
- **Bug corregido**: "Por cobrar" del resumen contaba reservas futuras.

## Bloquear horario desde el calendario (06/10/2026)

Botón "🔒 Bloquear horario" en `/panel/calendario` (`components/owner/block-dialog.tsx`
+ `app/(owner)/panel/block-actions.ts`): motivo (escuela, evento, torneo,
mantenimiento, otro), nota, una vez o cada semana (días + rango, máx. 6 meses).
Cada franja es una fila normal de `court_closures` (la respeta toda la app sin
cambios); migración `20261006000003` solo agrega `category` y `series_id` (una
serie por cancha). Las franjas que chocan con reservas vigentes se SALTAN (se
avisa antes; nunca se cancela a nadie). Al hacer clic en un bloqueo: "Quitar
solo este día" / "Quitar este y los siguientes". La RLS `closures_owner_write`
limita crear/borrar al dueño. Ojo: `reason` es de lectura pública (policy
`closures_public_read`), no poner datos personales en la nota. El bloqueo
desde Mis canchas → Horarios sigue igual.

## Reglas para quien continúe este proyecto

- No reescribir el esquema de base de datos sin revisar `supabase/migrations/` primero
  — ya está aplicado en producción (proyecto Supabase `qtkudukcmjypjsvsxpvl`).
- El constraint anti-doble-reserva vive en la base de datos, no lo dupliques en el
  código de la app — solo maneja el error 409 que devuelve.
- La comisión (10%) está hardcodeada en `app/api/bookings/route.ts` como
  `COMMISSION_RATE`. Si se vuelve configurable, moverla a una tabla `settings`.
- Cualquier versión nueva de librería: verificar en vivo (`npm view <paquete> version`)
  antes de pinearla — nunca de memoria.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
