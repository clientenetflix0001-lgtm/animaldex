#!/bin/bash
# ============================================================
# Animaldex — Deploy del sitio web a Cloudflare Pages
# ============================================================
# Reemplaza por completo la dependencia de Vercel. Uso:
#
#   export CLOUDFLARE_API_TOKEN=xxxxx
#   export CLOUDFLARE_ACCOUNT_ID=76a9bc649184dfbf09c0b4319bcaa85b
#   bash scripts/deploy-cf-pages.sh
#
# Qué hace:
# 1. Limpia dist/ (expo export lo regenera desde cero cada vez).
# 2. Exporta el proyecto Expo para todas las plataformas.
# 3. Copia el Worker de Pages (OG previews + SPA fallback) a dist/_worker.js.
# 4. Despliega dist/ a Cloudflare Pages con wrangler.
set -e

cd "$(dirname "$0")/.."

echo "==> Limpiando dist/ anterior..."
rm -rf dist 2>/dev/null || true

echo "==> Exportando proyecto Expo (web + ios + android)..."
npx expo export --platform all

echo "==> Copiando Worker de Pages (OG previews + SPA fallback)..."
cp cf-pages-worker.src.js dist/_worker.js

echo "==> Desplegando a Cloudflare Pages (proyecto: animaldex-web)..."
npx wrangler pages deploy dist \
  --project-name animaldex-web \
  --branch main

echo "==> ¡Listo! Sitio disponible en https://animaldex-web.pages.dev"
