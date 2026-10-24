// Configuración pública (las llaves "anon" de Supabase son públicas por diseño;
// la seguridad la dan las políticas RLS de la base de datos).

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sin llaves, la app funciona completa en "modo local": sin login, historial solo en el navegador. */
export const CLOUD_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// ── Google AdSense ──────────────────────────────────────────────────
// Sin VITE_ADSENSE_CLIENT no se carga ningún anuncio (útil en desarrollo).

/** ID de editor, formato "ca-pub-1234567890123456". */
/** ID de editor de Pivote. Es público (aparece en el código de cada página); se puede cambiar con VITE_ADSENSE_CLIENT. */
export const DEFAULT_ADSENSE_CLIENT = 'ca-pub-3963398476293536';

/** En la demo no se cargan anuncios reales. */
export const ADSENSE_CLIENT = import.meta.env.VITE_DEMO === '1'
  ? undefined
  : (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || DEFAULT_ADSENSE_CLIENT;

/** IDs de bloque de anuncios creados en AdSense (Anuncios → Por bloque de anuncios). */
export const ADSENSE_SLOTS = {
  /** Debajo del resultado. */
  result: import.meta.env.VITE_ADSENSE_SLOT_RESULT as string | undefined,
  /** Entre el contenido informativo y el pie de página. */
  footer: import.meta.env.VITE_ADSENSE_SLOT_FOOTER as string | undefined,
};

/** Build de demostración (página de prueba): sin descargas ni impresión. */
export const DEMO = import.meta.env.VITE_DEMO === '1';

/** Muestra recuadros donde irán los anuncios: en la demo, o en desarrollo con ?ads=preview */
export const ADS_PREVIEW = !ADSENSE_CLIENT && (DEMO || new URLSearchParams(location.search).get('ads') === 'preview');
