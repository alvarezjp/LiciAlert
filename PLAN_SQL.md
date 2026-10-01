# PLAN SQL — Reconstrucción desde cero del proyecto Supabase

> **Instrucción para cualquier agente de IA (o Claude) que lea este documento:**
> El proyecto Supabase anterior fue **eliminado por completo** (esquema, usuarios, cron jobs y Edge Functions) el 2026-09-10, porque la ingesta diaria de licitaciones dejó de funcionar (error en el log de Supabase al adquirir licitaciones) y se decidió reconstruir desde cero en vez de seguir depurando encima de un esquema con deuda acumulada de varias etapas.
> 1. Lee completo este archivo antes de escribir una sola línea de SQL o código. Ve a la sección **"Registro de avance"** al final — ahí está el estado real de la reconstrucción, no asumas nada por el nombre de los pasos.
> 2. Trabaja **un paso a la vez, en el orden numerado**. No saltes al paso 6 sin haber confirmado que el paso 5 quedó verificado — cada paso tiene un check de verificación explícito, no sigas sin correrlo.
> 3. No se está migrando ni recuperando ningún dato del proyecto anterior. El usuario confirmó explícitamente que no interesa el respaldo de licitaciones ya guardadas, porque el producto aún no está en producción. Todo lo que sigue es de cero.
> 4. Antes de terminar tu sesión (por límite de tokens, o porque terminaste un paso), **actualiza el Registro de avance** al final de este archivo, aunque el trabajo haya quedado a medias. Es obligatorio.
> 5. El código de referencia de `supabase/functions/ingesta-diaria/index.ts` de la Etapa 11 (proyecto anterior) está disponible como base de reescritura — **pero el usuario reportó un bug sin especificar en esa versión** que nunca se detalló antes de borrar el proyecto. No lo redespliegues tal cual asumiendo que está sano: revisar con lupa antes de reactivar el cron real (ver Paso 8). **ACTUALIZACIÓN 2026-09-15: el código ya fue reescrito por completo (esquema secuencial con delay + lock de exclusión mutua) durante la reconstrucción — ver Registro de avance de esa fecha. No se debe volver al código paralelo original de la Etapa 11 bajo ninguna circunstancia; se demostró que produce 429 de forma consistente.**
> 6. Este documento es independiente de `PLAN.md` (que sigue llevando las etapas de producto/negocio). `PLAN_SQL.md` es exclusivamente la reconstrucción de infraestructura. Cuando este documento se dé por cerrado, se vuelve al `PLAN.md` en el punto donde quedó (Etapa 11 sin resolver) o se abre una etapa nueva ahí para continuar.
> 7. **Project ref real de este proyecto: `blixpqacpejiopdfmyuy`** (confirmado en sesión 2026-09-15). Reemplazar cualquier `<ref-proyecto-nuevo>` que quede en este documento por ese valor antes de ejecutar los bloques correspondientes.

---

## 0. Contexto (para no repetir la investigación)

- Causa raíz sospechada del error de adquisición original (proyecto anterior): **rate limiting (429/403) del ticket de la API de Mercado Público**, posiblemente asociado a la IP de salida compartida de las Edge Functions de Supabase (usada por múltiples proyectos de otros clientes), no al volumen ni a la concurrencia del código propio. Se probó bajar concurrencia a 1 y el error persistió, lo que apoyaba esta hipótesis pero no la confirmaba al 100%.
- **CONFIRMACIÓN EMPÍRICA POSTERIOR (2026-09-15):** pruebas propias del usuario determinaron que la causa real no era ni volumen ni IP compartida, sino **cadencia de peticiones**: peticiones concurrentes producen 429 sin importar el número; peticiones estrictamente secuenciales con **2000ms de espera entre cada una** no producen ningún error. Esto reemplaza la hipótesis de IP compartida como explicación principal — ver Registro de avance 2026-09-15 para el rediseño completo derivado de este hallazgo.
- Se descartó explícitamente usar APIs de terceros no oficiales para los datos de licitaciones (ver `PLAN.md`, Etapa 8) — se sigue dependiendo únicamente de `api.mercadopublico.cl`.

---

## 1. Crear el proyecto Supabase nuevo

- [x] Crear proyecto nuevo en https://supabase.com/dashboard (mismo nombre u otro, a elección — no hay dependencia con el nombre anterior). **Project ref: `blixpqacpejiopdfmyuy`.**
- [x] Guardar de Settings → API: `Project URL`, `anon public key`, `service_role key` (o el sistema nuevo `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`, que el proyecto anterior ya soportaba con fallback — mantener ese mismo soporte dual en el código nuevo).
- [x] Confirmar región del proyecto (usar la misma que antes si se sabe cuál era, para no introducir latencia nueva sin necesidad).

## 2. Configurar variables de entorno

- [x] Actualizar `.env.local` en el repo Next.js con la URL y anon key nuevas
- [x] Actualizar las mismas variables en Vercel (Project Settings → Environment Variables) para Production **y** Preview.
- [x] Anotar en un lugar seguro (gestor de secretos, no en el repo) la `service_role key` nueva y el ticket de `MERCADOPUBLICO_TICKET`

## 3. Habilitar extensiones necesarias

Ejecutar en el SQL Editor del proyecto nuevo:

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
```

**Verificación:**
```sql
select extname from pg_extension where extname in ('pg_cron', 'pg_net');
-- debe devolver ambas filas
```

---

## 4. Esquema completo (tablas + GRANT + RLS + trigger)

Ejecutar todo este bloque de una sola vez en el SQL Editor. Incluye el GRANT explícito a `authenticated` y `service_role` **desde el día uno** en cada tabla — esta fue la lección más repetida en el proyecto anterior (tablas creadas por SQL Editor no heredan permisos automáticos, y sin GRANT las políticas RLS ni siquiera llegan a evaluarse, error 42501).

```sql
-- =========================================================
-- TABLA: perfiles
-- =========================================================
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'trial',
  trial_inicio timestamptz not null default now(),
  trial_fin timestamptz not null default (now() + interval '7 days'),
  activo boolean not null default true,
  telefono_whatsapp text,
  aviso_trial_enviado boolean not null default false,
  es_admin boolean not null default false
);

grant select, update on public.perfiles to authenticated;
grant all on public.perfiles to service_role;

alter table public.perfiles enable row level security;

create policy "usuario ve su propio perfil"
  on public.perfiles for select
  to authenticated
  using (id = auth.uid());

create policy "usuario actualiza su propio perfil"
  on public.perfiles for update
  to authenticated
  using (id = auth.uid());

-- =========================================================
-- FUNCIÓN + TRIGGER: crear fila en perfiles al registrarse
-- =========================================================
create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id) values (new.id);
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();

-- =========================================================
-- FUNCIÓN: trial_vigente() — patrón reutilizable para RLS
-- =========================================================
create or replace function public.trial_vigente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select trial_fin > now() and activo
     from public.perfiles
     where id = auth.uid()),
    false
  );
$$;

-- =========================================================
-- TABLA: licitaciones
-- =========================================================
create table public.licitaciones (
  codigo text primary key,
  nombre text not null,
  organismo text,
  fecha_publicacion date,
  fecha_cierre text,  -- se guarda como texto: el formato exacto que entrega
                       -- la API para FechaCierre no fue confirmado antes del
                       -- reset; verificar con una respuesta real antes de
                       -- asumir que castea limpio a `date`.
  estado text,
  monto_estimado numeric,
  descripcion text,
  productos_texto text,
  raw_json jsonb,
  raw_json_detalle jsonb,
  busqueda_vector tsvector generated always as (
    to_tsvector('spanish',
      coalesce(nombre, '') || ' ' ||
      coalesce(descripcion, '') || ' ' ||
      coalesce(productos_texto, '')
    )
  ) stored,
  actualizado_en timestamptz not null default now()
);

create index licitaciones_busqueda_idx on public.licitaciones using gin(busqueda_vector);
create index licitaciones_fecha_publicacion_idx on public.licitaciones (fecha_publicacion desc);
create index licitaciones_organismo_null_idx on public.licitaciones (fecha_publicacion desc) where organismo is null;

grant select on public.licitaciones to authenticated;
grant all on public.licitaciones to service_role;

alter table public.licitaciones enable row level security;

