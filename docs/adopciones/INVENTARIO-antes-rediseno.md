# Adopciones — inventario antes del rediseño

Código de referencia: `0ca9a61d62af0e5ee2889fd611d40669c406be25`, el mismo publicado en Cloudflare Pages
(tag `backup/adopciones-web-antes-rediseno`). Capturas: `antes-rediseno/README.md`.

Las citas indican archivo y línea en ese commit.

---

## 1. Dos sistemas de adopción separados

Hoy hay **dos fuentes de adopción** que no se cruzan:

| | A. Mascota de refugio en adopción | B. Alerta de adopción |
|---|---|---|
| Dónde vive | `pets.care_status = 'en_adopcion'`, perfil `profiles.type = 'protector'` | `alerts.type = 'adoption'` |
| Quién la crea | Una página de Bienestar Animal, desde el perfil de la mascota | Cualquier usuario con sesión, desde «Crear alerta → En adopción» |
| Dónde se ve | «Quiero adoptar» (`AdoptionDiscovery`) y la fila de adopciones de Inicio | Alertas, `/a/:id` y Mis alertas |
| Endpoint de lectura | `adoptionFeed` (`worker/index.js:2456`) | `alertsFeed` (`:2620`) y `alertDetail` (`:2651`) |
| Contacto | `adoptionContact`: WhatsApp/teléfono del refugio (`:2524`) | `alertAdoptionContact`: contacto de la alerta o del refugio autor (`:2678`) |
| Vencimiento | No vence | Se renueva cada 7 días para volver a subir; **no se pausa sola** |
| Datos en D1 hoy | 6 mascotas `en_adopcion` | 1 alerta (`Rambo`, Salta Capital, `AR:georef:66028050`) |

`adoptionCardFromAlert()` está reservada y **siempre devuelve `null`**
(`lib/adoptionDiscovery.ts:240-243`). Por eso una alerta de adopción no aparece en «Quiero adoptar».

---

## 2. Pantallas

| Pantalla | Archivo | Ruta web | ¿Sin sesión? |
|---|---|---|---|
| Quiero adoptar (muro vertical a pantalla completa) | `screens/AdoptionDiscoveryScreen.tsx` | Sin path propio (`App.tsx:630`) | No |
| Botón «Quiero adoptar» en Inicio | `components/WantToAdoptButton.tsx` (`FeedScreen.tsx:411`, `:465`) | `/` | No (`/` redirige a `/entrar`) |
| Fila de adopciones en Inicio | `components/FeedAdoptionsRow.tsx` (`FeedScreen.tsx:329`) | `/` | No |
| Detalle de alerta de adopción | `screens/AlertDetailScreen.tsx` | `/a/:alertId` | **Sí** (`PublicNavigator`, `App.tsx:446-465`) |
| Perfil de mascota en adopción | `screens/PetProfileScreen.tsx` | `/pet/:handle` | **Sí** |
| Perfil de refugio | `screens/PublicProfileScreen.tsx` | `/:username` | **Sí** |
| Crear alerta / En adopción | `screens/CreateAlertScreen.tsx` | `/crear-alerta` | No |
| Crear flyer | `screens/AlertFlyerPreviewScreen.tsx` | `/crear-flyer` | No |
| Mis alertas (renovar, resolver, eliminar) | `screens/MyAlertsScreen.tsx` | `/mis-alertas` | No |
| Editar página de Bienestar Animal (contacto de adopción) | `screens/EditPublicProfileScreen.tsx` | `/editar-perfil-publico` | No |

Un visitante sin sesión solo recibe `PublicNavigator`: Auth, PostDetail, UserProfile,
PublicProfile, PetProfile, TagWelcome, AlertDetail, ListingDetail y ReelViewer
(`App.tsx:446-465`). Todo lo demás lo redirige a `/entrar`.

---

## 3. Cómo se ve hoy

### Quiero adoptar (`AdoptionDiscoveryScreen`), sin captura porque requiere sesión

- Muro vertical **a pantalla completa**, una mascota por pantalla, estilo reels:
  `FlatList` con `pagingEnabled` y `snapToInterval` (`AdoptionDiscoveryScreen.tsx:207-229`).
