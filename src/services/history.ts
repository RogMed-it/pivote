// Historial de cálculos. Guarda las ENTRADAS (no los resultados): al abrir un
// elemento se vuelve a calcular, así el historial es pequeño y siempre correcto.
// Sin sesión: últimos N en este navegador. Con sesión: en la nube, sincronizado.

import { supabase, getAccount } from './account';
import { LOCAL_HISTORY } from '../shared/limits';

export interface SavedInput {
  op: string;
  A: string[][];
  B: string[][];
  k?: string;
  p?: number;
}

export interface HistoryItem extends SavedInput {
  id: string;
  title: string;
  created_at: string;
  cloud: boolean;
}

const KEY = 'pivote.history.v1';

function readLocal(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as HistoryItem[];
  } catch {
    return [];
  }
}

function writeLocal(items: HistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* almacenamiento bloqueado: el historial local es opcional */
  }
}

export const cloudOn = () => Boolean(supabase && getAccount().session);

export async function listHistory(): Promise<HistoryItem[]> {
  if (cloudOn()) {
    const { data, error } = await supabase!.from('calculations').select('id,title,op,input,created_at').order('created_at', { ascending: false }).limit(200);
    if (!error && data) {
      return data.map((r) => ({ id: r.id, title: r.title, created_at: r.created_at, cloud: true, ...(r.input as SavedInput), op: r.op }));
    }
  }
  return readLocal();
}

export async function saveHistory(title: string, input: SavedInput): Promise<'cloud' | 'local'> {
  if (cloudOn()) {
    const { error } = await supabase!.from('calculations').insert({ user_id: getAccount().session!.user.id, title, op: input.op, input });
    if (!error) return 'cloud';
  }
  const item: HistoryItem = { ...input, id: crypto.randomUUID(), title, created_at: new Date().toISOString(), cloud: false };
  writeLocal([item, ...readLocal()].slice(0, LOCAL_HISTORY));
  return 'local';
}

export async function deleteHistory(item: HistoryItem) {
  if (item.cloud && supabase) await supabase.from('calculations').delete().eq('id', item.id);
  else writeLocal(readLocal().filter((x) => x.id !== item.id));
}

// ── Enlaces compartibles (crecimiento: cada enlace compartido trae usuarios) ──

export function encodeShare(input: SavedInput): string {
  const json = JSON.stringify(input);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(s: string): SavedInput | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const v = JSON.parse(new TextDecoder().decode(bytes)) as SavedInput;
    if (typeof v.op !== 'string' || !Array.isArray(v.A) || !Array.isArray(v.B)) return null;
    const ok = (M: unknown) => Array.isArray(M) && M.length <= 10 && M.every((r) => Array.isArray(r) && r.length <= 10 && r.every((x) => typeof x === 'string' && x.length < 64));
    return ok(v.A) && ok(v.B) ? v : null;
  } catch {
    return null;
  }
}
