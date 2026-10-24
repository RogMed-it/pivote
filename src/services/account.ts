// Cuenta de usuario (opcional): sesión con Supabase Auth y perfil académico.

import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { CLOUD_ENABLED, SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export interface Profile {
  id: string;
  full_name: string | null;
  university: string | null;
  career: string | null;
  semester: number | null;
}

export interface AccountState {
  session: Session | null;
  profile: Profile | null;
}

// Se carga bajo demanda: sin llaves configuradas no se descarga el SDK.
export let supabase: SupabaseClient | null = null;

let state: AccountState = { session: null, profile: null };
const listeners = new Set<(s: AccountState) => void>();

export const getAccount = () => state;

export function onAccountChange(fn: (s: AccountState) => void) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function emit(next: Partial<AccountState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

async function loadProfile(session: Session | null) {
  if (!supabase || !session) return emit({ session, profile: null });
  const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  const profile = (data as Profile | null) ?? null;
  emit({ session, profile });
}

export async function initAccount() {
  if (!CLOUD_ENABLED) return;
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data } = await supabase.auth.getSession();
  await loadProfile(data.session);
  supabase.auth.onAuthStateChange((_e, session) => {
    void loadProfile(session);
  });
}

export const refreshAccount = () => loadProfile(state.session);

export async function signInWithEmail(email: string) {
  if (!supabase) throw new Error('El inicio de sesión no está configurado.');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
  if (error) throw error;
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('El inicio de sesión no está configurado.');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export async function saveProfile(p: Pick<Profile, 'full_name' | 'university' | 'career' | 'semester'>) {
  if (!supabase || !state.session) throw new Error('Inicia sesión para guardar tu perfil.');
  const { error } = await supabase.from('profiles').update(p).eq('id', state.session.user.id);
  if (error) throw error;
  await refreshAccount();
}
