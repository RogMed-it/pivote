-- Esquema de Pivote para Supabase (OPCIONAL: solo para cuentas e historial en la nube).
-- Ejecútalo en SQL Editor una sola vez.

-- ── Perfiles académicos ─────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  university text,
  career text,
  semester smallint check (semester between 1 and 14),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "ver mi perfil" on public.profiles
  for select using (auth.uid() = id);

create policy "editar mi perfil" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- El usuario solo puede editar estas columnas.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, university, career, semester) on public.profiles to authenticated;

-- Crear el perfil automáticamente al registrarse.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Historial en la nube ────────────────────────────────────────────
create table if not exists public.calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  op text not null,
  input jsonb not null check (pg_column_size(input) < 20000),
  created_at timestamptz not null default now()
);

create index if not exists calculations_user_created on public.calculations (user_id, created_at desc);

alter table public.calculations enable row level security;

create policy "ver mis cálculos" on public.calculations
  for select using (auth.uid() = user_id);

create policy "borrar mis cálculos" on public.calculations
  for delete using (auth.uid() = user_id);

create policy "guardar mis cálculos" on public.calculations
  for insert with check (auth.uid() = user_id);
