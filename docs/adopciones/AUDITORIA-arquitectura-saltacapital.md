# Adopciones web — auditoría de arquitectura para `/adopciones/saltacapital`

> Decisión posterior: publicar y administrar exige una cuenta de Animaldex. No hay publicación sin cuenta, tokens de gestión ni Turnstile. El muro sigue siendo público. La cola `adoption_image_deletions` se conserva para las publicaciones de usuarios registrados. El texto de abajo es la auditoría original, anterior a esa decisión.

Base: `0ca9a61d62af0e5ee2889fd611d40669c406be25` (tag `backup/adopciones-web-antes-rediseno`).
Inventario de lo que existe hoy: `INVENTARIO-antes-rediseno.md`.

Esto es un plan: **no se implementó nada**. Donde se dice «no existe» se verificó en el código y,
en el caso de D1, con `PRAGMA table_info`.

---

## 1. Punto de partida

| Requisito | ¿Existe hoy? | Evidencia |
|---|---|---|
| Ver adopciones sin cuenta | **Parcial**: el Worker sí lo permite; la web no | `adoptionFeed`, `alertsFeed` y `alertDetail` son lecturas públicas (`worker/index.js:2456`, `:2620`, `:2651`). La web manda a `/entrar` todo lo que no esté en `PublicNavigator` (`App.tsx:446-505`). |
| Compartir sin cuenta | Sí, para `/a/:id` y `/pet/:handle` | Open Graph en `cf-pages-worker.src.js:357-381` y `:557` |
| Publicar sin cuenta | **No** | `createAlert` está después del control de sesión (`worker/index.js:2962-2965`) y `/upload` exige sesión (`:4459-4465`) |
| Publicación que vence a los 7 días y se elimina | **No** | La renovación solo reordena; no hay pausa ni borrado automático (`renewAlert`, `:3360`; cron `scheduled`, `:4647`) |
| Pausa automática y pausa manual | **No** | `status` solo admite `active` y `resolved` (`lib/alerts.ts:6`) |
| Renovar cada 7 días | Sí, en alertas y Mercado | `ALERT_RENEW_MS` (`lib/alerts.ts:11`), `LISTING_RENEW_MS` (`lib/listingLifecycle.ts:1`) |
| Marcar adoptada | Sí | `resolveAlert` con `adopted` (`:3337`) |
| Eliminar | Sí, pero no borra la imagen de Cloudflare | `deleteAlert` (`:3379`). Las publicaciones del feed sí la borran (`:3795-3815`) |
| Denunciar | **No** para alertas | `content_reports (id, user_id, target_type, target_id, created_at)` solo lo usa `reportStory` |
| Varias fotos | **No** | `alerts.image` es una sola columna `NOT NULL` |
| Vincular perfil de mascota | **No** | `alerts` no tiene `pet_id` |
| Anti-spam | Mínimo | Límite de subida en la memoria del isolate, sin persistencia (`:1103-1121`). No hay captcha. |
| Tema claro/oscuro | Sí | `lib/appTheme.ts`: claro `bg #FFF9F2`, oscuro `bg #000000`, `primary #FF6B4A` |

---

## 2. Decisiones de arquitectura propuestas

### 2.1 Un único modelo de publicación de adopción: `alerts` con `type = 'adoption'`

No crear una tabla nueva de «avisos de adopción». `alerts` ya tiene foto, descripción,
contacto, `place_id`, renovación, resolución `adopted`, Open Graph y consumidores en Android.

El muro combina, como ya prevé `mergeAdoptionSources` (`lib/adoptionDiscovery.ts:308`):

- **A.** Mascotas de refugio `pets.care_status = 'en_adopcion'`, sin cambios.
- **B.** Alertas `type = 'adoption'`, que es donde se publican las nuevas, registradas o de invitado.

Hay que implementar `adoptionCardFromAlert()`, que hoy devuelve `null`.

Columnas **aditivas** que harían falta en `alerts`, todas `NULL` por defecto y sin reescribir filas:

| Columna | Uso |
|---|---|
| `media_kind TEXT` | `'photo'` o `'flyer'`. Un flyer no exige repetir nombre, especie ni descripción. |
| `extra_images TEXT` | JSON con fotos adicionales; `image` sigue siendo la portada. |
| `pet_id TEXT` | Vínculo opcional a un perfil de mascota existente. |
| `paused_at INTEGER` | Pausa manual o automática. |
| `expires_at INTEGER` | Vencimiento del ciclo de 7 días. NULL = alerta anterior, sin vencimiento. No borra la fila. |
| `is_guest INTEGER` | Descartada. Publicar exige una cuenta. |

**Restricción:** `alerts.user_id` es `NOT NULL` en D1. SQLite no permite quitar esa restricción
sin reconstruir la tabla. Propuesta: guardar en `user_id` un identificador sintético
`guest:<uuid>` y crear una tabla lateral `guest_posts`. Las consultas con `LEFT JOIN users`
devolverán un autor nulo, y la interfaz tiene que mostrar «Publicado por un vecino».

### 2.2 Tabla nueva solo para invitados: `guest_posts` (descartada)

No se crea. Publicar y administrar exigen cuenta. No hay token ni enlace privado.

```
guest_posts(
  alert_id TEXT PRIMARY KEY,
  manage_token_hash TEXT NOT NULL,   -- SHA-256 del token; el token nunca se guarda
  contact_hash TEXT,                 -- teléfono normalizado y hasheado, para límites y bloqueos
  ip_hash TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleted_at INTEGER
)
```

Al publicar se devuelve **una sola vez** un enlace secreto de administración, por ejemplo
`/adopciones/saltacapital/gestionar#<token>`. Con ese token, el Worker permite pausar,
marcar adoptada y eliminar la publicación. Por ahora no hay otro canal para enviarlo: los
SMS por Twilio existen en el código pero no están configurados. Como mejora posterior
se puede verificar el WhatsApp o teléfono.

### 2.3 Localidades configurables

Un módulo puro compartido por la app, el Worker y el worker de Pages, por ejemplo
`lib/adoptionLocalities.ts`:

```
saltacapital -> { placeId: 'AR:georef:66028050', title: 'Salta Capital' }
```

Para sumar una localidad alcanza con agregar una entrada. El muro filtra por `placeId` con
el filtro territorial existente (`worker/geoFilter.js`). No usa GPS: la localidad la fija la URL.

### 2.4 Rutas públicas

| Ruta | Contenido |
|---|---|
| `/adopciones/saltacapital` | Muro |
| `/adopciones/saltacapital/:id` | Detalle con URL propia y Open Graph |
| `/adopciones/saltacapital/publicar` | Publicar con foto o con flyer, con o sin cuenta |
| `/adopciones/saltacapital/gestionar` | Administración de una publicación de invitado mediante el token |
| `/mis-publicaciones` (o un filtro en `/mis-alertas`) | Usuarios registrados |

`/a/:id` y `/pet/:handle` siguen funcionando. El detalle nuevo declara
`<link rel="canonical">` para no duplicar contenido.

**Riesgo de colisión:** `/adopciones` coincide con el patrón de nombre de usuario en tres lugares:

- `PublicProfile: ':username'` en `App.tsx:294`;
- `handleMatch` en `cf-pages-worker.src.js:289`;
- `OG_PATH_RE` en `cf-pages-worker.src.js:557`.

Hay que agregar `adopciones` a `RESERVED_PUBLIC_USERNAMES` en los tres lugares sincronizados
(`lib/publicHandles.ts:10-13`). Uno de ellos es `spaReserved` en `cf-pages-worker.src.js:633-638`.
También hay que agregar la ruta en `getStateFromPublicPath` (`lib/webLinking.ts`) y en
`resolveAppLink` (`lib/appLinks.ts`). Si se quiere que esos enlaces abran la app Android,
hace falta un `pathPrefix` `/adopciones/` en `app.json`, y eso requiere una build nueva:
una OTA no alcanza. Hoy ningún usuario ni perfil se llama así (verificado con un
SELECT en D1).

