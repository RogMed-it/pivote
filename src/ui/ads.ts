// Anuncios de Google AdSense.
// - El script de AdSense se carga una sola vez y solo si hay ID de editor.
// - Cada espacio es un <ins class="adsbygoogle"> fijo en la página: no se vuelve a
//   crear en cada cálculo (AdSense no permite "recargar" anuncios a voluntad).
// - Los espacios están separados de botones y celdas para evitar clics accidentales,
//   que AdSense penaliza.

import { h } from './dom';
import { ADSENSE_CLIENT, ADSENSE_SLOTS, ADS_PREVIEW } from '../services/config';

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

let loaded = false;

function loadScript() {
  if (loaded || !ADSENSE_CLIENT) return;
  loaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
  document.head.append(s);
}

export type AdPlace = keyof typeof ADSENSE_SLOTS;

/**
 * Devuelve el contenedor del anuncio, o null si no hay anuncios configurados.
 * Llama a `activate()` cuando el elemento ya esté en el DOM y sea visible.
 */
export function adSlot(place: AdPlace, className = ''): { el: HTMLElement; activate(): void } | null {
  const slot = ADSENSE_SLOTS[place];
  if (ADS_PREVIEW) {
    const el = h('aside', { class: `ad-slot ad-preview ${className}`, 'aria-label': 'Publicidad' }, h('span', {}, 'Aquí aparecerá un anuncio de Google AdSense'));
    return { el, activate() {} };
  }
  if (!ADSENSE_CLIENT || !slot) return null; // sin bloque: AdSense puede usar Anuncios automáticos
  const ins = h('ins', {
    class: 'adsbygoogle',
    style: 'display:block',
    'data-ad-client': ADSENSE_CLIENT,
    ...(slot ? { 'data-ad-slot': slot } : {}),
    'data-ad-format': 'auto',
    'data-full-width-responsive': 'true',
  });
  const el = h('aside', { class: `ad-slot ${className}`, 'aria-label': 'Publicidad' }, h('span', { class: 'ad-label' }, 'Publicidad'), ins);
  let done = false;
  return {
    el,
    activate() {
      if (done) return;
      done = true;
      loadScript();
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* bloqueador de anuncios: la página sigue funcionando */
      }
    },
  };
}

/** Carga el script aunque no haya bloques (para Anuncios automáticos de AdSense). */
export function initAds() {
  loadScript();
}
