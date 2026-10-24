import { defineConfig, loadEnv, Plugin } from 'vite';
import { resolve } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Genera /ads.txt a partir de VITE_ADSENSE_CLIENT (AdSense lo exige en la raíz del dominio). */
function adsTxt(client?: string): Plugin {
  return {
    name: 'ads-txt',
    generateBundle() {
      const pub = client?.trim().replace(/^ca-/, '');
      if (!pub) return;
      this.emitFile({ type: 'asset', fileName: 'ads.txt', source: `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` });
    },
  };
}

/** Inserta el código de AdSense en el <head> del HTML: Google lo busca ahí para verificar el sitio. */
function adsenseHead(client: string): Plugin {
  return {
    name: 'adsense-head',
    transformIndexHtml() {
      return [
        { tag: 'meta', attrs: { name: 'google-adsense-account', content: client }, injectTo: 'head' },
        {
          tag: 'script',
          attrs: { async: true, src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`, crossorigin: 'anonymous' },
          injectTo: 'head',
        },
      ];
    },
  };
}

// `npm run build:demo` genera un único HTML autocontenido (para compartir una demo).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (mode === 'demo') {
    return { plugins: [viteSingleFile()], build: { outDir: 'dist-demo', assetsInlineLimit: 100_000_000 } };
  }
  const client = env.VITE_ADSENSE_CLIENT || 'ca-pub-3963398476293536';
  return {
    plugins: [adsTxt(client), adsenseHead(client)],
    build: {
      rollupOptions: {
        input: { main: resolve(__dirname, 'index.html'), privacidad: resolve(__dirname, 'privacidad.html') },
      },
    },
  };
});