create policy "usuario con trial vigente ve licitaciones"
  on public.licitaciones for select
  to authenticated
  using (public.trial_vigente());

-- =========================================================
-- TABLA: keywords_usuario
-- =========================================================
create table public.keywords_usuario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  palabra_clave text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

grant select, insert, delete on public.keywords_usuario to authenticated;
grant all on public.keywords_usuario to service_role;

alter table public.keywords_usuario enable row level security;

create policy "usuario administra sus propias keywords"
  on public.keywords_usuario for all
  to authenticated
  using (user_id = auth.uid() and public.trial_vigente())
  with check (user_id = auth.uid());
-- =========================================================
-- TABLA: licitacion_usuario_estado
-- =========================================================
create table public.licitacion_usuario_estado (
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo_licitacion text not null references public.licitaciones(codigo) on delete cascade,
  estado text not null check (estado in ('vista', 'postulada')),
  actualizado_en timestamptz not null default now(),
  primary key (user_id, codigo_licitacion)
);

grant select, insert, update on public.licitacion_usuario_estado to authenticated;
grant all on public.licitacion_usuario_estado to service_role;

alter table public.licitacion_usuario_estado enable row level security;

create policy "usuario administra su propio estado de licitaciones"
  on public.licitacion_usuario_estado for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================
-- TABLA: notificaciones_enviadas
-- =========================================================
create table public.notificaciones_enviadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo_licitacion text not null,
  canal text not null,
  enviado_en timestamptz not null default now(),
  unique (user_id, codigo_licitacion, canal)
);

grant all on public.notificaciones_enviadas to service_role;
-- Sin GRANT a authenticated: esta tabla la maneja únicamente la Edge
-- Function con service_role, el usuario final nunca la toca directo.

alter table public.notificaciones_enviadas enable row level security;
-- RLS habilitado sin políticas: bloquea a authenticated/anon por completo,
-- service_role bypasea RLS automáticamente en Supabase.

-- =========================================================
-- TABLA: logs_ingesta
-- =========================================================
create table public.logs_ingesta (
  id uuid primary key default gen_random_uuid(),
  ok boolean not null,
  fecha_consultada text,
  cantidad_insertadas int not null default 0,
  cantidad_enriquecidas int not null default 0,
  mensaje_error text,
  creado_en timestamptz not null default now()
);

grant all on public.logs_ingesta to service_role;
alter table public.logs_ingesta enable row level security;
-- Sin políticas — solo service_role. Si más adelante se quiere mostrar
-- logs en el panel de admin, agregar una política de select para admin ahí.

-- =========================================================
-- TABLA: lotes_enriquecimiento (diseño de la Etapa 11)
-- =========================================================
create table public.lotes_enriquecimiento (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  corrida text not null,
  codigos_pendientes jsonb not null default '[]'::jsonb,
  total_codigos int not null default 0,
  completado boolean not null default false,
  notificacion_enviada boolean not null default false,
  creado_en timestamptz not null default now(),
  completado_en timestamptz
);

create index lotes_enriquecimiento_abiertos_idx
  on public.lotes_enriquecimiento (creado_en) where completado = false;

grant all on public.lotes_enriquecimiento to service_role;
alter table public.lotes_enriquecimiento enable row level security;
-- Sin políticas — solo service_role.

-- =========================================================
-- TABLA: estado_pausa_enriquecimiento (singleton, cortacircuito rate limit)
-- =========================================================
create table public.estado_pausa_enriquecimiento (
  id boolean primary key default true,
  pausado_hasta timestamptz,
  cortes_seguidos int not null default 0,
  constraint solo_una_fila check (id = true)
);

insert into public.estado_pausa_enriquecimiento (id) values (true);

grant all on public.estado_pausa_enriquecimiento to service_role;
alter table public.estado_pausa_enriquecimiento enable row level security;
-- Sin políticas — solo service_role.

-- =========================================================
-- TABLA: contador_llamadas_api (tope duro diario)
-- =========================================================
create table public.contador_llamadas_api (
  fecha date primary key,
  cantidad int not null default 0
);

grant all on public.contador_llamadas_api to service_role;
alter table public.contador_llamadas_api enable row level security;
-- Sin políticas — solo service_role.

create or replace function public.incrementar_contador_llamadas(p_fecha date, p_cantidad int)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.contador_llamadas_api (fecha, cantidad)
  values (p_fecha, p_cantidad)
  on conflict (fecha) do update
    set cantidad = public.contador_llamadas_api.cantidad + excluded.cantidad
  returning cantidad;
$$;

grant execute on function public.incrementar_contador_llamadas(date, int) to service_role;

-- =========================================================
-- TABLA: proceso_enriquecimiento_lock (AGREGADA 2026-09-15)
-- =========================================================
-- Lock de exclusión mutua para accion=continuar de ingesta-diaria.
-- Necesaria porque se confirmó en producción que dos invocaciones de la
-- Edge Function corriendo en paralelo (aunque cada una respete su propio
-- delay de 2000ms internamente) igual producen 429, porque la API ve el
-- conjunto combinado de peticiones concurrentes de ambos orígenes.
-- pg_cron NO protege contra esto por sí solo: net.http_post (pg_net) es
-- fire-and-forget, la sentencia SQL retorna de inmediato sin esperar a que
-- la Edge Function termine, así que la garantía de "pg_cron no corre 2
-- instancias del mismo job a la vez" protege la sentencia SQL, no la
-- duración real de la función.
create table public.proceso_enriquecimiento_lock (
  id boolean primary key default true,
  bloqueado_en timestamptz,
  constraint solo_una_fila check (id = true)
);

insert into public.proceso_enriquecimiento_lock (id) values (true);

grant all on public.proceso_enriquecimiento_lock to service_role;
alter table public.proceso_enriquecimiento_lock enable row level security;
-- Sin políticas — solo service_role.

create or replace function public.intentar_bloquear_enriquecimiento(p_segundos_stale int)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.proceso_enriquecimiento_lock
  set bloqueado_en = now()
  where id = true
    and (bloqueado_en is null or bloqueado_en < now() - (p_segundos_stale || ' seconds')::interval)
  returning true;
$$;

create or replace function public.liberar_bloqueo_enriquecimiento()
returns void
language sql
security definer
set search_path = public
as $$
  update public.proceso_enriquecimiento_lock set bloqueado_en = null where id = true;
$$;

grant execute on function public.intentar_bloquear_enriquecimiento(int) to service_role;
grant execute on function public.liberar_bloqueo_enriquecimiento() to service_role;
```

**Verificación:**
```sql
select tablename from pg_tables where schemaname = 'public' order by tablename;
-- deben aparecer las 10 tablas de arriba (9 originales + proceso_enriquecimiento_lock)

select * from public.estado_pausa_enriquecimiento;
-- debe existir exactamente 1 fila con id = true, cortes_seguidos = 0, pausado_hasta = null

select * from public.proceso_enriquecimiento_lock;
-- debe existir exactamente 1 fila con id = true, bloqueado_en = null
```
En la tabla lotes_enriquecimiento, agregar la columna:

sql
hora_envio_permitida timestamptz

Tabla nueva, agregar al final del bloque de esquema:

sql
-- =========================================================
-- TABLA: licitaciones_saltadas
-- =========================================================
create table public.licitaciones_saltadas (
  codigo text primary key references public.licitaciones(codigo) on delete cascade,
  nombre text,
  lote_id uuid,
  intentos int not null default 3,
  ultimo_status int,
  ultimo_error text,          -- primeros ~200 caracteres del body de la API
  saltada_en timestamptz not null default now(),
  revisada boolean not null default false
);

create index licitaciones_saltadas_pendientes_idx
  on public.licitaciones_saltadas (saltada_en desc) where revisada = false;

grant all on public.licitaciones_saltadas to service_role;
alter table public.licitaciones_saltadas enable row level security;
-- Sin políticas: solo service_role y las funciones securi
---


## 5. Funciones de negocio (búsqueda, notificaciones, admin, enriquecimiento)

```sql
-- =========================================================
-- Búsqueda por keywords (Full Text Search, spanish, con ranking)
-- =========================================================
create or replace function public.buscar_licitaciones_por_keywords(p_user_id uuid)
returns table (
  codigo text,
  nombre text,
  organismo text,
  monto_estimado numeric,
  estado text,
  fecha_cierre text,
  fecha_publicacion date,
  estado_usuario text,
  relevancia real
)
language sql
stable
as $$
  select distinct on (l.codigo)
    l.codigo,
    l.nombre,
    l.organismo,
    l.monto_estimado,
    l.estado,
    l.fecha_cierre,
    l.fecha_publicacion,
    coalesce(e.estado, 'nueva') as estado_usuario,
    ts_rank(l.busqueda_vector, plainto_tsquery('spanish', k.palabra_clave)) as relevancia
  from public.licitaciones l
  join public.keywords_usuario k
    on k.user_id = p_user_id
    and k.activo
    and l.busqueda_vector @@ plainto_tsquery('spanish', k.palabra_clave)
  left join public.licitacion_usuario_estado e
    on e.user_id = p_user_id
    and e.codigo_licitacion = l.codigo
  order by l.codigo, relevancia desc;
