// ============================================================
// Animaldex — Edge Middleware
// ============================================================
// Detecta bots de redes sociales (WhatsApp, Facebook, Twitter...)
// y les sirve las meta etiquetas Open Graph (/api/og) para que
// los enlaces compartidos muestren foto + título.
// Los usuarios normales pasan directo a la app.
// Este archivo NO depende de vercel.json (sobrevive redespliegues).
// ============================================================

const BOT_RE =
  /facebookexternalhit|facebot|facebookcatalog|twitterbot|whatsapp|telegrambot|linkedinbot|slackbot|slack-imgproxy|discordbot|pinterest|googlebot|bingbot|yandex|baiduspider|vkshare|redditbot|applebot|flipboard|tumblr|skypeuripreview|nuzzel|quora|bitlybot|embedly|iframely|snap url preview|viber|line-poker|kakaotalk/i;

export const config = {
  matcher: ['/p/:path*', '/pet/:path*', '/'],
};

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';

  // Usuarios normales: continuar a la app
  if (!BOT_RE.test(ua)) {
    return new Response(null, { headers: { 'x-middleware-next': '1' } });
  }

  const url = new URL(request.url);
  let rewrite = null;

  const post = url.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (post) {
    rewrite = new URL('/api/og', url.origin);
    rewrite.searchParams.set('type', 'post');
    rewrite.searchParams.set('id', decodeURIComponent(post[1]));
    const d = url.searchParams.get('d');
    if (d) rewrite.searchParams.set('d', d);
  }

  const pet = url.pathname.match(/^\/pet\/([^/]+)\/?$/);
  if (pet) {
    rewrite = new URL('/api/og', url.origin);
    rewrite.searchParams.set('type', 'pet');
    rewrite.searchParams.set('id', decodeURIComponent(pet[1]));
  }

  // Portada: OG genérico de Animaldex para bots
  if (url.pathname === '/') {
    rewrite = new URL('/api/og', url.origin);
  }

  if (rewrite) {
    return new Response(null, {
      headers: { 'x-middleware-rewrite': rewrite.toString() },
    });
  }

  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
