// Inyecta metadatos Open Graph genéricos en dist/index.html después del export.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'dist-v2', 'index.html');
let html = fs.readFileSync(file, 'utf8');

const TITLE = 'Animaldex · La red social de tus mascotas 🐾';
const DESC =
  'Comparte fotos de tus mascotas, sigue a otros peluditos y descubre perfiles adorables.';
const IMAGE = 'https://placedog.net/600/600?id=12';

const meta = `
  <meta name="description" content="${DESC}" />
  <meta property="og:site_name" content="Animaldex" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${TITLE}" />
  <meta property="og:description" content="${DESC}" />
  <meta property="og:image" content="${IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${TITLE}" />
  <meta name="twitter:description" content="${DESC}" />
  <meta name="twitter:image" content="${IMAGE}" />
`;

html = html.replace(/<title>.*?<\/title>/, `<title>${TITLE}</title>`);
html = html.replace('</head>', `${meta}</head>`);
html = html.replace('<html lang="en">', '<html lang="es">');

fs.writeFileSync(file, html);
console.log('✓ OG metadata inyectada en dist/index.html');