$$;
-- Sin security definer a propósito: hereda RLS de licitaciones
-- automáticamente (exige trial_vigente para ver filas).

-- =========================================================
-- Notificaciones pendientes (usado por enviar-notificaciones)
-- =========================================================
create or replace function public.buscar_notificaciones_pendientes()
returns table (
  user_id uuid,
  email text,
  codigo text,
  nombre text,
  organismo text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    u.email,
    l.codigo,
    l.nombre,
    l.organismo
  from public.perfiles p
  join auth.users u on u.id = p.id
  join public.keywords_usuario k on k.user_id = p.id and k.activo
  join public.licitaciones l
    on l.busqueda_vector @@ plainto_tsquery('spanish', k.palabra_clave)
  where p.activo
    and p.trial_fin > now()
    and not exists (
      select 1 from public.notificaciones_enviadas n
      where n.user_id = p.id
        and n.codigo_licitacion = l.codigo
        and n.canal = 'email'
    );
$$;
-- security definer: la llama la Edge Function con service_role,
-- que ya bypasea RLS por sí solo, pero se deja explícito por consistencia.

-- =========================================================
-- Admin: chequeo de rol
-- =========================================================
create or replace function public.es_admin_actual()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select es_admin from public.perfiles where id = auth.uid()), false);
$$;

-- =========================================================
-- Admin: estadísticas de licitaciones
-- =========================================================
create or replace function public.admin_stats_licitaciones()
returns table (
  total bigint,
  completas bigint,
  cargadas_hoy bigint,
  cargadas_hoy_completas bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) as total,
    count(*) filter (where organismo is not null and descripcion is not null) as completas,
    count(*) filter (
      where fecha_publicacion = (now() at time zone 'America/Santiago')::date
    ) as cargadas_hoy,
    count(*) filter (
      where fecha_publicacion = (now() at time zone 'America/Santiago')::date
      and organismo is not null and descripcion is not null
    ) as cargadas_hoy_completas
  from public.licitaciones
  where public.es_admin_actual();
$$;

