# Animaldex — base estable (funciones críticas)

Esta rama (`cursor/animaldex-stable-base`) es la **base obligatoria** para todo trabajo futuro.

No es un merge a `main`. No incluye OTA ni deploy. El código de producto de este snapshot es el commit:

`50968363a130a525781aa84e6569ab43605662a9`  
(`fix(auth): el aviso de celular solo vive en el paso de elección`)

`origin/main` (`faefdb7` y posteriores) **no** contiene este stack. No usar `main` como punto de partida.

---

## Cómo ramificar

```bash
git fetch origin cursor/animaldex-stable-base
git checkout -b cursor/<nombre-del-trabajo> origin/cursor/animaldex-stable-base
```

Prohibido salvo orden explícita:

- merge a `main`
- `eas update` / OTA
- `wrangler deploy` (Worker)
- `scripts/deploy-cf-pages.sh` / Pages
- escrituras D1 masivas o `DROP`
- build Android / EAS
- configurar secretos Twilio

---

## Identidad de infraestructura (no redeplegar desde esta tarea)

| Recurso | Valor |
|---|---|
| Worker | `animaldex-api` → `https://animaldex-api.animaldex-api.workers.dev` |
| D1 | `animaldex-db` (`c0ae095d-b9a5-4acd-b500-8a9c2be03010`) |
| Web | `https://animaldex-web.pages.dev` (proyecto Pages `animaldex-web`) |
| Android | `com.lucasap123.animaldex` |
| EAS | `f2b4eacd-6e1a-4dbc-89cd-b65598756451` (owner `lucasap123`) |
| Expo SDK | 57 (`https://docs.expo.dev/versions/v57.0.0/`) |
| Cliente API | `lib/db.ts` → `API_ORIGIN` |

Restore operativo más amplio: `RESTORE.md`. Este archivo documenta **el comportamiento actual del snapshot**, no cómo reconstruir hosting.

---

## 1. Autenticación

Archivos: `screens/AuthScreen.tsx`, `screens/VerifyPhoneScreen.tsx`, `lib/phone.ts`, `lib/otpPolicy.ts`, `lib/publicHandles.ts`, `lib/store.tsx`, `lib/db.ts`, `lib/api.ts`, `worker/index.js`, `tests/auth.test.ts`.

### Login

- Pestañas: `Iniciar sesión | Crear cuenta`.
- Un solo campo **“Correo o número de celular”** + contraseña.
- Backend `login` acepta `identifier` (o `username` legado).
- `classifyIdentifier`: si hay `@` → email (sin recortar a 20); si no, `normalizePhone` → teléfono; si no, `USERNAME_RE` → username de cuentas viejas.
- Hash **sin cambiar**: `scryptSync(password, salt, 64)`.
- Sesión Bearer, TTL 90 días. Token en AsyncStorage `animaldex-session-token`.

### Registro (wizard dentro de AuthScreen)

No abrir otro navigator: el wizard vive en `AuthScreen` para no perder `pendingTagCode`.

1. Elección: Correo / Celular / “¿Ya tienes cuenta?”
2. Correo: email + password ×2 → `@username` vía `usernameTaken` / `isValidPublicUsername` → `registerEmail`. `name = username`. `email_verified_at = NULL`.
3. Celular: el botón existe. Twilio **no** está configurado. `/sms` `status` solo mira env vars. Si no hay SMS: `PHONE_SIGNUP_UNAVAILABLE` (*“El registro por celular estará disponible próximamente…”*). Ese aviso se renderiza **solo en el paso de elección**. `chooseEmailSignup` / `goLogin` / `goRegister` limpian `error` e `info`.

`GuestInviteBar` navega a `Auth { mode: 'login' | 'register' }` (`lib/guestAccess.tsx`).

### Teléfono / OTP

- `/sms`: `status` | `send` | `verify`. Sin `demoCode`. 503 si faltan Twilio/`OTP_SECRET`. El código nunca se revela al cliente.
- Ticket firmado; `registerPhone` y `setPhone` exigen ticket (`signup` / `verify_phone`).
- Política: `lib/otpPolicy.ts` (TTL 10 min, 3 envíos / 15 min, gap 30 s, 5 intentos).