- Fondo oscuro fijo, texto blanco y barra de estado clara. No sigue el tema claro u oscuro.
- Barra superior con «Volver», título «Adoptar» y botón de localidad que abre `PlacePicker`
  (`:241-257`).
- Tres filtros desplegables: Especie, Tamaño y Sexo (`:263-300`; menús en
  `lib/adoptionDiscovery.ts:36-95`).
- Estado vacío: «No hay mascotas en adopción con esos filtros. Probá otra combinación o localidad.»
  (`:203-205`).
- Tarjeta `AdoptionDiscoveryCard` con foto, nombre, refugio y botón «Quiero adoptarlo».
  El botón pide `adoptionContact` y abre WhatsApp o el teléfono. También tiene compartir
  (`sharePetProfile`) y un me gusta **solo local**, que no se guarda (`:182`).
- Al entrar detecta la localidad con `locateCurrentPlace()` (`:142`) o usa la guardada en
  AsyncStorage `animaldex-adoption-locality`.

### Detalle `/a/:id`, capturado

- Encabezado «Alerta», franja violeta «💜 EN ADOPCIÓN», autor, localidad y antigüedad.
- Imagen o flyer a todo el ancho. En escritorio no hay ancho máximo: la imagen ocupa los
  1440 px.
- Me gusta, comentarios y botón violeta `#A94CF4` «Quiero adoptarlo»
  (`lib/adoptionDiscovery.ts:25`).
- Descripción, «Publicado por …» y comentarios con el vacío «Sé el primero en comentar».
- A un visitante se le muestra el aviso «Únete a Animaldex» (`components/GuestInviteBar.tsx`).
- Tema claro y oscuro automáticos: funcionan.

### Perfil `/pet/:handle`, capturado

- Etiquetas (En adopción, especie, raza, tamaño, castrado), «Esperando hace N días», bio,
  estadísticas, Seguir, refugio responsable y «Compartir mi ubicación con el dueño».

---

## 4. Funcionalidades implementadas

| Funcionalidad | Fuente A (refugio) | Fuente B (alerta) |
|---|---|---|
| Ver listado | `adoptionFeed`, con paginación por cursor `before` | `alertsFeed` (todas las alertas, filtrable por tipo) |
| Filtro territorial por `placeId` | Sí (`requestTerritoryCondition`, `worker/index.js:2486`) | Sí (`:2625`) |
| Filtros especie, tamaño y sexo | Sí | Solo especie y sexo en el formulario; el feed no filtra por ellos |
| Una foto | `pets.avatar_url` | `alerts.image`, una sola columna |
| Galería de varias fotos | No | No |
| Flyer | No | Sí: se crea en la app (`AlertFlyerPreviewScreen`) o se sube como imagen |
| WhatsApp y teléfono | Del refugio (`profiles.adoption_whatsapp/phone`) | De la alerta (`contact_whatsapp/phone`) o del refugio autor |
| «Quiero adoptarlo» con mensaje prearmado | Sí (`lib/adoptionContact.ts:81-125`) | Sí |
| Vincular perfil de mascota | Es el propio perfil | **No**: `alerts` no tiene `pet_id` |
| Compartir con URL pública | `/pet/:handle` | `/a/:id` |
| Vista previa Open Graph | Sí (`/pet/`) | Sí (`/a/`, `cf-pages-worker.src.js:375-381`) |
| Marcar adoptada | Cambiando `care_status` | `resolveAlert` con `resolution_type = 'adopted'` (`worker/index.js:3337`) |
| Renovar cada 7 días | No aplica | `renewAlert` (`:3360`); aviso push diario (`runAlertRenewalReminders`, cron `0 11 * * *`) |
| Pausa automática al vencer | No | **No existe** |
| Pausa manual | No | No |
| Eliminar | Archivar o borrar la mascota | `deleteAlert` (`:3379`) |
| Denunciar | No | **No** (`content_reports` solo se usa para historias, `worker/stories.js:884-890`) |
| Publicar sin cuenta | No | No |

---

## 5. Qué comparte con Alertas y Mercado

- **Con Alertas:** la misma tabla `alerts`, el mismo formulario `CreateAlertScreen`, el
  detalle `AlertDetailScreen`, `MyAlertsScreen`, la renovación de 7 días
  (`lib/alerts.ts:11`), el texto para compartir `alertShareMeta` y los flyers.
