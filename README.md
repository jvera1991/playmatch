# Playmatch

Marketplace de reservas de canchas sintéticas (fútbol, pádel, vóley) en Medellín.

## 0. Crear tu primer usuario administrador

Todavía no existe ningún admin — hay que crear el primero a mano, una sola vez:

1. Regístrate normalmente en `/registro` (elige "Quiero reservar canchas", no importa
   cuál elijas, lo vamos a cambiar).
2. Confirma tu correo (revisa la bandeja de entrada).
3. Ve al SQL Editor de tu proyecto en Supabase
   (https://supabase.com/dashboard/project/qtkudukcmjypjsvsxpvl/sql/new) y corre:

   ```sql
   update public.profiles set role = 'admin' where id =
     (select id from auth.users where email = 'tu-correo@ejemplo.com');
   ```

Desde ese momento, con esa cuenta vas a ver el enlace "Admin" en la barra superior y
podrás aprobar a los dueños de cancha que se vayan registrando.

## 1. Desarrollo local

```bash
npm install
cp .env.example .env.local   # ya viene con la URL y la llave pública de Supabase
npm run dev
```

Abre http://localhost:3000

## 2. Subir el código a tu GitHub (primera vez)

1. Entra a https://github.com/new y crea un repositorio vacío llamado `playmatch`
   (no marques "Add README" ni ".gitignore" — ya los trae este proyecto).
2. En tu terminal, dentro de esta carpeta:

```bash
git init
git add .
git commit -m "Primera versión de Playmatch"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/playmatch.git
git push -u origin main
```

De ahí en adelante, cada vez que quieras subir cambios: `git add .`, luego
`git commit -m "descripción del cambio"`, luego `git push`.

## 3. Desplegar en tu VPS con EasyPanel (recomendado — es lo que ya tienes instalado)

EasyPanel ya te resuelve el reverse proxy, el certificado SSL gratis y los reinicios
automáticos, así que no necesitas los archivos `docker-compose.yml` / `nginx/` de este
repo para este camino (esos quedan como respaldo en la sección 3-B, por si algún día
te sales de EasyPanel).

1. En el panel de EasyPanel, crea un **nuevo proyecto** (ej. "playmatch").
2. Dentro del proyecto, crea un **nuevo servicio → App**.
3. En "Source", elige **GitHub**, conecta tu cuenta si no lo has hecho, y selecciona
   el repositorio `jvera1991/playmatch`, rama `main`.
4. En "Build", EasyPanel detecta el `Dockerfile` de la raíz automáticamente — déjalo
   así (Build type: Dockerfile).
5. En **"Environment"**, pega el contenido completo de tu `.env` (todas las variables
   que ya llenaste: Supabase, Wompi cuando lo actives, etc.) — EasyPanel las inyecta
   como variables de entorno del contenedor.
6. En **"Domains"**, agrega tu dominio (ej. `playmatch.co`), apunta el registro DNS
   tipo A de tu dominio hacia la IP de tu VPS, y activa el interruptor de HTTPS —
   EasyPanel genera el certificado Let's Encrypt automáticamente.
7. En **"Deploy Trigger"**, activa el despliegue automático por cada `git push` a
   `main` (EasyPanel te da una URL de webhook, o usa su integración nativa de GitHub
   si te la ofrece — con eso no necesitas el archivo `.github/workflows/deploy.yml`
   de este repo, es una alternativa a él).
8. Dale click a **Deploy**. En unos minutos tu sitio queda en `https://playmatch.co`.

Cada vez que hagas `git push` a `main` desde tu computador, EasyPanel reconstruye y
despliega solo.

### 3-B. Alternativa manual (sin EasyPanel) — solo si la necesitas

Este repo también trae `docker-compose.yml` + `nginx/playmatch.conf` + Certbot para
desplegar sin ningún panel, a puro Docker y SSH. Úsalo solo si en algún momento dejas
de usar EasyPanel:

```bash
curl -fsSL https://get.docker.com | sh
mkdir -p /opt/playmatch && cd /opt/playmatch
git clone https://github.com/jvera1991/playmatch.git .
cp .env.example .env && nano .env
docker compose up -d --build app nginx
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d playmatch.co -d www.playmatch.co --email tu-correo@ejemplo.com --agree-tos
docker compose restart nginx && docker compose up -d certbot
```

Y para el despliegue automático manual, `.github/workflows/deploy.yml` ya está listo
— solo necesitas crear 3 secretos en GitHub (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`)
en **Settings → Secrets and variables → Actions**.

## 5. Variables de entorno que necesitas conseguir

- **Wompi**: crea una cuenta de comercio en https://comercios.wompi.co, empieza en modo
  sandbox (pruebas) y copia tus llaves desde Desarrolladores → Llaves API.
- **WhatsApp Cloud API**: crea una app en https://developers.facebook.com, agrega el
  producto "WhatsApp", verifica tu negocio y copia el `Phone Number ID` y el
  `Access Token`.
- **Google Maps — dos llaves, no una** (importante, ya causó un bug real): en
  https://console.cloud.google.com, crea (o usa) un proyecto y habilita
  **"Maps JavaScript API"** y **"Geocoding API"**.
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — la llave que dibuja el mapa en el navegador.
    Restríngela por "HTTP referrer" a tu dominio real (Credenciales → tu llave →
    Restricciones de la aplicación → Sitios web → agrega `https://playmatch.co/*` y,
    si sigues probando en local, `http://localhost:3000/*`).
  - `GOOGLE_MAPS_SERVER_API_KEY` — llave **separada** que el servidor usa para
    convertir la dirección de una cancha en coordenadas (geocodificación) cuando el
    dueño la publica o edita. Debe crearse SIN restricción de "HTTP referrer" (usa
    "Ninguna", o "Direcciones IP" con la IP de este VPS) — Google rechaza las
    llamadas del servidor si la llave tiene restricción de referrer, porque esas
    llamadas no llevan el header de navegador. Restringida solo a "Geocoding API" en
    "Restricciones de API". Detalle completo en `.env.example`.
  - Las dos deben ir en el `.env`/variables de entorno de producción — nunca poner
    solo una de las dos.

## 6. Base de datos

Ya está creada y en producción en Supabase — no hace falta instalar Postgres en el
VPS. Panel: https://supabase.com/dashboard/project/qtkudukcmjypjsvsxpvl

## Siguiente paso recomendado

Lee `CLAUDE.md` — ahí está la lista completa de lo que falta construir (fase 1) para
tener el MVP funcionando de punta a punta: autenticación, subida de fotos, calendario
de disponibilidad, checkout de Wompi real, envío real de WhatsApp y el panel admin.
