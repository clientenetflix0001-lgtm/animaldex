# Adopciones web — capturas antes del rediseño

Capturas reales de `https://animaldex.com`, tomadas el 4 nov 2026 a las 22:34 (hora de Buenos Aires).
El sitio publicado corresponde al commit `0ca9a61d62af0e5ee2889fd611d40669c406be25`
(tag `backup/adopciones-web-antes-rediseno`).

## Método

- Chrome sin interfaz (`puppeteer-core`), **sin sesión**.
- Móvil: 390×844, escala 2, user agent de Android. Escritorio: 1440×900.
- Tema claro y oscuro elegidos con `prefers-color-scheme`. La app sigue el tema del sistema.
- No se tocó ningún botón que escriba datos. Lo único que se hizo fue cerrar el aviso
  «Únete a Animaldex», que es solo de la interfaz, y desplazar la página.
- Pedidos al Worker registrados durante las capturas, todos de lectura: `alertDetail`,
  `alertComments`, `petProfile` y `petPosts`. Detalle en `capturas.json` y
  `capturas-desplazamiento.json`.
- Datos reales que se ven: la alerta de adopción `alert-1789698918078-s3vztx` («Rambo»,
  Salta Capital; es la única adopción activa en D1) y la mascota de refugio `sasha.pet`.

## Archivos

| Archivo | Qué muestra |
|---|---|
| `01-visitante-inicio-movil.png` | Lo que ve un visitante sin sesión en `/`: el sitio redirige a `/entrar`. |
| `02-visitante-inicio-escritorio.png` | Lo mismo en escritorio. `/alertas` también redirige a `/entrar`. |
| `04-adopcion-detalle-movil-01/02.png` | Detalle público de una adopción (`/a/:id`): flyer, me gusta, comentarios, botón violeta «Quiero adoptarlo» y botón «Únete». |
| `05-adopcion-detalle-escritorio-01..04.png` | El mismo detalle en escritorio: la imagen ocupa todo el ancho, sin columna, y abajo aparecen los comentarios vacíos. |
| `06-adopcion-detalle-movil-oscuro-01/02.png` | El mismo detalle con tema oscuro automático. |
| `07-mascota-en-adopcion-perfil-movil-01/02.png` | Perfil público de una mascota de refugio en adopción (`/pet/sasha.pet`). |
| `08-mascota-en-adopcion-perfil-escritorio.png` | El mismo perfil en escritorio. Incluye el aviso «Únete». |
| `09-compartir-og-whatsapp.txt`, `09-compartir-og-facebook.txt` | Metadatos Open Graph que reciben WhatsApp y Facebook al compartir `/a/:id`. |
| `09-compartir-og-imagen.jpg` | La imagen `og:image` que se muestra en la vista previa. |

## Lo que no se pudo capturar sin iniciar sesión

En web, la pantalla «Quiero adoptar» (`AdoptionDiscovery`), sus filtros y su estado vacío,
el formulario «Crear alerta → En adopción», «Mis alertas» y el menú para compartir solo
existen dentro del navegador con sesión (`App.tsx`, `RootNavigator`). Un visitante solo
tiene acceso a `PublicNavigator`.

No hay credenciales de prueba en este entorno, y crear una cuenta habría escrito en D1.
Por eso esas pantallas **no tienen captura**. No se hicieron maquetas. Su
comportamiento está descrito a partir del código en `../INVENTARIO-antes-rediseno.md`.
Si querés capturarlas, hace falta una cuenta de prueba indicada por vos.