### 2.5 Frontend: dentro de la app Expo web

Se recomienda una pantalla nueva solo para web, registrada también en `PublicNavigator`, que
reutilice `useAppTheme()`, `PlacePicker`, `lib/adoptionContact.ts`, `lib/share.ts` y
`AppIcon`. No tiene que cambiar `AdoptionDiscoveryScreen`, que sigue sirviendo a Android.

La alternativa es generar HTML en el worker de Pages. Carga más rápido en teléfonos
modestos, pero duplica la interfaz y el sistema de tema. Se puede reservar solo para el
Open Graph, que ya funciona así.

Pautas de diseño pedidas:

- Encabezado compacto con logo, «Salta Capital» y búsqueda.
- Una columna de ancho máximo de unos 640 px en escritorio. Hoy `/a/:id` ocupa los 1440 px.
- Foto grande en formato 4:5, nombre, una línea de texto y «Ver más».
- Botón naranja `#FF6B4A` «Quiero adoptarlo»; hoy ese botón es violeta `#A94CF4`.
- Botones de al menos 48 px y letra de al menos 17 px.
- Tres filtros con palabras simples (Perro/Gato, Tamaño, Sexo), sin menús anidados.

Cámara en web: usar `<input type="file" accept="image/*" capture="environment">`, o
`ImagePicker.launchCameraAsync`, que en web usa ese mismo mecanismo. Conviene comprimir la
foto en el navegador antes de subirla.

### 2.6 Worker API

| Cambio | Tipo |
|---|---|
| `alertsFeed`: filtro opcional `type: 'adoption'` y exclusión de pausadas y vencidas | Aditivo |
| `adoptionWall`: lectura pública que combina A y B para un `placeId` con un cursor | Nuevo |
| `createAdoptionPost`: con sesión o como invitado; con Turnstile si es invitado; foto o flyer; `place_id` obligatorio dentro del catálogo | Nuevo |
| `guestUpload`: subida de imagen sin sesión, con Turnstile y límite persistente por IP/contacto | Nuevo |
| `guestManage`: pausar, adoptada o eliminar con el token | Nuevo |
| `pauseAlert` / `resumeAlert`, y `renewAlert` que reactiva | Nuevo y extensión |
| `reportContent`: `content_reports` con `target_type = 'alert'`; ocultamiento automático tras N denuncias distintas | Nuevo |
| Cron diario `0 11 * * *`: borrar publicaciones de invitado vencidas y sus imágenes; pausar registradas sin renovar | Extensión |
| Borrado de imagen en Cloudflare al eliminar una alerta, reutilizando el código de `:3795-3815` | Extensión |

Para Turnstile hay que crear un widget y un secreto nuevos en Cloudflare. Hoy no existe.

### 2.7 D1

Una migración aditiva `018_adoption_posts.sql`:

- columnas nuevas en `alerts`;
- tabla `guest_posts`;
- índices `(type, place_id, paused_at, COALESCE(renewed_at, created_at))`;
- tabla `rate_limits (key, window_start, n)` para el anti-spam persistente.

No hay que modificar datos existentes. La alerta «Rambo» ya cumple el modelo.

### 2.8 Imágenes

Reutilizar Cloudflare Images y su variante `public`, más `lib/images.ts:thumb` para
miniaturas. Con invitados aumentan el gasto de cuota y el riesgo de contenido inapropiado.
Hacen falta límites persistentes, Turnstile y borrado al vencer.

---

## 3. Qué se reutiliza