### Usernames públicos

- Formato: `^[a-z0-9_.]{3,20}$`.
- Reservados y “parece teléfono” se rechazan (`lib/publicHandles.ts` + Worker).
- Perfiles humanos/páginas: URL pública `/:username`. `UserProfile` es interno (p. ej. QR por `user_id`), **sin** `/user/:id`.

Tests: `npm run test:auth`.

---

## 2. Chapitas QR

Archivos: `App.tsx` (`TagDeepLinkHandler`), `lib/tags.ts`, `lib/store.tsx`, `screens/TagWelcomeScreen.tsx`, `screens/AddPetScreen.tsx`, `screens/QRScannerScreen.tsx`.

Flujo:

`?qr=<code>` → `extractTagCode` → `pendingTagCode` + AsyncStorage `animaldex-pending-tag-code` → banner en Auth → login/registro → `TagWelcome` → `AddPet` → `claimTag`.

Reglas que no se deben romper:

- **No** limpiar `pendingTagCode` en `TagDeepLinkHandler` (se limpia en `AddPet` tras éxito).
- El wizard de Auth **no** toca `pendingTagCode`.
- `AddPet`: `savingRef` bloquea doble submit; `createdPetRef` evita un segundo `createPet` si falla `claimTag`.
- Tras `claimTag`: `setPendingTagCode(null)` y `navigation.replace('PetProfile', { petId: username || id })`.
- **No** depender de `Alert.alert` `onPress` para navegar (roto en web).

URL de chapita: `https://animaldex-web.pages.dev?qr=<code>` (`lib/tags.ts`).

---

## 3. Invitados y recursos públicos

Archivos: `App.tsx` (`PublicNavigator`), `lib/guestAccess.tsx`, `components/GuestInviteBar.tsx`, `cf-pages-worker.src.js`.

Sin sesión se puede ver:

- `/:username` — perfil público
- `/p/:id` — publicación
- `/pet/:handle` — mascota
- `/a/:id` — alerta

Cualquier otra ruta cae en `Auth`. Un solo panel “Únete a Animaldex”. Acciones sociales piden login.

OG para bots (WhatsApp/Facebook): `cf-pages-worker.src.js` en `/p/`, `/pet/`, `/a/`, `/m/`, `/`.

---

## 4. Feed y publicaciones

Archivos: `screens/FeedScreen.tsx`, `components/PostCard.tsx`, `components/AdaptivePostImage.tsx`, `lib/postBackgrounds.ts`, `screens/CreatePostScreen.tsx`, `screens/PostDetailScreen.tsx`.

Contrato actual (no regresar):

- FlatList **append-only** (paginación `before` / `onEndReached`)
- Dimensiones A2: `imageWidth` / `imageHeight` (`posts.image_w` / `image_h`)
- Imagen ~350 px, `PostCard` a ancho completo
- Texto con `backgroundId` (`posts.background_id`)
- Caption máximo **1000**
- “Ver más” en caption
- Compositor de comentarios por encima del teclado (Android)

Worker `createPost` / `updatePost` usa `POST_CAPTION_MAX = 1000` y guarda `author_profile_id`.

---

## 5. Perfiles, protectoras y mascotas

Archivos: `screens/PublicProfileScreen.tsx`, `screens/UserProfileScreen.tsx`, `screens/PetProfileScreen.tsx`, `screens/AddPetScreen.tsx`, `features/profiles/*`, `lib/petFields.ts`, `lib/birthDate.ts`.

- Tipos de perfil: `personal` | `business` | `protector`.
- Protectora pública: stats Mascotas / Seguidores / Adoptados; tabs **Mascotas | Publicaciones**; grilla 2 columnas; filtros de estado/especie.
- Contador **Mascotas** por `profile_id`, no por estado de cuidado.
- Campos de mascota: `species`, `care_status`, `adoption_started_at`, `birth_date`, `size`, `neutered`, `archived_at`, `profile_id`.
- `openHumanProfile` abre `PublicProfile` por username; solo cae a `UserProfile` si no hay handle.

---

## 6. Alertas y marketplace

