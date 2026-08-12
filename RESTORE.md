# 🐾 Animaldex — Guía de restauración del proyecto

Esta guía existe para poder **reconstruir todo el proyecto desde cero en
minutos**, sin depender de ningún link de preview temporal.

Guarda este archivo y el `.tar.gz` que lo acompaña en un lugar seguro
(Google Drive, un repositorio privado, etc.).

---

## 🌐 Hosting web: Cloudflare Pages (ya NO depende de Vercel)

El sitio web se migró por completo de Vercel a **Cloudflare Pages**,
desplegado directamente vía `wrangler` (sin ninguna herramienta externa
intermedia que pueda fallar o expirar sesión).

| Recurso | Valor |
|---|---|
| **URL del sitio** | `https://animaldex-web.pages.dev` |
| **Proyecto Cloudflare Pages** | `animaldex-web` |
| **Script de deploy** | `scripts/deploy-cf-pages.sh` |

### Cómo desplegar la web (de ahora en adelante)

```bash
export CLOUDFLARE_API_TOKEN=xxxxx   # con permiso "Cloudflare Pages: Edit"
export CLOUDFLARE_ACCOUNT_ID=76a9bc649184dfbf09c0b4319bcaa85b
bash scripts/deploy-cf-pages.sh
```

Ese script automatiza todo:
1. Borra `dist/` (expo export lo regenera desde cero cada vez).
2. Corre `npx expo export --platform all`.
3. Copia `cf-pages-worker.src.js` → `dist/_worker.js` (necesario para
   que las vistas previas de enlaces en WhatsApp/Facebook sigan
   funcionando — ver sección siguiente).
4. Corre `npx wrangler pages deploy dist --project-name animaldex-web`.

### Vistas previas de enlaces (Open Graph) — reemplaza middleware.js/api/og.js de Vercel

El archivo **`cf-pages-worker.src.js`** (en la raíz del proyecto) es la
fuente de verdad: un único Cloudflare Worker en "modo avanzado" que:
- Detecta bots de WhatsApp/Facebook/Twitter/etc. por User-Agent.
- Si el bot visita `/p/:id`, `/pet/:id`, `/a/:id`, `/m/:id` o `/`, genera
  HTML con meta-etiquetas Open Graph (foto + título), consultando datos
  reales a D1 vía la API HTTP de Cloudflare (usa el secreto `CF_D1_TOKEN`
  configurado en el proyecto de Pages).
- Si es un usuario normal, sirve los archivos estáticos de la SPA, con
  fallback a `index.html` para rutas sin archivo (ej. `/alertas`,
  `/mercado`), igual que hacía el `rewrites` de `vercel.json`.

Este archivo se debe **copiar manualmente a `dist/_worker.js` en cada
deploy** (por eso el script lo hace automático) — `expo export` no lo
conoce ni lo toca.

**Secretos configurados en el proyecto de Pages** (no viven en el código):
```bash
npx wrangler pages secret list --project-name animaldex-web
# CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_D1_TOKEN
```
Si hay que recrearlos:
```bash
echo "76a9bc649184dfbf09c0b4319bcaa85b" | npx wrangler pages secret put CF_ACCOUNT_ID --project-name animaldex-web
echo "c0ae095d-b9a5-4acd-b500-8a9c2be03010" | npx wrangler pages secret put CF_D1_DATABASE_ID --project-name animaldex-web
echo "TU_TOKEN_CON_PERMISO_D1_EDIT" | npx wrangler pages secret put CF_D1_TOKEN --project-name animaldex-web
```

### Si hay que recrear el proyecto de Pages desde cero

```bash
export CLOUDFLARE_API_TOKEN=xxxxx
export CLOUDFLARE_ACCOUNT_ID=76a9bc649184dfbf09c0b4319bcaa85b
npx wrangler pages project create animaldex-web --production-branch main
# luego configurar los 3 secretos de arriba, y correr scripts/deploy-cf-pages.sh
```

