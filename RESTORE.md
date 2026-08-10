# 🐾 Animaldex — Guía de restauración del proyecto

Esta guía existe para que, si vuelves a perder el despliegue de Vercel (o
cualquier otra plataforma), se pueda **reconstruir todo el proyecto desde
cero en minutos**, con el mínimo de fricción posible.

Guarda este archivo y el `.tar.gz` que lo acompaña en un lugar seguro
(Google Drive, un repositorio privado, etc.) — no solo en el link del sitio,
que es justamente lo que puede desaparecer.

---

## 📦 Contenido del respaldo

El archivo `animaldex-backup.tar.gz` contiene **todo el código fuente**
necesario para reconstruir la app:

- `App.tsx`, `app.json`, `eas.json`, `package.json`, `tsconfig.json`
- `screens/`, `components/`, `lib/` (frontend Expo/React Native)
- `worker/`, `wrangler.toml` (backend Cloudflare Worker)
- `api/`, `middleware.js`, `vercel.json` (frontend web / OG tags para bots)
- `assets/` (íconos, logo, imágenes)

**NO incluye** (por seguridad y porque se regeneran solos):
- `node_modules/` → se recrea con `npm install`
- `.git/` → se recrea con `git init`
- `dist/` → se recrea con `npx expo export`
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

> ⚠️ **El backend (Worker + D1) es independiente del frontend.**
> Mientras no se toque `wrangler.toml`/`worker/index.js` ni se borre el
> Worker o la base de datos en Cloudflare, los datos de usuarios/mascotas/
> publicaciones **siempre estarán a salvo**, sin importar qué le pase al
> hosting del sitio web.

---

## 🔑 Credenciales necesarias (pídeselas al asistente o gestiónalas tú mismo)

Estas **NO** están en el backup por seguridad. Se generan así:

1. **Cloudflare API Token** → https://dash.cloudflare.com/profile/api-tokens
   → "Create Token" → plantilla "Edit Cloudflare Workers"
2. **Expo Access Token** → https://expo.dev/accounts/lucasap123/settings/access-tokens
   → "Create token"

Guárdalos en un gestor de contraseñas. Cuando se necesiten para desplegar
o hacer cambios, se pasan como variables de entorno temporales
(`CLOUDFLARE_API_TOKEN`, `EXPO_TOKEN`), nunca se escriben dentro del código.

---

## 🔧 Pasos para restaurar el proyecto desde cero

```bash
# 1. Extraer el backup
tar -xzf animaldex-backup.tar.gz -C animaldex/
cd animaldex/

# 2. Instalar dependencias
npm install

# 3. Verificar que app.json tenga la identidad correcta
#    (name, slug, owner, extra.eas.projectId, updates.url — ver tabla arriba).
#    Si el proyecto se creó de nuevo con otro projectId, actualizar aquí.
cat app.json

# 4. Generar el build web (para hosting tipo Vercel/Netlify/Cloudflare Pages)
npx expo export --platform all

# 5. Desplegar la carpeta dist/ en la plataforma de hosting elegida
#    (Vercel: vercel --prod   |   o arrastrar dist/ en Netlify, etc.)
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

# Ver/actualizar secrets (Twilio, CF Images, OTP) si es necesario
npx wrangler secret list --name animaldex-api
npx wrangler secret put NOMBRE_DEL_SECRET --name animaldex-api
```

---

## ⚠️ Advertencia importante sobre `app.json`

Algunas plataformas de despliegue **sobreescriben automáticamente
`app.json`** para vincular su propio sistema de vista previa (cambian
`name`, `slug`, `owner`, `extra.eas.projectId` y `updates.url` a un
proyecto interno de esa plataforma).

**Después de cada redeploy, conviene revisar que estos campos sigan
apuntando al proyecto real:**
```json
"name": "Animaldex",
"slug": "animaldex",
"owner": "lucasap123",
"extra": { "eas": { "projectId": "f2b4eacd-6e1a-4dbc-89cd-b65598756451" } },
"updates": { "url": "https://u.expo.dev/f2b4eacd-6e1a-4dbc-89cd-b65598756451" }
```
Si aparecen valores distintos (por ejemplo `"owner": "arcadalabs"` o un
`projectId` distinto), hay que restaurarlos a los de la tabla de arriba
**antes** de correr `eas build` o `eas update`, o el comando fallará por
permisos o apuntará al proyecto equivocado.

---

## 💡 Recomendación para el futuro

La forma más sólida de nunca perder este proyecto es darle al asistente
(o a ti mismo) **acceso de escritura al repositorio de GitHub**
(`clientenetflix0001-lgtm/animaldex`), para que cada cambio se pueda
subir con `git push` directamente ahí — así el repo se mantiene siempre
como la fuente de verdad, sin depender de ningún link de preview temporal.
