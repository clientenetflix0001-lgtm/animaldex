-- Animaldex Adopciones — estadísticas de visitas y difusión.
-- NO EJECUTAR desde este cambio. Aplicar en D1 animaldex-db cuando se autorice el deploy.
-- Zona horaria de agregación: America/Argentina/Salta (el Worker escribe `day` ya convertido).
-- Eventos crudos: retención 90 días. Totales y series diarias: se conservan.
-- daily_visitors / daily_sessions: 90 días para COUNT DISTINCT del período (no sumar únicos diarios).
-- No guarda IP, nombres, teléfonos ni correos de visitantes.

CREATE TABLE IF NOT EXISTS adoptions_analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  occurred_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  page_kind TEXT NOT NULL,
  path TEXT NOT NULL,
  locality_slug TEXT,
  alert_id TEXT,
  network TEXT,
  source TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  device TEXT NOT NULL,
  browser TEXT,
  os TEXT,
  visitor_hash TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  new_visitor INTEGER NOT NULL DEFAULT 0,
  new_session INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_adx_events_day ON adoptions_analytics_events(day);
CREATE INDEX IF NOT EXISTS idx_adx_events_type_day ON adoptions_analytics_events(type, day);
CREATE INDEX IF NOT EXISTS idx_adx_events_alert_day ON adoptions_analytics_events(alert_id, day);
CREATE INDEX IF NOT EXISTS idx_adx_events_occurred ON adoptions_analytics_events(occurred_at);

CREATE TABLE IF NOT EXISTS adoptions_analytics_daily (
  day TEXT PRIMARY KEY,
  page_views INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  share_intents INTEGER NOT NULL DEFAULT 0,
  share_copied INTEGER NOT NULL DEFAULT 0,
  adopt_clicks INTEGER NOT NULL DEFAULT 0,
  publish_started INTEGER NOT NULL DEFAULT 0,
  publish_completed INTEGER NOT NULL DEFAULT 0,
  detail_views INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS adoptions_analytics_daily_pages (
  day TEXT NOT NULL,
  page_key TEXT NOT NULL,
  page_kind TEXT NOT NULL,
  locality_slug TEXT,
  alert_id TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page_key)
);

CREATE INDEX IF NOT EXISTS idx_adx_pages_kind_day ON adoptions_analytics_daily_pages(page_kind, day);

CREATE TABLE IF NOT EXISTS adoptions_analytics_daily_posts (
  day TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  share_intents INTEGER NOT NULL DEFAULT 0,
  share_copied INTEGER NOT NULL DEFAULT 0,
  adopt_clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, alert_id)
);

CREATE TABLE IF NOT EXISTS adoptions_analytics_daily_sources (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  sessions INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source, utm_source, utm_medium, utm_campaign)
);

CREATE TABLE IF NOT EXISTS adoptions_analytics_daily_devices (
  day TEXT NOT NULL,
  device TEXT NOT NULL,
  browser TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  page_views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, device, browser, os)
);

CREATE TABLE IF NOT EXISTS adoptions_analytics_daily_networks (
  day TEXT NOT NULL,
  network TEXT NOT NULL,
  share_intents INTEGER NOT NULL DEFAULT 0,
  share_copied INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, network)
);

CREATE TABLE IF NOT EXISTS adoptions_analytics_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  page_views INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  share_intents INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL
);

-- Identificadores anónimos (hashes del cliente). Sin IP.
CREATE TABLE IF NOT EXISTS adoptions_analytics_visitor_seen (
  visitor_hash TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS adoptions_analytics_session_seen (
  session_hash TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- Un hash por visitante/sesión y día. Retención 90 días.
-- El panel hace COUNT DISTINCT sobre estas tablas para el período elegido.
-- PRIMARY KEY (day, hash) cubre los filtros BETWEEN day.
CREATE TABLE IF NOT EXISTS adoptions_analytics_daily_visitors (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);

CREATE TABLE IF NOT EXISTS adoptions_analytics_daily_sessions (
  day TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  PRIMARY KEY (day, session_hash)
);