> ⚠️ **Importante:** el `wrangler.toml` de la raíz del proyecto pertenece
> al Worker del backend (`animaldex-api`), NO al sitio de Pages. Nunca
> agregar `pages_build_output_dir` a ese archivo — `wrangler pages`
> tampoco admite un archivo de configuración en ruta personalizada, así
> que ambos despliegues (`wrangler deploy` para el Worker, `wrangler
> pages deploy` para el sitio) se mantienen deliberadamente separados y
> sin interferirse.

---

## 📦 Contenido del respaldo

El archivo `animaldex-backup.tar.gz` contiene **todo el código fuente**
necesario para reconstruir la app:

- `App.tsx`, `app.json`, `eas.json`, `package.json`, `tsconfig.json`
- `screens/`, `components/`, `lib/` (frontend Expo/React Native)
- `worker/`, `wrangler.toml` (backend Cloudflare Worker)
- `cf-pages-worker.src.js`, `scripts/deploy-cf-pages.sh` (frontend web /
  OG tags para bots — Cloudflare Pages)
- `assets/` (íconos, logo, imágenes)

**NO incluye** (por seguridad y porque se regeneran solos):
- `node_modules/` → se recrea con `npm install`
- `.git/` → se recrea con `git init`
- `dist/` → se recrea con el script de deploy
- Tokens/API keys → nunca deben viajar dentro de un archivo descargable público

---

## 🗂️ Datos clave del proyecto (para no perderlos)

| Recurso | Valor |
|---|---|
| **Repo GitHub** | `https://github.com/clientenetflix0001-lgtm/animaldex` |
| **Cuenta Expo/EAS** | `lucasap123` (email: clientenetflix0001@gmail.com) |
| **EAS Project ID** | `f2b4eacd-6e1a-4dbc-89cd-b65598756451` |
| **EAS Project slug** | `@lucasap123/animaldex` |
| **EAS Update URL** | `https://u.expo.dev/f2b4eacd-6e1a-4dbc-89cd-b65598756451` |
| **Canales EAS Update** | `preview`, `production` |
| **Android package** | `com.lucasap123.animaldex` |
| **iOS bundle id** | `com.lucasap123.animaldex` |
| **Cuenta Cloudflare** | `Clientenetflix0001@gmail.com's Account` |
| **Cloudflare Account ID** | `76a9bc649184dfbf09c0b4319bcaa85b` |
| **Worker (backend)** | `animaldex-api` → `https://animaldex-api.animaldex-api.workers.dev` |
| **Base de datos D1** | `animaldex-db` (id: `c0ae095d-b9a5-4acd-b500-8a9c2be03010`) |
| **Cloudflare Images delivery hash** | `8m1UaEl3HZU-HEHN3G4Exg` |
| **Sitio web (Cloudflare Pages)** | `https://animaldex-web.pages.dev` |

> ⚠️ **El backend (Worker + D1) es independiente del frontend web.**
> Mientras no se toque `wrangler.toml`/`worker/index.js` ni se borre el
> Worker o la base de datos en Cloudflare, los datos de usuarios/mascotas/
> publicaciones **siempre estarán a salvo**, sin importar qué le pase al
> hosting del sitio web.

---

## 🔑 Credenciales necesarias (pídeselas al asistente o gestiónalas tú mismo)

Estas **NO** están en el backup por seguridad. Se generan así:

1. **Cloudflare API Token** → https://dash.cloudflare.com/profile/api-tokens
   → "Create Custom Token" con permisos: **Cloudflare Pages: Edit**,
   **Workers Scripts: Edit**, **D1: Edit** (los tres, para no tener que
   generar tokens distintos para cada tarea).
2. **Expo Access Token** → https://expo.dev/accounts/lucasap123/settings/access-tokens
   → "Create token"
3. **GitHub Personal Access Token** (fine-grained, repo `animaldex`,
   permiso "Contents: Read and write") → para hacer `git push`.

