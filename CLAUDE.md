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
automática de la dirección al publicar una cancha (`lib/geocoding.ts`).

**Bug corregido (2026-08-18):** el trigger `on_auth_user_created` que crea el
`profile` al registrarse existía como función pero nunca se conectó a
`auth.users` — cada cuenta nueva se creaba sin perfil (navbar roto, sin acceso a
paneles). Se corrigió con la migración `20260818000005_fix_missing_new_user_trigger.sql`,
que también rellena el perfil de las cuentas que ya se habían visto afectadas.
Si en el futuro una cuenta nueva vuelve a aparecer "sin rol", revisar primero que
este trigger siga existiendo (`select * from pg_trigger where tgname = 'on_auth_user_created'`).

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
