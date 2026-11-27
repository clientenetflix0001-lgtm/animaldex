# Animaldex Adopciones — Google Analytics 4

Documento técnico y operativo de la integración con Google Analytics 4 en reemplazo del sistema propio de estadísticas en D1.

## Datos del flujo configurado

- **Propiedad**: Animaldex
- **URL del flujo web**: `https://adopciones.animaldex.com`
- **ID de medición**: `G-W0D1L1BDJL`
- **ID del flujo**: `16427081083`

## Alcance de ejecución

La etiqueta `gtag.js` (`https://www.googletagmanager.com/gtag/js?id=G-W0D1L1BDJL`) se inyecta y ejecuta **exclusivamente** cuando se cumplen todas las condiciones:

1. Plataforma web (`Platform.OS === 'web'`) sobre HTTPS.
2. Host exacto `adopciones.animaldex.com` (`isAdoptionsHost`).
3. Ruta pública de Adopciones (`/saltacapital`, futuras localidades, detalles `/:city/:alertId`, `/:city/publicar`, `/:city/mis-publicaciones`, `/entrar`, etc.).

**No** se carga ni envía eventos en:

- `animaldex.com` ni `www.animaldex.com`.
- Previews de Cloudflare Pages (`*.pages.dev`).
- Entornos locales (`localhost`, `127.0.0.1`, HTTP).
- Aplicación Android / iOS.
- Ruta retirada `/admin` (responde `404` con `noindex, nofollow` y sin SPA ni `gtag.js`).
- Páginas legales estáticas (`/privacidad`, `/eliminar-cuenta`, `/seguridad-infantil`) y bots de Open Graph (`WhatsApp`, `Facebook`, etc.).

## Medición SPA y prevención de visitas duplicadas

Se utiliza **una única estrategia manual** de `page_view`:

1. `gtag('config', 'G-W0D1L1BDJL', { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false })` desactiva el `page_view` automático inicial.
2. `AdoptionsAnalyticsBridge` espera a `authReady` y al asentamiento de estado de `NavigationContainer` (ventana de estabilización de 60 ms sobre eventos `state` y `popstate`), evitando falsos eventos durante `resetRoot` o renders intermedios de React.
3. `trackAdoptionsPageView` compara la ruta canónica normalizada contra `lastTrackedPath`; solo emite `page_view` cuando cambia efectivamente la ruta navegada.
4. En la primera carga se capturan los parámetros UTM de entrada (`window.__adxInitialLanding`) antes de que React Navigation limpie la barra de direcciones, conservando `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` y `utm_term` en `page_location`.

## Configuración manual obligatoria en Google Analytics 4

Como la SPA envía `page_view` manuales en cada cambio real de ruta, se debe **desactivar únicamente la detección automática de cambios del historial** en Medición mejorada para evitar duplicados:

1. Abrir **Google Analytics** y seleccionar la propiedad **Animaldex**.
2. Ir a **Administrar** (ícono de engranaje abajo a la izquierda).
3. En **Recogida y modificación de datos**, entrar en **Flujos de datos**.
4. Seleccionar el flujo web **Animaldex** (`https://adopciones.animaldex.com`, ID `16427081083`).
5. En la sección **Medición mejorada**, presionar el ícono de configuración (engranaje).
6. En **Vistas de página**, hacer clic en **Mostrar configuración avanzada**.
7. **Desmarcar** la casilla **«Cambios en la página basados en eventos del historial del navegador»** (*Page changes based on browser history events*).
8. Dejar activado el resto de Medición mejorada que se desee conservar (desplazamientos, clics de salida, etc.).
9. Hacer clic en **Guardar** arriba a la derecha.

### Configuraciones adicionales recomendadas en el panel de GA4

- **Google Signals y personalización de anuncios**: en *Administrar → Recogida y modificación de datos → Recogida de datos*, mantener **Google Signals desactivado** y la personalización de anuncios deshabilitada (el código también fija `allow_google_signals: false`, `allow_ad_personalization_signals: false` y Consent Mode con `ad_storage: 'denied'`, `ad_user_data: 'denied'`, `ad_personalization: 'denied'`).
- **Dimensiones personalizadas** (opcional pero recomendado para explorar parámetros en informes estándar): en *Administrar → Visualización de datos → Definiciones personalizadas → Crear dimensión personalizada* (ámbito: **Evento**), registrar:
  - `adoption_id` (parámetro `adoption_id`)
  - `species` (parámetro `species`)
  - `city` (parámetro `city`)
  - `share_network` (parámetro `share_network`)
- **Retención de datos**: en *Administrar → Recogida y modificación de datos → Conservación de datos*, ajustar de 2 meses a **14 meses** si se desean comparativas largas en Exploraciones.
- **Zona horaria y moneda**: verificar en *Detalles de la propiedad* que esté configurada en **Argentina (GMT-3)** (`America/Argentina/Salta` / Buenos Aires).

## Eventos personalizados enviados

Ningún evento incluye nombres de personas, `@usernames`, teléfonos, correos, tokens ni descripciones libres:

| Evento | Cuándo se dispara | Parámetros |
| --- | --- | --- |
| `page_view` | Cada navegación real completada en `adopciones.animaldex.com` | `page_location`, `page_title`, `page_referrer` (cuando corresponde) |
| `adoption_detail_view` | Cuando carga y se visualiza efectivamente una publicación de adopción existente | `adoption_id`, `species` (si está disponible), `city` |
| `share_intent` | Cuando el visitante elige una opción de compartir (barra social o botón Difundir) | `adoption_id`, `share_network` (`whatsapp`, `facebook`, `instagram`, `native`, `copy_link`), `species` (si está disponible), `city` |
| `share_link_copied` | Únicamente cuando el enlace se copia con éxito al portapapeles | `adoption_id`, `share_network` (`instagram`, `copy_link`), `species` (si está disponible), `city` |
| `adopt_contact_click` | Cuando se presiona «Quiero adoptarlo / Quiero adoptarla» | `adoption_id`, `species` (si está disponible), `city` |
| `publish_started` | Al iniciar el flujo de publicación con sesión iniciada | `city` |
| `publish_completed` | Solo cuando el servidor confirma la creación de la publicación (`res.alert.id`) | `adoption_id`, `species` (si está disponible), `city` |

## Estado de D1 y del sistema anterior

- `adoptionsTrack` responde `204 No Content` inmediato en `worker/index.js` sin tocar D1.
- `adoptionsAnalytics` responde `410 Gone` sin tocar D1.
- Se eliminó la poda diaria `pruneAdoptionsAnalytics` del cron `scheduled()`.
- Las 12 tablas creadas por `migrations/022_adoptions_analytics.sql` y el secreto `ADOPTIONS_ADMIN_USER_IDS` se conservan temporalmente sin lecturas ni escrituras nuevas.

## Orden recomendado de despliegue (cuando se autorice)

1. Verificar en Google Analytics 4 la desactivación de **«Cambios en la página basados en eventos del historial del navegador»** en el flujo `16427081083`.
2. Desplegar el **Worker API** (`animaldex-api`): deja `adoptionsTrack` en `204` sin escrituras en D1 para cualquier pestaña abierta con bundle anterior y desactiva `adoptionsAnalytics` + poda del cron.
3. Exportar y desplegar **Cloudflare Pages** (`animaldex-web` con `cf-pages-worker.src.js` copiado a `dist/_worker.js`): activa `gtag.js` (`G-W0D1L1BDJL`), los eventos de la SPA y el `404` en `/admin`.
4. Verificar en **Informes → Tiempo real** de GA4 una visita real en `https://adopciones.animaldex.com/saltacapital`.