Guárdalos en un gestor de contraseñas. Cuando se necesiten para desplegar
o hacer cambios, se pasan como variables de entorno temporales
(`CLOUDFLARE_API_TOKEN`, `EXPO_TOKEN`), nunca se escriben dentro del código.

---

## 🔧 Pasos para restaurar el proyecto desde cero

```bash
# 1. Clonar o extraer el backup
git clone https://github.com/clientenetflix0001-lgtm/animaldex.git
cd animaldex/

# 2. Instalar dependencias
npm install

# 3. Verificar que app.json tenga la identidad correcta
#    (name, slug, owner, extra.eas.projectId, updates.url — ver tabla arriba).
cat app.json

# 4. Desplegar el sitio web (Cloudflare Pages)
export CLOUDFLARE_API_TOKEN=xxxxx
export CLOUDFLARE_ACCOUNT_ID=76a9bc649184dfbf09c0b4319bcaa85b
bash scripts/deploy-cf-pages.sh
```

### Si además se perdió el proyecto EAS (builds nativos / OTA updates)

```bash
export EXPO_TOKEN=xxxxx   # token generado arriba

# Re-vincular o crear proyecto EAS bajo la cuenta correcta
npx eas-cli init --account lucasap123 --non-interactive --force

# Crear canales de actualización (si no existen)
npx eas-cli channel:create preview --non-interactive
npx eas-cli channel:create production --non-interactive

# Confirmar que eas.json tenga "channel": "preview"/"production"
# en cada perfil de build (build.preview.channel, build.production.channel)

# Generar un nuevo build de Android (APK instalable)
npx eas-cli build --platform android --profile preview --non-interactive
```

### Si se necesita reconectar el backend (Cloudflare Worker)

```bash
export CLOUDFLARE_API_TOKEN=xxxxx
export CLOUDFLARE_ACCOUNT_ID=76a9bc649184dfbf09c0b4319bcaa85b

# Verificar que el Worker sigue vivo (no debería hacer falta redeploy)
npx wrangler deployments list --name animaldex-api

# Si hiciera falta redesplegar el Worker:
npx wrangler deploy

# Ver/actualizar secrets del Worker (Twilio, CF Images, OTP) si es necesario
npx wrangler secret list --name animaldex-api
npx wrangler secret put NOMBRE_DEL_SECRET --name animaldex-api
```

---

## ⚠️ Advertencia importante sobre `app.json`

Algunas plataformas de despliegue **sobreescriben automáticamente
`app.json`** para vincular su propio sistema de vista previa (cambian
`name`, `slug`, `owner`, `extra.eas.projectId` y `updates.url` a un
proyecto interno de esa plataforma). Esto ya no debería pasar al usar
Cloudflare Pages, pero si en algún momento se usa otra herramienta de
preview, conviene revisar que estos campos sigan apuntando al proyecto
real:
```json
"name": "Animaldex",
"slug": "animaldex",
"owner": "lucasap123",
"extra": { "eas": { "projectId": "f2b4eacd-6e1a-4dbc-89cd-b65598756451" } },
"updates": { "url": "https://u.expo.dev/f2b4eacd-6e1a-4dbc-89cd-b65598756451" }
```
Si aparecen valores distintos, hay que restaurarlos a los de la tabla de
arriba **antes** de correr `eas build` o `eas update`.

---

## 💡 Recomendación para el futuro

La forma más sólida de nunca perder este proyecto es darle al asistente
(o a ti mismo) **acceso de escritura al repositorio de GitHub**
(`clientenetflix0001-lgtm/animaldex`), para que cada cambio se pueda
subir con `git push` directamente ahí — así el repo se mantiene siempre
como la fuente de verdad, sin depender de ningún link de preview temporal.
Y ahora, con el sitio web en Cloudflare Pages desplegado vía `wrangler`,
tampoco depende de ninguna sesión de terceros que pueda expirar.