- Alertas: `screens/AlertsScreen.tsx`, `AlertDetailScreen.tsx`, `CreateAlertScreen.tsx`, `components/AlertCard.tsx`. Imágenes cuadradas, FlatList paginado, detalle público + comentarios + invitado.
- Mercado: `screens/MarketScreen.tsx`, listings `/m/:id`, tienda, favoritos. Worker: `listingsFeed`, `listingDetail`, `createListing`, etc.

No tocar UI/contrato de Feed, Alertas, Marketplace ni protectoras salvo que el trabajo lo pida.

---

## 7. Worker y D1

Entradas del Worker (`worker/index.js`):

| Ruta | Rol |
|---|---|
| `/auth` | register, registerEmail, registerPhone, checkEmail, login, me, logout, updateProfile |
| `/db` | feed, perfiles, posts, pets, tags, alerts, listings, follow, like, comment, claimTag, createPet, setPhone, … |
| `/upload` | Cloudflare Images |
| `/sms` | status / send / verify |
| `/` `/health` | ping |

Schema auth **aditivo** (`ensureAuthSchema`):

- `users.email`, `users.email_verified_at`
- índices únicos `idx_users_email`, `idx_users_verified_phone` (WHERE NOT NULL)
- tabla `otp_challenges`

No hacer `DROP`, UPDATE masivo de hashes, ni reescribir teléfonos existentes (p. ej. `lucasfuentes` sigue en formato nacional, no E.164).

Columnas de posts/pets que ya existen y deben seguir: `background_id`, `image_w`/`image_h`, `author_profile_id`, `care_status`, `adoption_started_at`, `birth_date`, `size`, `neutered`, `archived_at`, `species`.

`wrangler.toml` es **solo** del Worker. No agregar `pages_build_output_dir`.

Secretos Worker esperados: `CF_IMAGES_TOKEN`. Twilio/`OTP_SECRET` **no** están; no agregarlos solos.

---

## 8. App Links (`app.json`)

Dos `intentFilters` (`autoVerify`, host `animaldex-web.pages.dev`):

1. `pathPrefix`: `/p/`, `/pet/`, `/a/`, `/m/`
2. `pathAdvancedPattern`: `/[a-zA-Z0-9._]{3,20}` y con `/` final

Prefijos de linking en `App.tsx`: `animaldex://` y `https://animaldex-web.pages.dev`.

No cambiar `name` / `slug` / `owner` / `extra.eas.projectId` / `updates.url` / `runtimeVersion`.

---

## 9. Navegación (mapa corto)

Tabs (móvil): Inicio | Reels | Alertas | + | Mercado | Perfil. Actividad existe pero no está en la barra.

Web ≥ 1024 px: sidebar Instagram (`components/Sidebar.tsx`). Inicio/Reels = `FeedReelsSwiper`.

`useFonts(Ionicons)` bloquea el primer paint: si faltan fonts en Pages, pantalla en blanco. El deploy de Pages ya espeja `node_modules` → `vendor_modules` (`RESTORE.md`).

---

## 10. Archivos que no se pisan con versiones viejas

Si un cambio futuro toca auth, QR o perfiles, partir de **estos** archivos (HEAD de esta rama), no de copias de `main` u otras PRs:

- `screens/AuthScreen.tsx`
- `screens/AddPetScreen.tsx`
- `screens/TagWelcomeScreen.tsx`
- `App.tsx`
- `worker/index.js`
- `lib/phone.ts`, `lib/otpPolicy.ts`, `lib/publicHandles.ts`, `lib/api.ts`, `lib/store.tsx`, `lib/db.ts`, `lib/guestAccess.tsx`
- `app.json`

---

## 11. Qué hay y qué no en este snapshot

Incluido y estable:

- Login por email / teléfono / username legado
- Registro por email + wizard de celular (UI; SMS no configurado)
- Perfiles públicos `/:username` y modo invitado
- Feed A2 / append-only / caption 1000 / fondos de texto
- Chapitas QR con claim idempotente
- Protectora: grilla, filtros, contadores
- Alertas y marketplace públicos

Fuera de alcance / no hecho:

- Twilio en producción
- Verificación real de email (`email_verified_at` queda NULL)
- Merge a `main`
- OTA o nuevo APK desde esta rama
