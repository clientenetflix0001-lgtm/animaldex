// ============================================================
// Configuración de la función og.js (previsualización de enlaces
// compartidos: foto + título al pegar un link en WhatsApp/Facebook/etc).
// El backend real de la app (auth, feed, likes, comentarios, tiempo
// real, subida de imágenes) vive en el Cloudflare Worker
// "animaldex-api" (ver /worker/index.js), no aquí.
// ============================================================

module.exports = {
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID || '76a9bc649184dfbf09c0b4319bcaa85b',
  // Token con permiso "D1: Edit" — solo se usa aquí para lecturas (SELECT)
  // al generar las meta-etiquetas Open Graph de posts/mascotas reales.
  // IMPORTANTE: nunca hardcodear el token aquí. Debe configurarse como
  // variable de entorno (CF_D1_TOKEN) en la plataforma de hosting
  // (Vercel/Cloudflare Pages → Project Settings → Environment Variables).
  CF_D1_TOKEN: process.env.CF_D1_TOKEN || '',
  CF_D1_DATABASE_ID: process.env.CF_D1_DATABASE_ID || 'c0ae095d-b9a5-4acd-b500-8a9c2be03010',
};
