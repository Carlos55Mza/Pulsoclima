-- PulsoClima: estructura inicial segura para Supabase
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Miembro',
  locality text,
  country text not null default 'Argentina',
  role text not null default 'member' check (role in ('member', 'founder', 'moderator')),
  created_at timestamptz not null default now()
);

create table if not exists public.forecasts (
  id bigint generated always as identity primary key,
  conditions text not null,
  temperature integer,
  summary text not null,
  location text not null default 'San Martín, Mendoza',
  published_by uuid not null references public.profiles(id),
  published_at timestamptz not null default now()
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  title text not null,
  details text,
  locality text not null,
  country text not null default 'Argentina',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.forecasts enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Perfiles visibles" on public.profiles;
drop policy if exists "Cada usuario edita su perfil" on public.profiles;
drop policy if exists "Pronósticos públicos" on public.forecasts;
drop policy if exists "Fundador publica pronósticos" on public.forecasts;
drop policy if exists "Fundador modifica pronósticos" on public.forecasts;
drop policy if exists "Reportes públicos" on public.reports;
drop policy if exists "Usuarios publican reportes" on public.reports;
drop policy if exists "Usuarios editan sus reportes" on public.reports;
drop policy if exists "Usuarios eliminan sus reportes" on public.reports;

create policy "Perfiles visibles" on public.profiles for select using (true);
create policy "Cada usuario edita su perfil" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));
create policy "Pronósticos públicos" on public.forecasts for select using (true);
create policy "Fundador publica pronósticos" on public.forecasts for insert with check (published_by = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'founder'));
create policy "Fundador modifica pronósticos" on public.forecasts for update using (exists (select 1 from public.profiles where id = auth.uid() and role = 'founder'));
create policy "Reportes públicos" on public.reports for select using (true);
create policy "Usuarios publican reportes" on public.reports for insert with check (auth.uid() = user_id);
create policy "Usuarios editan sus reportes" on public.reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Usuarios eliminan sus reportes" on public.reports for delete using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, locality, country)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Miembro'), new.raw_user_meta_data ->> 'locality', coalesce(new.raw_user_meta_data ->> 'country', 'Argentina'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists forecasts_published_at_idx on public.forecasts (published_at desc);

create or replace function public.publish_forecast(
  p_conditions text,
  p_temperature integer,
  p_summary text
)
returns public.forecasts
language plpgsql
security definer
set search_path = public
as $$
declare
  created_forecast public.forecasts;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'founder'
  ) then
    raise exception 'Solo la cuenta fundadora puede publicar pronósticos';
  end if;

  insert into public.forecasts (
    conditions, temperature, summary, location, published_by
  ) values (
    p_conditions, p_temperature, p_summary, 'San Martín, Mendoza', auth.uid()
  ) returning * into created_forecast;

  return created_forecast;
end;
$$;

revoke all on function public.publish_forecast(text, integer, text) from public;
grant execute on function public.publish_forecast(text, integer, text) to authenticated;

-- Después de registrar tu propia cuenta, ejecutá esta línea reemplazando el correo:
-- update public.profiles set role = 'founder' where id = (select id from auth.users where email = 'TU_CORREO');