- **Con Mercado:** el mismo esquema de renovación de 7 días (`lib/listingLifecycle.ts:1`,
  `renewListing` en `worker/index.js:3486`), el estado `status` (`active`, `sold`,
  `removed`), las columnas territoriales y el patrón de feed ordenado por
  `COALESCE(renewed_at, created_at)`.
- **Con todas las secciones:** `PlacePicker`, `locateCurrentPlace()`, `placeSelection()`,
  el filtro territorial `worker/geoFilter.js`, las columnas `place_id`, `admin1_code` y
  `admin2_code`, la subida `/upload` a Cloudflare Images y el tema `useAppTheme()`.

---

## 6. Endpoints y tablas

**Lectura pública: el Worker no exige sesión.** Todo lo anterior a
`// ---------- Escrituras (requieren sesión)` (`worker/index.js:2962-2965`):
`adoptionFeed`, `adoptionContact`, `featuredPets`, `petProfile`, `petPosts`, `publicProfile`,
`alertsFeed`, `alertDetail`, `alertComments`, `alertAdoptionContact` y `listingsFeed`.

**Escritura: requiere sesión.** `createAlert` (`:3232`), `renewAlert`, `resolveAlert`,
`deleteAlert`, `alertLike`, `alertComment`, `updatePet` y similares.

**Subida de imágenes:** `/upload` (`handleUpload`, `:4459`) exige sesión, valida el formato
por su contenido y limita a 20 imágenes por minuto por usuario e IP. El contador vive en la
memoria de cada isolate (`:1103-1121`). Se sube a Cloudflare Images y se sirve desde
`imagedelivery.net/.../public`.

**Tablas D1 usadas** (leídas con `PRAGMA`, sin escribir):

- `alerts`: `id, user_id, type, status, pet_name, species, breed, description, image, locality,
  province, country, lat, lon, event_date, created_at, updated_at, resolved_at, resolution_type,
  renewed_at, sex, author_profile_id, contact_whatsapp, contact_phone, renewal_notified_at,
  place_id, admin1_code, admin2_code, location_reference, breed_id`.
- `pets`: `id, user_id, name, species, breed, age, bio, emoji, avatar_url, created_at, username,
  profile_id, care_status, sex, adoption_started_at, birth_date, size, neutered, archived_at`.
- `profiles`: `…, type, adoption_whatsapp, adoption_phone, place_id, admin1_code, admin2_code,
  pet_contact_visible`.
- Además: `alert_likes`, `alert_comments`, `images`, `content_reports`, `users` y `sessions`.

---

## 7. Qué depende de la app Android

- Detección automática de localidad: el GPS más el reverse geocode funcionan en Android. En web
  se usa un respaldo por catálogo con confirmación (`lib/placeLocateResolution.ts`).
- Avisos push de renovación y de coincidencias (`expo-notifications`).
- Chapitas QR y escaneo (`QRScanner`).
- La generación del flyer (`AlertFlyerPreviewScreen`) está pensada para nativo; en web su
  funcionamiento no se verificó en esta auditoría.
- El formulario usa `expo-image-picker` con la galería (`CreateAlertScreen.tsx:188`). No hay
  un botón explícito para abrir la cámara en web.

---

## 8. Qué preservar en el rediseño

1. `placeId` como identidad territorial (`AR:georef:66028050` para Salta Capital) y su filtro en el Worker.
2. Las URL públicas existentes `/a/:id`, `/pet/:handle` y `/:username`, junto con su Open Graph actual (capturado en `09-compartir-og-*.txt`).
3. El flujo «Quiero adoptarlo» → WhatsApp/teléfono con mensaje prearmado (`lib/adoptionContact.ts`).
4. El contacto de los refugios (`profiles.adoption_whatsapp/phone`) y la prioridad del refugio sobre el contacto de la alerta.
5. La renovación de 7 días y los avisos push de alertas y Mercado, que ya usa Android.
6. El tema claro y oscuro automático (`lib/appTheme.ts`, `useAppTheme()`).
7. La resolución `adopted` y su texto para compartir («ya fue adoptado/a»).
8. La pantalla nativa `AdoptionDiscovery`, que la app Android sigue usando por OTA.