-- =========================================================
-- Admin: estadísticas de usuarios
-- =========================================================
create or replace function public.admin_stats_usuarios()
returns table (
  email text,
  trial_inicio timestamptz,
  trial_fin timestamptz,
  dias_restantes int,
  notificado_hoy boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.email,
    p.trial_inicio,
    p.trial_fin,
    extract(day from (p.trial_fin - now()))::int as dias_restantes,
    exists (
      select 1 from public.notificaciones_enviadas n
      where n.user_id = p.id
        and n.canal = 'email'
        and (n.enviado_en at time zone 'America/Santiago')::date
            = (now() at time zone 'America/Santiago')::date
    ) as notificado_hoy
  from public.perfiles p
  join auth.users u on u.id = p.id
  where public.es_admin_actual();
$$;

-- =========================================================
-- Utilidad: unschedule seguro (no falla si el job no existe)
-- =========================================================
create or replace function public.cron_unschedule_seguro(p_nombre text)
returns void
language plpgsql
as $$
begin
  perform cron.unschedule(p_nombre);
exception
  when others then
    null; -- el job no existía, no es un error real
end;
$$;

-- =========================================================
-- Enriquecimiento: códigos sin organismo, por lista (AGREGADA 2026-09-15)
-- =========================================================
-- Evita el límite de tamaño de URL de PostgREST/HTTP2: un .in('codigo', [...])
-- con cientos o miles de códigos genera una URL tan larga que el gateway
-- responde "stream error: unspecific protocol error" (HTTP 500). Al pasar
-- el array como parámetro de una función RPC, viaja en el body del POST
-- en vez de en la querystring, evitando el límite por completo.
-- CONFIRMADO EN PRODUCCIÓN (2026-09-15): resolvió el error 500 real que
-- ocurría en accion=ingestar al filtrar contra ~900+ códigos del día.
create or replace function public.codigos_sin_organismo(p_codigos text[])
returns table (codigo text, nombre text)
language sql
stable
as $$
  select codigo, nombre
  from public.licitaciones
  where codigo = any(p_codigos)
    and organismo is null;
$$;

grant execute on function public.codigos_sin_organismo(text[]) to service_role;
```

**Verificación:**
```sql
select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname;
-- deben aparecer: manejar_usuario_nuevo, trial_vigente, buscar_licitaciones_por_keywords,
-- buscar_notificaciones_pendientes, es_admin_actual, admin_stats_licitaciones,
-- admin_stats_usuarios, cron_unschedule_seguro, incrementar_contador_llamadas,
-- codigos_sin_organismo, intentar_bloquear_enriquecimiento, liberar_bloqueo_enriquecimiento
```
Reemplazar codigos_sin_organismo por esta versión (excluye las saltadas):

sql
create or replace function public.codigos_sin_organismo(p_codigos text[])
returns table (codigo text, nombre text)
language sql
stable
as $$
  select l.codigo, l.nombre
  from public.licitaciones l
  where l.codigo = any(p_codigos)
    and l.organismo is null
    and not exists (
      select 1 from public.licitaciones_saltadas s where s.codigo = l.codigo
    );
$$;

grant execute on function public.codigos_sin_organismo(text[]) to service_role;

Agregar admin_stats_saltadas:

sql
create or replace function public.admin_stats_saltadas()
returns table (
  codigo text,
  nombre text,
  intentos int,
  ultimo_status int,
  ultimo_error text,
  saltada_en timestamptz,
  revisada boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.codigo, s.nombre, s.intentos, s.ultimo_status,
         s.ultimo_error, s.saltada_en, s.revisada
  from public.licitaciones_saltadas s
  where public.es_admin_actual()
  order by s.saltada_en desc
  limit 200;
$$;

Agregar admin_stats_lotes (con saltadas):

sql
drop function if exists public.admin_stats_lotes();
drop function if exists public.admin_stats_lotes(integer);

create function public.admin_stats_lotes(p_dias int default 14)
returns table (
  id uuid,
  fecha date,
  corrida text,
  total_codigos int,
  pendientes_actuales int,
  procesados_aprox int,
  saltadas int,
  completado boolean,
  creado_en timestamptz,
  completado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id, l.fecha, l.corrida, l.total_codigos,
    jsonb_array_length(l.codigos_pendientes) as pendientes_actuales,
    (l.total_codigos - jsonb_array_length(l.codigos_pendientes)) as procesados_aprox,
    (select count(*)::int from public.licitaciones_saltadas s where s.lote_id = l.id) as saltadas,
    l.completado, l.creado_en, l.completado_en
  from public.lotes_enriquecimiento l
  where public.es_admin_actual()
    and l.creado_en > now() - (p_dias || ' days')::interval
  order by l.creado_en desc;
$$;

Actualizar la verificación de funciones de la Sección 5: agregar admin_stats_saltadas y admin_stats_lotes a la lista esperada.

**Nota — función descartada originalmente, luego recreada por otra razón:** en el reset del 2026-09-10 se decidió NO recrear `codigos_pendientes_relevantes(p_limite int)` ni `codigos_sin_organismo(p_codigos text[])`, porque el diseño de lotes de la Etapa 11 no las necesitaba (calculaba pendientes directo en la Edge Function con `.in()`). **Esa decisión cambió el 2026-09-15**: `codigos_sin_organismo` sí se recreó, pero no por el motivo original (backlog histórico) sino porque el `.in()` con arrays grandes rompía HTTP/2. `codigos_pendientes_relevantes` sigue sin recrearse — su caso de uso (Paso C, backlog histórico best-effort) sigue fuera de alcance por decisión del usuario.

---

## 6. Crear el primer usuario y marcarlo admin

- [x] Hacer signup normal desde el frontend (o desde Authentication → Users → Add User en el dashboard).
- [x] Confirmar que el trigger creó la fila en `perfiles`:
  ```sql
  select * from public.perfiles;
  -- debe existir 1 fila con trial_fin = now() + 7 días
  ```
- [x] Marcar ese usuario como admin:
  ```sql
  update public.perfiles set es_admin = true where id = '<uuid del usuario>';
  ```

**Verificación:** `select es_admin_actual();` corrido como ese usuario (o vía RPC desde el frontend logueado) devuelve `true`.

---

## 7. Edge Functions

- [x] Confirmar que el CLI de Supabase está linkeado al proyecto nuevo: `npx supabase link --project-ref blixpqacpejiopdfmyuy`.
- [x] Configurar los secrets de las Edge Functions (no van en `.env.local`, son secrets propios de Supabase):
  ```
  npx supabase secrets set MERCADOPUBLICO_TICKET=<ticket real>
  npx supabase secrets set RESEND_API_KEY=<api key de Resend>
  npx supabase secrets set APP_URL=<URL real de Vercel>
  ```
  (`SUPABASE_URL` y la llave de servicio los inyecta Supabase automáticamente en cada Edge Function, no hace falta setearlos a mano.)
- [x] Recrear las 4 Edge Functions (`ingesta-diaria`, `enviar-notificaciones`, `avisar-trial-por-vencer`, `test-mp-api`) — código disponible completo en el repo.

  **`ingesta-diaria/index.ts` — REESCRITO POR COMPLETO el 2026-09-15, con 3 cambios de diseño respecto a la versión de la Etapa 11 (proyecto anterior). No volver al código paralelo original bajo ninguna circunstancia — se confirmó que produce 429 de forma consistente:**

  1. **Esquema de detalle: de paralelo a secuencial con delay fijo.** Se eliminó `CONCURRENCIA` y `Promise.all`. Ahora es un bucle `while` que procesa **un código a la vez**, con `await sleep(2000)` fijo entre cada petición al endpoint de detalle. Confirmado empíricamente: peticiones concurrentes producen 429 sin importar el volumen; peticiones secuenciales con 2000ms de espera no producen error. Costo medido: ~180ms de petición + 2000ms de espera ≈ 2.18s/código → ~61 códigos por invocación con `PRESUPUESTO_MS=135000`. El progreso del lote (`codigos_pendientes`) se persiste después de CADA código individual (no por tanda), para minimizar pérdida de trabajo si la invocación se corta. `MAX_TANDAS_FALLIDAS_SEGUIDAS` (por tanda) se reemplazó por `MAX_FALLOS_SEGUIDOS` (por código individual, umbral 3); un código que falla sin ser 429/403 se reintenta más tarde (se manda al final de la cola) en vez de bloquear el lote reintentando el mismo código indefinidamente.

  2. **Reemplazo de `.in()` por `.rpc('codigos_sin_organismo', ...)`.** BUG REAL encontrado en el primer despliegue de producción: `.from('licitaciones').select(...).in('codigo', codigosDeHoy)` con ~900+ códigos generaba una URL tan larga que rompía HTTP/2 entre la Edge Function y PostgREST (`stream error: unspecific protocol error`, HTTP 500). Se resolvió moviendo el filtro a una función RPC (`codigos_sin_organismo`, ver Sección 5), donde el array de códigos viaja en el body del POST en vez de en la querystring.

  3. **Lock de exclusión mutua para `accion=continuar`.** BUG REAL encontrado en producción: dos invocaciones de la función corriendo en paralelo (confirmado con `execution_id` distintos superpuestos en los logs) producen 429 aunque cada una respete su propio delay de 2000ms — el rate limit es sobre el conjunto de peticiones concurrentes que ve la API, no por invocación individual. Causa raíz: `net.http_post` (pg_net) es fire-and-forget, por lo que la garantía de "`pg_cron` no corre 2 instancias del mismo job a la vez" protege la sentencia SQL, no la duración real de la Edge Function — si una invocación tarda más que el intervalo entre disparos (incluyendo invocaciones manuales simultáneas), pueden solaparse. Se agregó `intentar_bloquear_enriquecimiento()` / `liberar_bloqueo_enriquecimiento()` (Sección 5): la rama `continuar` intenta tomar el lock al inicio (si falla, retorna de inmediato sin tocar la API externa) y lo libera en un bloque `finally` al final de `Deno.serve`, garantizando liberación incluso ante una excepción. `p_segundos_stale = 160` (margen sobre `PRESUPUESTO_MS = 135000`) evita que quede trabado permanentemente si una invocación crashea sin liberar.

  Código completo de las 4 funciones disponible en el repositorio del proyecto (`supabase/functions/*/index.ts`).

- [x] Desplegar cada una:
  ```
  npx supabase functions deploy ingesta-diaria --no-verify-jwt
  npx supabase functions deploy enviar-notificaciones --no-verify-jwt
  npx supabase functions deploy avisar-trial-por-vencer --no-verify-jwt
  npx supabase functions deploy test-mp-api --no-verify-jwt
  ```
  **Nota de seguridad:** `--no-verify-jwt` deja estas funciones invocables por cualquiera que tenga la URL, sin autenticación. Es el mismo patrón usado en el proyecto anterior (se llaman desde `pg_cron`/`pg_net`, que no pueden mandar un JWT de usuario), pero queda como riesgo conocido — no es una regresión de este reset, ya existía antes.

**Verificación:** `npx supabase functions list` muestra las 4 funciones con status `ACTIVE`.

---

## 8. Probar manualmente ANTES de activar el cron — incluye la investigación de rate limiting

Este paso es el más importante de todo el documento. No actives el cron (Paso 9) sin pasar por aquí primero.

- [x] Probar `test-mp-api` manualmente varias veces, en distintos momentos del día. **RESULTADO: el 429/403 sí aparece, pero se determinó que la causa NO es IP compartida ni volumen — es cadencia de peticiones (ver Sección 0 y Registro de avance 2026-09-15). Con 2000ms de espera fija entre peticiones, el error desaparece por completo.**
- [x] Probar `ingesta-diaria?accion=ingestar` manualmente. **RESULTADO: en el primer intento falló con HTTP 500 por el bug del `.in()` (ver Paso 7, punto 2). Tras corregirlo y redesplegar, corrió exitosamente: creó un lote con 907-963 códigos pendientes (según el conteo exacto de la corrida).**
- [x] Probar `ingesta-diaria?accion=continuar` manualmente. **RESULTADO: funcionó correctamente en corridas aisladas (56 códigos enriquecidos en una invocación, 0 errores). PERO se detectaron 2 eventos de 429 reales al correr `continuar` dos veces en sucesión rápida — diagnosticado como invocaciones solapadas (ver Paso 7, punto 3). Se corrigió con el lock de exclusión mutua.**
- [ ] **PENDIENTE — validar el lock en producción:** no confirmado todavía que el redeploy con el lock incluido se haya hecho, ni que las pruebas de abajo se hayan corrido:
  ```bash
  # Disparar 2 invocaciones simultáneas — una debe procesar, la otra debe
  # devolver el mensaje "Ya hay otra corrida de enriquecimiento en curso..."
  curl -i -X POST "https://blixpqacpejiopdfmyuy.supabase.co/functions/v1/ingesta-diaria?accion=continuar" &
  curl -i -X POST "https://blixpqacpejiopdfmyuy.supabase.co/functions/v1/ingesta-diaria?accion=continuar" &
  wait
  ```
  Luego confirmar que el lock se liberó:
  ```sql
  select bloqueado_en from public.proceso_enriquecimiento_lock;
  -- debe ser null una vez que la invocación activa terminó
  ```
- [ ] **PENDIENTE — vaciar el lote de prueba actual** (id `f8728b59-ee58-49a0-84cb-c9d35b029497` al cierre de la sesión 2026-09-15, con progreso parcial) corriendo `continuar` repetidamente (ya con el lock aplicado, sin disparar manualmente dos a la vez) hasta que `codigos_pendientes` llegue a un array vacío:
  ```sql
  select jsonb_array_length(codigos_pendientes) as pendientes, completado
  from public.lotes_enriquecimiento
  order by creado_en desc
  limit 1;
  ```
- [ ] **PENDIENTE — confirmar el disparo de notificaciones al completar un lote:** cuando `pendientes` llegue a 0, `completado` debe pasar a `true` automáticamente y debe dispararse `enviar-notificaciones` — confirmar revisando `notificacion_enviada` en esa misma fila y la tabla `notificaciones_enviadas`.

**No avanzar al Paso 9 hasta que estos 4 puntos pendientes queden confirmados y anotados en el Registro de avance.**

---

## 9. Activar los cron jobs

Solo después de confirmar el Paso 8. Ejecutar en el SQL Editor (ajustar horario UTC según la fecha real en que se ejecute esto — recordar la nota de horario de verano/invierno de Chile del proyecto anterior: UTC-3 en verano, UTC-4 en invierno). **Usar el project ref real: `blixpqacpejiopdfmyuy`.**

```sql
-- Ingesta de la mañana (00:00 Chile)
select cron.schedule(
  'ingesta-diaria-licitaciones',
  '0 3 * * *',  -- ajustar si no es horario de verano
  $$
  select net.http_post(
    url := 'https://blixpqacpejiopdfmyuy.supabase.co/functions/v1/ingesta-diaria?accion=ingestar',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Ingesta del mediodía (12:00 Chile)
select cron.schedule(
  'ingesta-mediodia-licitaciones',
  '0 15 * * *',
  $$
  select net.http_post(
    url := 'https://blixpqacpejiopdfmyuy.supabase.co/functions/v1/ingesta-diaria?accion=ingestar',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Continuar enriquecimiento por lotes (cada 180 segundos = 3 minutos).
-- CAMBIO 2026-09-15: se definió en 180s (no 300s/5min como en el diseño
-- original) porque el esquema de enriquecimiento pasó de paralelo a
-- secuencial con delay fijo de 2000ms. Con PRESUPUESTO_MS=135s, un
-- intervalo de 180s deja ~45s de margen antes del siguiente tick. 180 es
-- múltiplo exacto de 60, por eso se usa sintaxis estándar de cron
-- (*/3 * * * *) en vez de la sintaxis especial 'N seconds' (limitada a
-- 1-59). IMPORTANTE: el intervalo del cron por sí solo NO evita
-- solapamiento de invocaciones reales (net.http_post es fire-and-forget) —
-- la protección real contra esto es el lock de la Sección 5
-- (proceso_enriquecimiento_lock), no este número.
select cron.schedule(
  'continuar-enriquecimiento-lotes',
  '*/3 * * * *',
  $$
  select net.http_post(
    url := 'https://blixpqacpejiopdfmyuy.supabase.co/functions/v1/ingesta-diaria?accion=continuar',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Aviso de trial por vencer (una vez al día, horario fijo)
select cron.schedule(
  'aviso-trial-diario',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://blixpqacpejiopdfmyuy.supabase.co/functions/v1/avisar-trial-por-vencer',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

**Nota:** el job `notificaciones-diarias` del proyecto anterior **no se recrea** — fue reemplazado en la Etapa 11 por el disparo basado en evento ("lote completado"), que ya vive dentro de `ingesta-diaria` (llama a `enviar-notificaciones` cuando un lote termina). Recrearlo duplicaría envíos.

**Verificación:**
```sql
select jobname, schedule, active from cron.job order by jobname;
-- deben aparecer los 4 jobs de arriba, todos con active = true
```

Dejar corriendo así **2-3 días monitoreando `logs_ingesta` y `lotes_enriquecimiento`** antes de dar este documento por cerrado — mismo criterio de aceptación que ya tenía la Etapa 9 del `PLAN.md` original. Prestar especial atención a que no reaparezcan eventos de `cortadoPorCircuito: true` — si aparecen, revisar primero si es un 429 real (investigar de nuevo la cadencia) o un efecto del lock funcionando distinto a lo esperado.

---

## 10. Reconectar el frontend

- [ ] Confirmar que `utils/supabase/client.ts` y `utils/supabase/server.ts` no necesitan cambios de código — ya leen todo desde variables de entorno (ver Paso 2).
- [ ] Redesplegar en Vercel (o forzar un redeploy si las env vars se actualizaron después del último deploy — Vercel no las recoge en caliente).
- [ ] Probar login/signup real end-to-end contra el proyecto nuevo.
- [ ] Probar la página `/admin` con el usuario marcado como admin en el Paso 6 — confirmar que muestra datos reales y que un usuario no-admin es redirigido (este último punto quedó **sin verificar** también en el proyecto anterior — buena oportunidad para cerrarlo ahora que se empieza limpio).

**Verificación:** flujo completo de un usuario nuevo — registro → ve pantalla de trial vigente → agrega una keyword → ve licitaciones filtradas (una vez que la ingesta ya cargó datos) → marca una como vista/postulada → el estado persiste al recargar.

---

## 11. Cierre de este documento

Cuando los 10 pasos anteriores estén verificados y el monitoreo de 2-3 días del Paso 9 haya concluido sin sorpresas:

- [ ] Marcar este documento como cerrado en el Registro de avance.
- [ ] Volver a `PLAN.md` y agregar ahí una entrada de "Etapa 12 — reconstrucción de infraestructura completada", resumiendo brevemente el resultado (con o sin resolución confirmada del rate limiting) y enlazando a este archivo como referencia histórica de cómo se hizo.

---

## Registro de avance

> Cada agente (o Claude en cada sesión) debe agregar una entrada nueva **al final de esta lista** antes de terminar. No borrar entradas anteriores.

**Formato de entrada:**
```
### [Fecha] — Agente/sesión: [nombre o modelo]
- Paso(s) en el que se trabajó:
- Qué se completó:
- Qué quedó pendiente / a medias:
- Resultado de la investigación de rate limiting (si se llegó al Paso 8):
- Decisiones tomadas que no estaban en este documento:
- Bloqueos o cosas que el humano debe resolver:
- Próximo paso sugerido:
```

### [2026-09-10] — Agente/sesión: Claude (creación del documento)
- Paso(s) en el que se trabajó: Ninguno todavía — este documento se creó inmediatamente después de que el usuario eliminó el proyecto Supabase completo desde el dashboard.
- Qué se completó: Documento `PLAN_SQL.md` con los 11 pasos de reconstrucción, DDL completo consolidado (con GRANT explícito y RLS desde el día uno) y checklist de verificación por paso.
- Qué quedó pendiente / a medias: Todo — el proyecto Supabase nuevo aún no se ha creado (Paso 1).
- Resultado de la investigación de rate limiting: No aplica todavía, no se llegó al Paso 8.
- Decisiones tomadas que no estaban en este documento (documentadas aquí por primera vez):
  1. Se decidió NO recrear `codigos_pendientes_relevantes()` ni `codigos_sin_organismo()` en el reset, porque el diseño de lotes de la Etapa 11 no las necesita — quedan documentadas como descartadas a propósito en la sección 5, no como un olvido.
  2. Se decidió NO recrear el cron `notificaciones-diarias`, porque fue reemplazado por el disparo basado en evento dentro de `ingesta-diaria` — recrearlo duplicaría notificaciones.
  3. `fecha_cierre` se dejó como `text` en vez de `date` (como decía el modelo original en `PLAN.md`) porque nunca se confirmó el formato exacto que entrega la API — se prefiere no perder datos por un cast fallido silencioso.
- Bloqueos o cosas que el humano debe resolver: Ninguno para empezar el Paso 1. Sí habrá que decidir en el Paso 8 qué hacer si el rate limiting reaparece (ver las 3 opciones listadas ahí).
- Próximo paso sugerido: Empezar por el Paso 1 (crear el proyecto Supabase nuevo) y avanzar en orden. No saltarse el Paso 8 aunque parezca "solo una prueba más" — es la validación central de por qué se hizo este reset.

### [2026-09-12] — Agente/sesión: Claude (Paso 7 — diagnóstico del bug de 429/403 sin especificar)
- Paso(s) en el que se trabajó: Paso 7 (preparación) y adelanto de investigación del Paso 8.
- Qué se completó: Se revisó la lógica de cortocircuito de ingesta-diaria — no se encontró un bug en cómo interpreta los status HTTP (lee resp.status real, no hay lógica que lo confunda). Se identificó el problema real: nunca se capturaba el body ni headers de una respuesta fallida, solo el status — imposible distinguir un bloqueo de WAF/anti-bot (huella de la petición) de un rate-limit real de la API de Mercado Público. Se descartó la hipótesis de "cuota agotada" e "IP bloqueada" en base a evidencia del usuario: bajar concurrencia a 1 (secuencial) no cambió el resultado, lo que apunta lejos de un limitador por volumen/ráfaga.
- Qué quedó pendiente / a medias: Instrumentar obtenerDetalleLicitacion (captura de body+headers en fallos) y test-mp-api (parámetro ?navegador=1 para comparar con/sin headers de navegador) — código propuesto, no desplegado todavía. Falta correr las pruebas comparativas para confirmar si el bloqueo es por huella de la petición (User-Agent/headers) o por otra causa.
- Resultado de la investigación de rate limiting: Hipótesis reforzada de WAF/anti-bot por huella de la petición (no volumen, no cuota, no necesariamente IP compartida) — pendiente de confirmar con las pruebas instrumentadas.
- Decisiones tomadas que no estaban en este documento: Se agregó captura de body/headers en fallos y un modo de comparación con headers de navegador simulados, como paso previo obligatorio antes de seguir ajustando CONCURRENCIA/pausas del cortacircuito a ciegas.
- Bloqueos o cosas que el humano debe resolver: Correr las pruebas comparativas (con y sin headers de navegador) y revisar si el body de un fallo real es HTML (WAF) o JSON (API real) antes de decidir el siguiente paso.
- Próximo paso sugerido: Desplegar las versiones instrumentadas de test-mp-api e ingesta-diaria, correr varias pruebas en distintos momentos del día, y con esa evidencia decidir si basta con agregar headers de navegador de forma permanente o si hay que escalar a IP dedicada / contactar a Mercado Público.

### [2026-09-15] — Agente/sesión: Claude (rediseño de enriquecimiento + 2 bugs corregidos en despliegue real)
- Paso(s) en el que se trabajó: Paso 7 (código de Edge Function, 3 iteraciones) y validación práctica del Paso 8 (parcial — ver pendientes).
- Qué se completó:
  1. REDISEÑO DEL ENRIQUECIMIENTO: de tandas paralelas (`CONCURRENCIA`, `Promise.all`) a bucle secuencial con `sleep(2000)` fijo entre cada petición de detalle. Confirmado empíricamente por el usuario, fuera de este documento: peticiones concurrentes producen 429 sin importar volumen; peticiones secuenciales con 2000ms de espera NO producen error. El progreso del lote (`codigos_pendientes`) ahora se persiste después de CADA código individual, no por tanda.
  2. CRON `continuar-enriquecimiento-lotes` definido en 180 segundos (`*/3 * * * *`) en vez de 5 minutos — múltiplo exacto de 60, usable con sintaxis estándar de cron. Rendimiento esperado: ~61 códigos/invocación (135.000ms de presupuesto ÷ ~2.180ms por código).
  3. BUG #1 ENCONTRADO Y CORREGIDO EN DESPLIEGUE REAL: `.from('licitaciones').select(...).in('codigo', codigosDeHoy)` con codigosDeHoy de ~900+ elementos generaba una URL tan larga que rompía el protocolo HTTP/2 entre la Edge Function y PostgREST (`stream error: unspecific protocol error`, HTTP 500). Se resolvió creando la función SQL `codigos_sin_organismo(p_codigos text[])` y reemplazando el `.in()` por `.rpc(...)` — el array viaja en el body del POST, no en la URL. CONFIRMADO FUNCIONANDO tras redeploy: `accion=ingestar` corrió sin error, creó el lote correctamente (907 códigos pendientes de un total de 963).
  4. BUG #2 ENCONTRADO Y CORREGIDO EN DESPLIEGUE REAL: se detectaron 2 eventos de 429 reales en producción (23:04 y 23:06 del 2026-09-15) — analizando los logs se confirmó que NO fueron causados por el delay de 2000ms fallando, sino por DOS INVOCACIONES DE LA FUNCIÓN CORRIENDO EN PARALELO al mismo tiempo (execution_id distintos superpuestos en el tiempo, cada una respetando su propio delay pero combinadas la API veía peticiones concurrentes de origen distinto). Se determinó que esto es un riesgo real para el cron de producción también, no solo para pruebas manuales simultáneas: `net.http_post` de `pg_net` es fire-and-forget (encola la petición HTTP y la sentencia SQL retorna de inmediato), por lo que la protección de "pg_cron no corre 2 instancias del mismo job a la vez" protege la sentencia SQL, NO la duración real de la Edge Function — si una invocación tarda más que el intervalo del cron, es posible que se solapen invocaciones reales igualmente.
  5. Se implementó un LOCK explícito de exclusión mutua en base de datos: tabla `proceso_enriquecimiento_lock` (singleton) + funciones `intentar_bloquear_enriquecimiento(p_segundos_stale int)` (toma el lock solo si está libre o si quedó "stale" hace más de N segundos, para no trabarse permanentemente ante un crash) y `liberar_bloqueo_enriquecimiento()`. Integrado en `ingesta-diaria/index.ts`: la rama `accion=continuar` intenta tomar el lock al inicio (si falla, retorna de inmediato sin tocar la API externa) y lo libera en un bloque `finally` al final del `Deno.serve`, garantizando liberación incluso si la función lanza una excepción. `p_segundos_stale` configurado en 160 (margen sobre `PRESUPUESTO_MS=135000`).
- Qué quedó pendiente / a medias:
  1. **EL LOCK NO ESTÁ VALIDADO TODAVÍA EN PRODUCCIÓN.** Se diseñó y se dio el código completo al usuario, pero al cierre de esta sesión no se había confirmado el redeploy ni las pruebas del Paso a paso sugerido (disparar 2 curls simultáneos y confirmar que uno se omite; confirmar que el lock se libera después).
  2. El Paso 8 completo (probar `ingestar` + `continuar` repetido varias veces sin 429, y confirmar que `completado` pasa a `true` cuando el lote llega a 0) sigue sin cerrarse — se interrumpió por el hallazgo de los bugs #1 y #2.
  3. El lote actual en curso (id `f8728b59-ee58-49a0-84cb-c9d35b029497`, fecha del listado indeterminada por bug de "fecha": null en la respuesta de `continuar` — ver punto 4 abajo) quedó con progreso parcial (907 pendientes de 963 originales al momento de creación, avanzando de a ~18-56 por corrida). Hay que seguir corriendo `continuar` (ya con el lock aplicado) hasta que este lote específico llegue a 0 antes de considerar el flujo end-to-end validado.
  4. DETALLE MENOR SIN INVESTIGAR: en las respuestas de `accion=continuar` el campo `"fecha"` sale `null` — esto es esperado por diseño (la variable `fecha` solo se asigna en la rama `else` / `accion=ingestar`), no es un bug, pero vale la pena confirmar que no se espera lo contrario en algún otro lugar del sistema (ej. panel de admin) antes de dar el flujo por cerrado.
  5. Project ref real confirmado en esta sesión: **blixpqacpejiopdfmyuy** — ya reemplazado en todos los bloques de este documento en esta actualización.
- Decisiones tomadas que no estaban en este documento:
  1. Se recreó `codigos_sin_organismo(p_codigos text[])` pese a que la Sección 5 la había descartado explícitamente en la sesión del 2026-09-10 — la razón original de descarte (backlog histórico, Paso C de la Etapa 9) sigue sin aplicar, pero surgió una razón nueva y distinta (límite de tamaño de URL de PostgREST) que sí la justifica. Dejar esto claro para que no se vuelva a descartar por error basándose en la nota vieja.
  2. Se agregó una tabla nueva no contemplada en el diseño original de la Etapa 11 (`proceso_enriquecimiento_lock`) — necesaria porque el diseño de lotes asumía que `pg_cron` por sí solo evitaba solapamiento, lo cual se demostró falso para Edge Functions invocadas vía `pg_net` (asíncrono).
- Bloqueos o cosas que el humano debe resolver:
  1. Confirmar si ya se hizo el redeploy de `ingesta-diaria` con el lock incluido.
  2. Correr las pruebas de lock pendientes (2 curls simultáneos) y las repeticiones de `continuar` hasta vaciar el lote actual.
- Próximo paso sugerido: validar el lock en producción (Paso a paso ya definido en la Sección 8: 2 curls simultáneos → uno debe omitirse con el mensaje "Ya hay otra corrida..." → confirmar que `bloqueado_en` vuelve a `null` después). Luego seguir corriendo `continuar` (secuencial, uno a la vez, sin solapar manualmente) hasta que el lote `f8728b59-...` llegue a 0 pendientes y `completado` pase a `true`, confirmando además que se dispara `enviar-notificaciones`. Recién ahí cerrar el Paso 8 y pasar al Paso 9 (activar los 4 cron jobs, ya con el project ref real incluido en los bloques de esta versión del documento).
### [2026-09-16] — Agente/sesión: Claude (validación del Paso 8 completa + 2 bugs nuevos de frontend/SQL corregidos + 1 bug de fondo detectado sin resolver)

- Paso(s) en el que se trabajó: Cierre del Paso 8 (validación en producción) + correcciones puntuales de UI/esquema fuera del flujo de `PLAN-SQL.md` pero necesarias para poder diagnosticar bien.

- Qué se completó:
  1. **Paso 8 confirmado por el usuario, con evidencia real del 15 y 16/09:** las 2 invocaciones simultáneas de `accion=continuar` se probaron y el lock funcionó como se esperaba (una se omite con el mensaje de "ya hay otra corrida en curso"). El lote de prueba `f8728b59-...` (creado 15/09) llegó a `pendientes_actuales = 0` y `completado = true` (completado_en: 2026-09-15 23:49:29 UTC). Se disparó el correo de notificación automáticamente al completarse. **Los 4 puntos pendientes que cerraban el Paso 8 quedan confirmados.**
  2. **Bug encontrado y corregido — `keywords_usuario` sin columna `creado_en`:** el frontend (`app/keywords/page.tsx`) siempre asumió `.order('creado_en', ...)`, pero el esquema reconstruido en la Sección 4 de este documento nunca la incluyó. Se agregó con:
```sql
     alter table public.keywords_usuario
       add column creado_en timestamptz not null default now();
```
     y se actualizó el DDL de referencia de la Sección 4 de este documento para incluirla desde el día uno en cualquier reconstrucción futura.
  3. **Bug encontrado y corregido — desfase de nombres de columnas entre `admin_stats_licitaciones()`/`admin_stats_usuarios()` y `app/admin/page.tsx`:**
     - La función devuelve `cargadas_hoy` / `cargadas_hoy_completas`, pero el frontend leía `stats.hoy` / `stats.hoy_completas` (undefined, por eso el panel mostraba "Cargadas hoy" en blanco sin lanzar error).
     - La función devuelve `notificado_hoy`, pero el frontend leía `correo_enviado_hoy`.
     - La función **no devolvía `user_id`**, pero el frontend lo usaba como `key` de fila en la tabla de usuarios (React sin key estable con más de un usuario).
     Se corrigió `admin_stats_usuarios()` (con `drop function` + recreate, porque cambia el tipo de retorno) agregando `user_id` a la salida, y se corrigió `app/admin/page.tsx` para usar los nombres reales de columnas. Confirmado por el usuario: el panel ya muestra "Cargadas hoy: 1044" correctamente tras el fix.
  4. **Prueba real de `accion=ingestar` para el 16/09/2026:** insertó 1044 licitaciones nuevas del día, creó el lote `85677d63-b5d1-4b23-9077-3a69cb5780f1` con `total_codigos = 1000` (los 44 restantes ya tenían `organismo` de antes y quedaron correctamente excluidos por `codigos_sin_organismo`). El lote llegó a `pendientes_actuales = 0` y `completado_en = 2026-09-16 22:56:04 UTC`, dentro de la misma invocación (por eso el `curl` de `accion=continuar` lanzado 90 segundos después devolvió "ya hay otra corrida en curso" — el lock seguía tomado por la propia invocación de `ingestar`, que todavía no había terminado de responder pese a que el cliente ya había recibido el JSON, coherente con `Transfer-Encoding: chunked`). **No hubo ningún proceso fantasma corriendo solo** — quedó descartado como duda del usuario.
  5. Confirmado con el usuario que el cron `continuar-enriquecimiento-lotes` (`*/3 * * * *`) **ya está activo** en el proyecto (`select jobname, active from cron.job` lo devuelve como único resultado, `active = true`) — aparentemente activado en una sesión anterior sin quedar registrado en este documento. **Los otros 3 crons del Paso 9 (`ingesta-diaria-licitaciones`, `ingesta-mediodia-licitaciones`, `aviso-trial-diario`) NO aparecen en esa consulta — siguen sin activar.**

- Qué quedó pendiente / a medias:
  1. **BUG DE FONDO DETECTADO, SIN CONFIRMAR CAUSA RAÍZ (llevar como prioridad a la próxima sesión):** de los 1000 códigos del lote `85677d63` (16/09), el lote se marcó `completado = true` y se envió la notificación de "coincidencias" como si el enriquecimiento fuera completo, pero **36 de esos 1000 quedaron con `organismo = null`** (confirmado con `select count(*) from licitaciones where fecha_publicacion = '2026-09-16' and organismo is null` → 36; `con_organismo` → 1008 de 1044 totales del día, de los cuales 1000 pasaron por el lote).
     - **Causa identificada a nivel de código:** en `procesarLote` (`supabase/functions/ingesta-diaria/index.ts`), la rama `if (resultado.ok)` trata cualquier respuesta HTTP exitosa de `obtenerDetalleLicitacion` como "enriquecida" y saca el código de `pendientes` de forma permanente — **sin verificar que `detalle.Comprador?.NombreOrganismo` realmente haya venido con un valor**. Es decir, el código no distingue entre "la petición no falló" y "conseguí el dato que buscaba". Si la API responde 200 con `Comprador` ausente o vacío para cierto código, ese registro se sube con `organismo: null` y nunca se vuelve a poner en cola — el lote se completa igual y dispara la notificación como si todo estuviera al día.
     - **NO CONFIRMADO todavía cuál es la causa de fondo dentro de esa rama:** (a) vacío legítimo de la API de Mercado Público para cierto tipo de licitaciones (ej. Compra Ágil / Trato Directo sin comprador estructurado) — en ese caso no es un bug de código sino un estado real que hay que dejar de reintentar y reflejar distinto en el panel de admin; o (b) un bug real de mapeo (el dato sí viene en el JSON pero en otra ruta/nombre de campo que `detalle.Comprador?.NombreOrganismo` no captura). **Se pidió al usuario repetir la prueba con datos del 21/09/2026 e inspeccionar `raw_json_detalle` de algún código afectado para diferenciar ambos casos antes de tocar el código de producción.**
     - Query de diagnóstico entregada al usuario para correr con datos frescos de hoy:
```sql
       select l.codigo, l.nombre, l.raw_json_detalle
       from public.licitaciones l
       where l.fecha_publicacion = (now() at time zone 'America/Santiago')::date
         and l.organismo is null
         and l.raw_json_detalle is not null
       limit 5;
```
       (Si en cambio `raw_json_detalle` también sale null para esos casos, la causa es distinta a la aquí documentada — el código nunca llegó a completar `resultado.ok` para esas filas, y hay que revisar la rama de fallos/reintento en vez de la rama de éxito.)
  2. **Activación del Paso 9 sigue incompleta:** falta activar `ingesta-diaria-licitaciones`, `ingesta-mediodia-licitaciones` y `aviso-trial-diario`. No conviene activarlos hasta resolver el punto 1 (si el bug de "completado sin organismo" también afecta el criterio con el que se dispara la notificación de forma recurrente, mejor corregirlo antes de dejarlo 100% automático).
  3. **Punto B pendiente (pedido explícito del usuario, fuera de `PLAN-SQL.md` pero relacionado):** agregar al panel de admin un desglose de licitaciones del día por corrida (mañana/tarde) y por estado de enriquecimiento (pendientes vs. enriquecidas vs. con organismo null "definitivo"), para que la discrepancia de conteos no vuelva a generar dudas. No iniciado todavía.
  4. Paso 10 (reconectar y probar frontend end-to-end) sigue sin iniciar.

- Resultado de la investigación de rate limiting: No aplica a esta sesión — no hubo nuevos eventos de 429/403. El hallazgo de hoy es un bug de lógica de negocio (verificación incompleta de éxito), no relacionado con cadencia ni rate limiting.

- Decisiones tomadas que no estaban en este documento:
  1. Se corrigieron 2 desfases de nombres de columnas entre funciones SQL y frontend (`keywords_usuario.creado_en` faltante, y `admin_stats_*` con nombres de campo distintos a los que lee `admin/page.tsx`) — no estaban documentados como pendientes en ninguna sesión anterior, se descubrieron recién al usarlos en producción.
  2. Se decidió NO activar los 3 crons restantes del Paso 9 hasta resolver el bug de fondo del punto 1, para no dejar corriendo sola una notificación que podría estar reportando "completo" cuando en realidad hay huecos de organismo sin resolver — esto no estaba explícito antes, es una decisión de precaución tomada en esta sesión.

- Bloqueos o cosas que el humano debe resolver:
  1. Correr la query de diagnóstico de arriba con datos del 21/09/2026 (o la fecha en que se retome) y compartir el resultado (incluyendo el `raw_json_detalle` de al menos 1-2 códigos afectados) para poder decidir si el fix es "dejar de reintentar casos legítimamente sin organismo" o "corregir el mapeo del campo".
  2. Decidir, una vez confirmada la causa, si además de arreglar el mapeo hace falta un tercer estado en el modelo de datos (ej. `organismo_no_disponible boolean`) para no confundir "todavía no procesado" con "procesado pero sin dato" — actualmente ambos casos se ven idénticos (`organismo is null`) en toda la base de código (`codigos_sin_organismo`, panel de admin, búsqueda).

- Próximo paso sugerido: con los datos de hoy (21/09) y el `raw_json_detalle` de un caso afectado, confirmar la causa raíz del bug de "lote completo con organismo null". Si es un mapeo incorrecto, corregir `obtenerDetalleLicitacion` en `ingesta-diaria/index.ts`. Si es un vacío legítimo de la API, decidir cómo modelarlo (por ejemplo, no volver a intentar esos códigos y marcarlos explícitamente en vez de dejarlos como "pendiente eterno" indistinguible). Recién después de eso, retomar la activación de los 3 crons restantes del Paso 9, y seguir con el Paso 10 (frontend end-to-end) y el punto B del desglose en el panel de admin.

[2026-09-28] — Agente/sesión: Claude (licitaciones saltadas, fin de la pausa de 24h, panel admin)
Paso(s) en el que se trabajó: Paso 7 (Edge Function ingesta-diaria), Paso 5 (funciones SQL) y panel /admin. Trabajo posterior al cierre del Paso 8.
Qué se completó:
Diagnóstico de la pausa de 24h: la API de Mercado Público devuelve HTTP 500 con Codigo 10000 ("String or binary data would be truncated") para ciertos códigos. Es un error interno de ellos, no un rate limit. El cortacircuito antiguo lo trataba como rate limit y terminaba en pausa de 24h.
Clasificación de fallos en procesarLote:
rate_limit (429, 403 o texto "simultáneas" en el body): pausa corta de 60s. El código no se penaliza.
infra (timeout, red, 502/503/504): cuenta para el cortacircuito (3 seguidos → pausa de 60s). El código no se penaliza.
codigo (500 u otro error propio de ese código): suma 1 a intentos. No activa el cortacircuito.
Códigos saltados: los intentos viajan dentro de lotes_enriquecimiento.codigos_pendientes ({codigo, nombre, intentos}), sin columna nueva. Al llegar a MAX_INTENTOS_POR_CODIGO = 3 (en total, sin importar cuándo ocurran) se inserta en la tabla nueva licitaciones_saltadas y sale del lote. El lote puede completarse y el correo sale igual.
Eliminada la pausa de 24h: ya no existen PAUSA_LARGA_HORAS ni el escalamiento. Solo queda la pausa de 60s. cortes_seguidos es solo informativo.
Ruido en logs_ingesta: en accion=continuar solo se inserta fila si procesados > 0. accion=ingestar siempre registra.
Correo diferenciado por corrida (hora_envio_permitida): columna nueva en lotes_enriquecimiento (confirmada como agregada por el usuario). Corrida "tarde" (14:00 Chile): correo inmediato. Corrida "noche" (23:30 Chile): correo pospuesto a las 07:00 del día siguiente. El cron continuar recoge los lotes completados sin avisar cuando ya pasó su hora.
Fix del lock: el finally liberaba el lock incluso cuando la invocación se había omitido por otra activa, lo que permitía solapamientos y 429. Ahora existe la bandera bloqueoPropio y solo libera quien lo tomó.
codigos_sin_organismo excluye las saltadas. Sin esto, una saltada volvería a entrar a un lote nuevo y se repetiría el ciclo.
Panel admin: nueva sección "Licitaciones saltadas" (código, nombre, motivo HTTP + mensaje, intentos, fecha), nueva stat card (con conteo de sin revisar) y columna "Saltadas" en la tabla de lotes. Nueva función admin_stats_saltadas().
admin_stats_lotes: ahora devuelve la columna saltadas. Firma final: admin_stats_lotes(p_dias int default 14).
Qué quedó pendiente / a medias:
BUG DE FONDO SIN RESOLVER (heredado del 2026-09-16): procesarLote trata cualquier respuesta OK como "enriquecida" sin verificar que organismo haya venido con valor. El 16/09, 36 de 1000 códigos quedaron con organismo = null con el lote "completado". Sigue sin saberse si es un vacío legítimo de la API o un error de mapeo. Diagnóstico pendiente:
sql
     select codigo, nombre, raw_json_detalle
     from public.licitaciones
     where fecha_publicacion = (now() at time zone 'America/Santiago')::date
       and organismo is null
       and raw_json_detalle is not null
     limit 3;
Confirmar el despliegue de ingesta-diaria con el fix del lock (npx supabase functions deploy ingesta-diaria --no-verify-jwt).
Inconsistencia de horarios en la Sección 9: el código de ingesta-diaria asume corridas a las 14:00 y 23:30 hora Chile, pero los cron de la Sección 9 de este documento dicen 00:00 y 12:00. Verificar los reales con select jobname, schedule, active from cron.job; y actualizar la Sección 9 (recordar que pg_cron usa UTC fijo y hay que ajustar 1h entre horario de verano e invierno).
Paso 10 (frontend end-to-end) y la verificación de bloqueo a usuarios no-admin siguen sin cerrarse.
Las saltadas no tienen forma de marcarse como revisada ni de reintentarse desde la UI. Para reintentar una a mano: delete from public.licitaciones_saltadas where codigo = '...';.
Resultado de la investigación de rate limiting: sin eventos nuevos de 429/403. El hallazgo de esta sesión es que el HTTP 500 Codigo 10000 no es rate limit y no debe activar el cortacircuito.
Decisiones tomadas que no estaban en este documento:
Los 3 intentos se cuentan en total por código, no consecutivos.
Un código saltado no se reintenta solo. Solo se reintenta si se borra manualmente su fila de licitaciones_saltadas.
Se reescribió admin_stats_lotes sin tener el SQL original, por lo que procesados_aprox se calcula como total_codigos - pendientes. Si el original calculaba otra cosa, revisar.
Lección: un drop function sin conocer todas las sobrecargas deja funciones duplicadas. Esto causó el error "Could not choose the best candidate function" en /admin. Antes de recrear una función, listar sus versiones con select proname, pg_get_function_arguments(oid) from pg_proc where proname = '<nombre>';.
Bloqueos o cosas que el humano debe resolver:
Correr la consulta de diagnóstico del pendiente 1 y compartir el raw_json_detalle de una fila afectada.
Confirmar los horarios reales de los cron y el despliegue del fix del lock.
Próximo paso sugerido: resolver el bug de fondo de organismo null con detalle OK (leer el campo correcto o marcar esos casos como "sin dato" para no confundirlos con pendientes). Después, alinear los cron de la Sección 9 con las corridas reales, activar los que falten y seguir con el Paso 10.