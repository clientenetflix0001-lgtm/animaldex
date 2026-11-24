# Animaldex Adopciones — estadísticas y acceso al panel

Documento de operación. No publica secretos. No ejecutar migraciones ni deploys desde este archivo.

Panel: `https://adopciones.animaldex.com/admin`

No hay enlace al panel desde el catálogo. La URL no es el mecanismo de protección.

## Acceso administrativo

La autorización se verifica **en el Worker API** (`animaldex-api`) en cada consulta `adoptionsAnalytics`.

Administradores:

1. Username ya autorizado para herramientas internas: `lucasfuentes`.
2. Lista extra del servidor: variable/secreto `ADOPTIONS_ADMIN_USERNAMES` (usernames separados por coma).

Cómo sumar un usuario (sin pegar contraseñas ni tokens en el código):

```bash
# En el Worker animaldex-api, no en el frontend:
npx wrangler secret put ADOPTIONS_ADMIN_USERNAMES
# Valor de ejemplo (usernames de Animaldex, no emails):
# maria,otroadmin
```

También puede ir en `[vars]` de `wrangler.toml` del Worker API si no es secreto. No incluirlo en el bundle de la web.

El visitante debe iniciar sesión con esa cuenta. El frontend no decide el acceso: un 403 del Worker oculta los datos.

`/admin` lleva `X-Robots-Tag: noindex, nofollow` y está en `robots.txt` del subdominio (`Disallow: /admin`). Las visitas a `/admin` no se registran como tráfico público.

## Qué se registra

Solo el subdominio `adopciones.animaldex.com`. El cliente JS envía `adoptionsTrack` en segundo plano (`sendBeacon` / `fetch keepalive`). Los crawlers de Open Graph no ejecutan JS, así que no cuentan como visita humana.

Eventos: `page_view`, `adoption_detail_view`, `share_intent`, `share_link_copied`, `adopt_contact_click`, `publish_started`, `publish_completed`.

No se guardan IP, nombres, teléfonos ni correos de visitantes. Identificadores:

- `visitor_hash`: aleatorio en `localStorage`, ~13 meses.
- `session_hash`: aleatorio, 30 minutos de inactividad o cierre de pestaña.

Limitaciones: borrar datos del navegador crea un visitante nuevo. Varios dispositivos no se unen. Los “únicos” de un rango de varios días suman los únicos diarios y pueden contar a la misma persona más de una vez. El panel lo etiqueta como estimación.

Atribución de entrada: primer UTM o referrer de la sesión. Directo vacío = «Directo / desconocido», no se asume WhatsApp.

Detección de bots: lista de crawlers conocidos en el Worker + `navigator.webdriver` en el cliente. Un bot que ejecute JS y mienta el UA puede colarse. No es una exclusión perfecta.

## Duplicados

El cliente ignora el mismo `tipo+ruta+publicación+red` durante 1,8 s. El Worker rechaza `event_id` repetidos. No se rastrean imágenes, JS ni precargas: solo eventos explícitos de navegación/acción.

## Tablas (migración `022_adoptions_analytics.sql`)

No ejecutarla en este cambio. Aplicarla en D1 `animaldex-db` antes o junto con el deploy del Worker.

- `adoptions_analytics_events` — crudo, retención 90 días.
- `adoptions_analytics_daily` y satélites (`pages`, `posts`, `sources`, `devices`, `networks`) — agregados diarios, se conservan.
- `adoptions_analytics_totals` — históricos.
- `visitor_seen` / `session_seen` y auxiliares diarios (estos últimos se podan a los 3 días).

El cron diario `0 11 * * *` poda eventos viejos en lotes.

Si las tablas no existen, el track responde 204 y el panel 503 pidiendo la migración. Animaldex sigue funcionando.

## Costos teóricos (D1)

Cada página vista ≈ 8 escrituras (evento + daily + página + fuente + dispositivo + uniques auxiliares + totals). Los clics de compartir son menos.

| Tráfico | Escrituras / día | Eventos 90 d (aprox.) | Notas |
| --- | --- | --- | --- |
| 1.000 PV/día | ~8.000 | ~90.000 filas crudas | Cabo holgado en cuotas habituales de D1. |
| 10.000 PV/día | ~80.000 | ~900.000 | Vigilar writes diarios del plan. |
| 100.000 PV/día | ~800.000 | ~9 millones | Puede superar writes incluidos; hay que agregar más o recortar retención. |

Lecturas del panel: consultas por `day` indexado, no recorren todo el historial. Almacenamiento: eventos ~0,2–0,4 KB/fila; 100k PV/día × 90 d ≈ 1–2 GB de crudo. Los agregados diarios son pequeños.

No hay API externa de analytics. No se usa Cloudflare Web Analytics para el panel (no expone ranking por publicación ni eventos propios en el plan actual).

## Compartir

La barra vive solo en el detalle. Difundir sigue siendo el menú nativo. Instagram no publica solo: Web Share o copiar enlace. Los UTM van en el enlace compartido; el canonical/OG no cambia.

## Orden de despliegue (cuando se autorice)

1. Aplicar `migrations/022_adoptions_analytics.sql` en D1.
2. Deploy del Worker API (`animaldex-api`).
3. Configurar `ADOPTIONS_ADMIN_USERNAMES` si hace falta.
4. Deploy de Cloudflare Pages (web + `_worker.js`).
5. Probar `/admin` logueado y un `page_view` en el catálogo.

No desplegar hasta autorización explícita.
