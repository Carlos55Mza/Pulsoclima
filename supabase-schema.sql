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
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

alter table public.reports add column if not exists latitude double precision;
alter table public.reports add column if not exists longitude double precision;
alter table public.reports add column if not exists photo_path text;
alter table public.reports add column if not exists status text not null default 'active' check (status in ('active', 'hidden'));
alter table public.reports add column if not exists hidden_reason text;
alter table public.reports add column if not exists moderated_at timestamptz;
alter table public.reports add column if not exists moderated_by uuid references public.profiles(id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Fotos públicas" on storage.objects;
drop policy if exists "Usuarios suben fotos propias" on storage.objects;
drop policy if exists "Usuarios eliminan fotos propias" on storage.objects;
create policy "Fotos públicas" on storage.objects for select using (bucket_id = 'report-photos');
create policy "Usuarios suben fotos propias" on storage.objects for insert with check (
  bucket_id = 'report-photos' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Usuarios eliminan fotos propias" on storage.objects for delete using (
  bucket_id = 'report-photos' and auth.uid()::text = (storage.foldername(name))[1]
);

create table if not exists public.report_confirmations (
  report_id bigint not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table if not exists public.report_flags (
  report_id bigint not null references public.reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 80),
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.forecasts enable row level security;
alter table public.reports enable row level security;
alter table public.report_confirmations enable row level security;
alter table public.report_flags enable row level security;

drop policy if exists "Perfiles visibles" on public.profiles;
drop policy if exists "Cada usuario edita su perfil" on public.profiles;
drop policy if exists "Pronósticos públicos" on public.forecasts;
drop policy if exists "Fundador publica pronósticos" on public.forecasts;
drop policy if exists "Fundador modifica pronósticos" on public.forecasts;
drop policy if exists "Reportes públicos" on public.reports;
drop policy if exists "Usuarios publican reportes" on public.reports;
drop policy if exists "Usuarios editan sus reportes" on public.reports;
drop policy if exists "Usuarios eliminan sus reportes" on public.reports;
drop policy if exists "Confirmaciones públicas" on public.report_confirmations;
drop policy if exists "Usuarios confirman reportes ajenos" on public.report_confirmations;
drop policy if exists "Usuarios retiran sus confirmaciones" on public.report_confirmations;
drop policy if exists "Usuarios denuncian reportes ajenos" on public.report_flags;
drop policy if exists "Moderadores ven denuncias" on public.report_flags;

create policy "Perfiles visibles" on public.profiles for select using (true);
create policy "Cada usuario edita su perfil" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));
create policy "Pronósticos públicos" on public.forecasts for select using (true);
create policy "Fundador publica pronósticos" on public.forecasts for insert with check (published_by = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'founder'));
create policy "Fundador modifica pronósticos" on public.forecasts for update using (exists (select 1 from public.profiles where id = auth.uid() and role = 'founder'));
create policy "Reportes públicos" on public.reports for select using (
  status = 'active' or user_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and role in ('founder', 'moderator')
  )
);
create policy "Usuarios publican reportes" on public.reports for insert with check (auth.uid() = user_id);
create policy "Usuarios eliminan sus reportes" on public.reports for delete using (auth.uid() = user_id);
create policy "Confirmaciones públicas" on public.report_confirmations for select using (true);
create policy "Usuarios confirman reportes ajenos" on public.report_confirmations for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.reports
    where public.reports.id = public.report_confirmations.report_id
      and public.reports.user_id <> auth.uid()
  )
);
create policy "Usuarios retiran sus confirmaciones" on public.report_confirmations for delete using (auth.uid() = user_id);
create policy "Usuarios denuncian reportes ajenos" on public.report_flags for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.reports
    where public.reports.id = public.report_flags.report_id
      and public.reports.user_id <> auth.uid()
  )
);
create policy "Moderadores ven denuncias" on public.report_flags for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('founder', 'moderator'))
);

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
create index if not exists report_confirmations_report_id_idx on public.report_confirmations (report_id);
create index if not exists report_flags_report_id_idx on public.report_flags (report_id);

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

create or replace function public.moderate_report(
  p_report_id bigint,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('founder', 'moderator')
  ) then
    raise exception 'No tenés permisos de moderación';
  end if;

  if p_action = 'hide' then
    update public.reports
    set status = 'hidden', hidden_reason = coalesce(p_reason, 'Ocultado por moderación'), moderated_at = now(), moderated_by = auth.uid()
    where id = p_report_id;
    delete from public.report_flags where report_id = p_report_id;
  elsif p_action = 'dismiss' then
    delete from public.report_flags where report_id = p_report_id;
  else
    raise exception 'Acción de moderación inválida';
  end if;
end;
$$;

revoke all on function public.moderate_report(bigint, text, text) from public;
grant execute on function public.moderate_report(bigint, text, text) to authenticated;

-- Después de registrar tu propia cuenta, ejecutá esta línea reemplazando el correo:
-- update public.profiles set role = 'founder' where id = (select id from auth.users where email = 'TU_CORREO');
