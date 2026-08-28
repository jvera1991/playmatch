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
