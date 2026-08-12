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

echo "==> Generando copias 'seguras' de assets bajo node_modules/ y con @ en el path..."
# "wrangler pages deploy" respeta .gitignore al escanear qué archivos subir,
# y el .gitignore del proyecto tiene "node_modules/" -> por eso NUNCA sube
# los assets de paquetes vendorizados por Metro (ej. la fuente de Ionicons
# en assets/node_modules/@expo/vector-icons/.../Fonts/*.ttf, o los íconos de
# @react-navigation/elements), sin importar si el nombre tiene "@" o no.
# Sin este paso, esos archivos faltantes devuelven silenciosamente el
# fallback de la SPA (200 + index.html) en vez del archivo real -> la
# fuente de Ionicons nunca carga -> pantalla en blanco infinita
# (fontsLoaded nunca pasa a true). El Worker (_worker.js) reescribe en
# tiempo real cualquier request afectada hacia esta copia "segura"
# (sin "node_modules" ni "@" en el path).
find dist -type f \( -path '*node_modules*' -o -path '*@*' \) | while read -r f; do
  safe="$(echo "$f" | sed 's/node_modules/vendor_modules/g; s/@/_/g')"
  mkdir -p "$(dirname "$safe")"
  cp "$f" "$safe"
done
echo "    $(find dist -type f \( -path '*node_modules*' -o -path '*@*' \) | wc -l) archivo(s) detectados y espejados."

echo "==> Desplegando a Cloudflare Pages (proyecto: animaldex-web)..."
npx wrangler pages deploy dist \
  --project-name animaldex-web \
  --branch main

echo "==> ¡Listo! Sitio disponible en https://animaldex-web.pages.dev"
