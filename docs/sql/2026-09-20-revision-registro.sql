-- =====================================================================
-- REVISIÓN: ¿quedó bien el registro automático?  — 20 de septiembre, 2026
--
-- Pégalo COMPLETO en el SQL Editor de Supabase y córrelo. Es de solo
-- lectura: no escribe ni borra nada. Devuelve una tabla con un renglón por
-- comprobación y un veredicto OK / ⚠️ / ❌ en cada uno.
--
-- Corre esto DESPUÉS de haber corrido 2026-09-20-autorizar-registro-inicial.sql.
-- =====================================================================

with
-- 1) ¿Existe la función, y con la seguridad correcta?
fn as (
  select p.oid, p.prosecdef, p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'autorizar_registro_inicial'
),
-- 2) ¿Quién puede ejecutarla?
permisos as (
  select
    bool_or(has_function_privilege('authenticated', oid, 'EXECUTE')) as puede_authenticated,
    bool_or(has_function_privilege('anon',          oid, 'EXECUTE')) as puede_anon
  from fn
),
-- 3) ¿El INSERT de 3 columnas (email, fase, origen) es válido?
--    Si autorizado_en fuera NOT NULL sin default, la función tronaría.
columnas as (
  select
    count(*) filter (
      where is_nullable = 'NO' and column_default is null
        and column_name not in ('email', 'fase', 'origen')
    ) as obligatorias_sin_default,
    string_agg(
      case when is_nullable = 'NO' and column_default is null
             and column_name not in ('email', 'fase', 'origen')
           then column_name end, ', ') as cuales
  from information_schema.columns
  where table_schema = 'public' and table_name = 'candidatos_fase_pagos'
),
-- 4) ¿Hay política de UPDATE? (la necesita el campo "cobrado" de admin-precios)
politicas as (
  select count(*) as updates
  from pg_policies
  where schemaname = 'public' and tablename = 'candidatos_fase_pagos'
    and cmd in ('UPDATE', 'ALL')
),
-- 5) Estado actual de los registros que entraron por la liga
altas as (
  select
    count(*) as total,
    count(*) filter (where monto is null) as sin_monto,
    max(autorizado_en) as ultimo
  from candidatos_fase_pagos
  where origen = 'registro-50'
),
-- 6) Fases liberadas cuyo monto cobrado nadie ha capturado: hoy se cuentan
--    al precio de lista, es decir, ingresos reportados de más.
sin_capturar as (
  select count(*) as n
  from candidatos_fase_pagos p
  where p.monto is null and coalesce(p.origen, 'manual') <> 'registro-50'
)
select * from (
  select 1 as n, 'La función existe' as revision,
         case when exists (select 1 from fn) then 'OK' else '❌ NO existe — ¿corriste el SQL?' end as resultado
  union all
  select 2, 'Es SECURITY DEFINER',
         coalesce((select case when prosecdef then 'OK' else '❌ quedó SECURITY INVOKER: no va a poder escribir' end from fn), '—')
  union all
  select 3, 'Tiene search_path fijo',
         coalesce((select case when proconfig::text like '%search_path%' then 'OK'
                               else '⚠️ sin search_path: vuelve a correr el SQL tal cual' end from fn), '—')
  union all
  select 4, 'La puede llamar un candidato con sesión',
         (select case when puede_authenticated then 'OK' else '❌ falta el GRANT a authenticated' end from permisos)
  union all
  select 5, 'NO la puede llamar alguien sin sesión',
         (select case when puede_anon then '⚠️ anon puede ejecutarla: vuelve a correr el REVOKE' else 'OK' end from permisos)
  union all
  select 6, 'El INSERT de la función es válido',
         (select case when obligatorias_sin_default = 0 then 'OK'
                      else '❌ columnas obligatorias sin default: ' || cuales end from columnas)
  union all
  select 7, 'Se puede capturar el monto cobrado (UPDATE)',
         (select case when updates > 0 then 'OK'
                      else '⚠️ sin política de UPDATE: el campo "cobrado" de admin-precios va a fallar' end from politicas)
  union all
  select 8, 'Altas que entraron por la liga',
         (select case when total = 0 then 'Ninguna todavía — registra un correo de prueba'
                      else total || ' (última: ' || coalesce(ultimo::text, 's/f') || ')' end from altas)
  union all
  select 9, 'De esas, sin monto capturado',
         (select case when total = 0 then '—'
                      when sin_monto = 0 then 'OK — todas con su monto'
                      else sin_monto || ' cuentan $0 hasta que captures su abono' end from altas)
  union all
  select 10, 'Fases liberadas a mano sin monto capturado',
         (select case when n = 0 then 'OK'
                      else n || ' se están contando al PRECIO DE LISTA — revísalas en Precios y pagos' end from sin_capturar)
) t order by n;


-- =====================================================================
-- DESPUÉS de registrarte con un correo de prueba, corre esto para ver
-- que la persona quedó completa (cuenta, firma y acceso):
-- =====================================================================
-- select
--   u.email,
--   c.nombre,
--   (c.autodiagnostico_data ->> 'ndaAccepted')  as firmo_el_acuerdo,
--   (c.autodiagnostico_data ->> 'ndaSignedAt')  as cuando,
--   p.fase, p.origen, p.monto,
--   case when p.email is null then '❌ SIN ACCESO — el RPC no corrió'
--        else '✅ con acceso a su Autodiagnóstico' end as acceso
-- from auth.users u
-- join candidatos_ec1375 c on c.user_id = u.id
-- left join candidatos_fase_pagos p
--        on lower(p.email) = lower(u.email) and p.fase = 'registro'
-- where lower(u.email) = 'tu-correo-de-prueba@ejemplo.com';
-- =====================================================================