| Pieza | Reutilización |
|---|---|
| `alerts` + `createAlert`, `resolveAlert`, `renewAlert`, `deleteAlert` | Base de publicación, adopción, renovación y borrado |
| `adoptionFeed` + `pets` en adopción | Fuente A del muro, sin cambios |
| `lib/adoptionDiscovery.ts` (filtros, `mergeAdoptionSources`, `dedupeAdoptionCards`) | Lógica del muro |
| `lib/adoptionContact.ts` | WhatsApp y teléfono con mensaje prearmado |
| `alertAdoptionContact` | Contacto bajo demanda, sin exponer el número en el listado |
| `lib/listingLifecycle.ts` | Patrón de renovación, «vence en N días» y motivos de rechazo |
| `worker/geoFilter.js`, `lib/geoplace/*`, `placeId` | Filtro por localidad |
| `alertShareMeta` + `cf-pages-worker.src.js` | Open Graph para el detalle nuevo |
| `/upload` (validación por contenido) + borrado de Cloudflare Images | Subida y limpieza |
| `content_reports` | Denuncias, agregando `target_type = 'alert'` |
| `useAppTheme()`, `AppIcon`, `GuestInviteBar` | Tema, iconos e invitación a registrarse |
| Sesión web actual | «Mis publicaciones» para usuarios registrados |

---

## 4. Riesgos de regresión

1. **Android comparte el código JS por OTA.** Un cambio en `CreateAlertScreen`, `AlertCard`,
   `MyAlertsScreen` o `lib/alerts.ts` llega a Android en la siguiente OTA. Las pantallas
   nuevas deberían ser solo web y separarse por `Platform.OS` o por ruta.
2. **Pausa automática.** Si se aplica a todo `alertsFeed`, se ocultarían alertas de
   perdidos en Android. Hay que limitarla a `type = 'adoption'` o al muro nuevo.
3. **Colisión de `/adopciones` con nombres de usuario** en la app y el worker de Pages, ya descrita.
4. **Autor nulo** en las publicaciones de invitado: `AlertCard`, `AlertDetail` y el Open Graph
   suponen que hay `username`.
5. **Abuso y spam.** Publicar y subir imágenes sin cuenta es un vector nuevo. El límite
   actual vive en memoria y el Worker responde con CORS `*`.
6. **Privacidad.** Teléfonos de invitados visibles públicamente: conviene mostrarlos solo
   al tocar «Quiero adoptarlo», con aviso y consentimiento según la Ley 25.326.
7. **Un despliegue de Pages publica toda la web,** no solo Adopciones.
8. **Rendimiento:** el bundle de Expo web es pesado para teléfonos de gama baja.
9. **Duplicidad visual** entre el violeta de adopciones, que hoy usa la app, y el naranja del
   rediseño web.

---

## 5. Plan por etapas

Cada etapa necesita autorización propia.

| Etapa | Alcance | Toca Android | D1 |
|---|---|---|---|
| 0 | Respaldo y auditoría (esta entrega) | No | No |
| 1 | Muro público de solo lectura `/adopciones/saltacapital` y detalle `/adopciones/saltacapital/:id` con Open Graph. Nombre reservado. `adoptionCardFromAlert` y filtro `type` en `alertsFeed`. | No (pantalla solo web) | No |
| 2 | Publicar con cuenta desde la web: foto, cámara y flyer, «Mis publicaciones», adoptada, renovar y eliminar. Migración aditiva (`media_kind`, `extra_images`, `pet_id`, `paused_at`). | Solo si se comparte formulario | Migración aditiva |
| 3 | Denuncias y moderación: `reportContent`, ocultamiento automático y lista para el administrador | Opcional | `content_reports` existente |
| 4 | Invitados: `guest_posts`, Turnstile, `guestUpload`, enlace de administración, cron de vencimiento con borrado de imágenes y límites persistentes | No | Tabla nueva |
| 5 | Pausa automática a los 7 días para publicaciones registradas y alineación en Android por OTA | Sí | Uso de `paused_at` |
| 6 | Más localidades en `lib/adoptionLocalities.ts` | No | No |

Antes de la etapa 1 conviene tener capturas con sesión de «Quiero adoptar», los filtros y el
formulario. Requiere una cuenta de prueba indicada por vos (ver `antes-rediseno/README.md`).
