# Pivote · Calculadora de matrices paso a paso

Creada por Rogelio Emilio Medrano Díaz.
Todas las funciones son gratis; el sitio se financia con anuncios de Google AdSense.

- **Exacta:** fracciones y complejos sin redondeo (`1/3`, `2+3i`, `(1+i)^2`, `2,5`).
- **Paso a paso:** Gauss-Jordan, determinante (cofactores y eliminación), inversa, LU, Cramer, RREF/rango/espacios, valores y vectores propios.
- **Entregables:** copiar en LaTeX, descargar el procedimiento en `.tex`, imprimir a PDF.

## Estructura

```
src/core/        Motor matemático (sin DOM, probado con Vitest)
src/app/         Catálogo de operaciones
src/ui/          Editor de matrices, render con KaTeX, anuncios (ads.ts)
src/services/    Configuración, cuenta e historial (Supabase, opcional)
src/shared/      Límites (tamaño máximo, historial local)
supabase/        Esquema SQL opcional para cuentas e historial en la nube
privacidad.html  Aviso de privacidad (AdSense lo exige)
tests/           Pruebas del motor
```

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173  (con ?ads=preview muestra dónde van los anuncios)
npm test           # 50 pruebas del motor
npm run build      # typecheck + bundle en dist/
```

## Publicar en Netlify

1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify: Add new site → Import from GitHub. El `netlify.toml` ya trae el comando y la carpeta.
3. Compra un dominio propio (AdSense aprueba mejor un dominio que un subdominio de netlify.app) y conéctalo en Netlify → Domain management.
4. Llena los datos entre corchetes en `privacidad.html` (nombre, ciudad y correo).

## Activar Google AdSense

1. Entra a https://adsense.google.com con tu cuenta de Google y agrega tu dominio.
2. Copia tu ID de editor (`ca-pub-…`) y agrégalo en Netlify → Site configuration → Environment variables como `VITE_ADSENSE_CLIENT`. Vuelve a desplegar: el sitio cargará el script y publicará `/ads.txt` automáticamente.
3. Pide la revisión del sitio en AdSense. Suele tardar de unos días a 2 semanas.
4. Cuando te aprueben, crea dos bloques en Anuncios → Por bloque de anuncios → Anuncios de display (adaptables) y agrega sus IDs:
   - `VITE_ADSENSE_SLOT_RESULT`: debajo del resultado.
   - `VITE_ADSENSE_SLOT_FOOTER`: antes del pie de página.
5. Opcional: activa Anuncios automáticos en AdSense para que Google agregue más espacios por su cuenta.
6. Si recibes visitas de Europa o Reino Unido, activa el mensaje de consentimiento en AdSense → Privacidad y mensajes.

Reglas de AdSense que el código ya respeta: los anuncios están separados de botones y celdas (evita clics accidentales), se marcan como «Publicidad» y no se recargan en cada cálculo. Nunca hagas clic en tus propios anuncios ni pidas a otros que lo hagan: es causa de cierre de la cuenta.

## Cuentas e historial en la nube (opcional)

Sin configurar nada, el historial se guarda en el navegador. Para tenerlo en la nube: crea un proyecto en Supabase, ejecuta `supabase/schema.sql` y agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Netlify.
