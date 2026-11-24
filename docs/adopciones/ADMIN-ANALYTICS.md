# Animaldex Adopciones — estadísticas y acceso al panel

Documento de operación. No publica secretos. No ejecutar migraciones ni deploys desde este archivo.

Panel: `https://adopciones.animaldex.com/admin`

No hay enlace al panel desde el catálogo. La URL no es el mecanismo de protección.

## Acceso administrativo

La autorización se verifica **en el Worker API** (`animaldex-api`) en cada consulta `adoptionsAnalytics`.

1. El cliente envía el token de sesión (cookie / Bearer).
2. `authUser` resuelve `users.id` en el servidor. No se usa un id enviado en el JSON.
3. Ese id debe estar en el secreto **`ADOPTIONS_ADMIN_USER_IDS`**.
4. No hay lista por username. Cambiar el nombre de usuario no otorga ni quita acceso.

Si el secreto está vacío, nadie entra al panel (403).

### Cómo identificar la cuenta y configurar el id (durante el despliegue)

No configurar secretos ahora. Cuando se autorice:

```bash
# 1) Leer el id interno (D1 animaldex-db). No se consulta desde el frontend.
npx wrangler d1 execute animaldex-db --command \
  "SELECT id, username, created_at FROM users WHERE LOWER(username) = 'lucasfuentes'"

# 2) Guardar ese id (u-...) como secreto del Worker API. Varios ids separados por coma.
npx wrangler secret put ADOPTIONS_ADMIN_USER_IDS
```

El valor es el `id` de `users`, no el username. No incluirlo en el bundle web ni en `wrangler.toml` si se trata como secreto.

`/admin` lleva `X-Robots-Tag: noindex, nofollow` y está en `robots.txt` del subdominio (`Disallow: /admin`). Las visitas a `/admin` no se registran como tráfico público.

## Visitantes únicos y sesiones

Los únicos de un período **no** se suman día a día.

Se guardan tablas auxiliares `adoptions_analytics_daily_visitors` y `adoptions_analytics_daily_sessions` (un hash anónimo por día, **90 días**). El panel hace `COUNT DISTINCT` sobre el rango (hoy, ayer, 7 días, 30 días, semana, mes, personalizado).

Ejemplo: 100 personas que vuelven los 7 días → 700 páginas vistas y **100** visitantes únicos estimados, no 700.

Las sesiones del período también son DISTINCT: una sesión que cruza medianoche cuenta **una** vez en el total. El gráfico diario muestra actividad de ese día (la misma sesión puede aparecer en dos barras).

Identificadores:

- `visitor_hash`: aleatorio en `localStorage`, ~13 meses.
- `session_hash`: aleatorio, 30 minutos de inactividad o cierre de pestaña.

No se guardan IP, nombres, teléfonos ni correos.

Si el rango empieza **antes** de la ventana de 90 días, el panel muestra «No disponible». No se presenta la suma de únicos diarios como si fueran únicos del período.

El histórico de únicos usa `visitor_seen` (primer avistamiento, se conserva) y no una suma diaria.

## Qué se registra

Solo el subdominio `adopciones.animaldex.com`. El cliente JS envía `adoptionsTrack` en segundo plano (`sendBeacon` / `fetch keepalive`). Los crawlers de Open Graph no ejecutan JS, así que no cuentan como visita humana.

Eventos persistidos: `page_view`, `share_intent`, `share_link_copied`, `adopt_contact_click`, `publish_started`, `publish_completed`.

`adoption_detail_view` se acepta pero no se escribe: el `page_view` de un detalle ya incrementa `detail_views`. No duplica páginas vistas.

Compartir y «Quiero adoptarlo» son acciones: no suman visitas, únicos ni sesiones.

Atribución de entrada: primer UTM o referrer de la sesión. Directo vacío = «Directo / desconocido», no se asume WhatsApp.

Detección de bots: lista de crawlers conocidos en el Worker + `navigator.webdriver` en el cliente. Un bot que ejecute JS y mienta el UA puede colarse.

## Duplicados y consistencia

El cliente ignora el mismo `tipo+ruta+publicación+red` durante 1,8 s. El Worker inserta `event_id` UNIQUE **en la misma transacción** que los agregados (`DB.batch`). Un reintento choca con UNIQUE y no incrementa nada.

Si el batch falla a mitad, D1 revierte todo el lote.

## Tablas (migración `022_adoptions_analytics.sql`)

No ejecutarla todavía. Aplicarla en D1 `animaldex-db` antes o junto con el deploy del Worker.

- `adoptions_analytics_events` — crudo, retención 90 días.
- `adoptions_analytics_daily` y satélites (`pages`, `posts`, `sources`, `devices`, `networks`) — agregados diarios, se conservan.
- `adoptions_analytics_totals` — históricos (páginas, únicos de primer avistamiento, sesiones nuevas, shares).
- `visitor_seen` — primer avistamiento, se conserva.
- `session_seen` — 90 días (`last_seen_at`).
- `daily_visitors` / `daily_sessions` — 90 días, para DISTINCT del período.

El cron diario `0 11 * * *` poda eventos y hashes viejos en lotes.

Si las tablas no existen, el track responde 204 y el panel 503. Animaldex sigue funcionando.

## Costos teóricos (D1)

Una página vista entra en **una transacción** (~9–10 escrituras: evento, visitor_seen, session_seen, daily_visitors, daily_sessions, daily, pages, sources, devices, totals; +posts si es detalle). Antes eran ~12 pasos secuenciales con un extra de localidad y lecturas previas.

Se eliminó la fila extra de «localidad» (se agrega al leer). `adoption_detail_view` ya no escribe.

Compartir / contacto: ~3–5 escrituras (evento + daily de acciones + posts/redes), sin visitas.

| Tráfico | Escrituras / día (antes) | Escrituras / día (ahora) | Eventos 90 d |
| --- | --- | --- | --- |
| 1.000 PV | ~8.000 | ~9.000–10.000 de PV + acciones | ~90.000 |
| 10.000 PV | ~80.000 | ~90.000–100.000 | ~900.000 |
| 100.000 PV | ~800.000 | ~900.000–1.000.000 | ~9 millones |

El recuento por PV sube un poco porque se **conservan 90 días de hashes diarios** (antes se podaban a 3 y no servían para DISTINCT). A cambio hay menos round-trips, una transacción y cero escrituras de detalle duplicado.

Lecturas del panel: agregados por `day` + `COUNT DISTINCT` sobre las tablas de hashes (PK `day, hash`). No recorren todo el historial de eventos.

Almacenamiento extra: ~1 fila/visitante/día × 90 d. A 10k uniques/día ≈ 900k filas auxiliares, muy por debajo de los eventos crudos.

## Compartir

La barra vive solo en el detalle. Difundir sigue siendo el menú nativo. Instagram no publica solo: Web Share o copiar enlace. Los UTM van en el enlace compartido; el canonical/OG no cambia.

## Orden de despliegue (cuando se autorice)

1. Aplicar `migrations/022_adoptions_analytics.sql` en D1.
2. Deploy del Worker API (`animaldex-api`).
3. Identificar `users.id` y configurar `ADOPTIONS_ADMIN_USER_IDS` (secreto del Worker). Sin este paso el panel queda en 403.
4. Deploy de Cloudflare Pages (web + `_worker.js`).
5. Probar `/admin` logueado y un `page_view` en el catálogo.

No desplegar hasta autorización explícita.
