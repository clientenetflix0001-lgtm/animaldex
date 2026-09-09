#!/bin/bash
# Copia las páginas legales estáticas a dist/ para Cloudflare Pages.
# expo export borra dist/, así que esto corre DESPUÉS del export.
set -e
cd "$(dirname "$0")/.."

mkdir -p dist/privacidad dist/eliminar-cuenta dist/legal
cp web/legal/privacidad/index.html dist/privacidad/index.html
cp web/legal/eliminar-cuenta/index.html dist/eliminar-cuenta/index.html
cp web/legal/legal.css dist/legal/legal.css
cp web/legal/assets/animaldex-logo-mark.png dist/legal/animaldex-logo-mark.png
echo "==> Páginas legales copiadas a dist/privacidad y dist/eliminar-cuenta"
