#!/bin/bash
# Copia las páginas legales estáticas a dist/ para Cloudflare Pages.
# expo export borra dist/, así que esto corre DESPUÉS del export.
set -e
cd "$(dirname "$0")/.."

mkdir -p dist/privacidad dist/eliminar-cuenta dist/seguridad-infantil dist/legal
cp web/legal/privacidad/index.html dist/privacidad/index.html
cp web/legal/eliminar-cuenta/index.html dist/eliminar-cuenta/index.html
cp web/legal/seguridad-infantil/index.html dist/seguridad-infantil/index.html
# Pages redirige /foo/index.html → /foo/ (308). El Worker lee copias planas
# bajo /legal/ para no devolver el body vacío de esa redirección.
cp web/legal/privacidad/index.html dist/legal/privacidad.html
cp web/legal/eliminar-cuenta/index.html dist/legal/eliminar-cuenta.html
cp web/legal/seguridad-infantil/index.html dist/legal/seguridad-infantil.html
cp web/legal/legal.css dist/legal/legal.css
cp web/legal/assets/animaldex-logo-mark.png dist/legal/animaldex-logo-mark.png
echo "==> Páginas legales copiadas a dist/privacidad, dist/eliminar-cuenta, dist/seguridad-infantil y dist/legal"
