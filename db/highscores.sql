-- Tabla de récords de REAL TRAMPA para Supabase.
-- Ejecutar en el SQL Editor del proyecto de Supabase.

create table if not exists public.highscores (
  id bigint generated always as identity primary key,
  player_name text not null,
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

alter table public.highscores enable row level security;

-- Anónimo puede insertar su récord…
create policy "anon_insert_highscores" on public.highscores
  for insert to anon
  with check (true);

-- …y consultar el tablero, pero no borrar ni editar.
create policy "anon_select_highscores" on public.highscores
  for select to anon
  using (true);

-- El service_role (clave de servidor) borra/edita por bypass de RLS.