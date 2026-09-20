-- =====================================================================
-- Política de UPDATE para capturar el monto cobrado — 20 sep 2026
--
-- Lo pide el renglón 7 del diagnóstico ("⚠️ sin política de UPDATE").
-- Sin esto, el campo "cobrado" de admin-precios.html no guarda nada:
-- el UPDATE se va en silencio como "0 filas afectadas".
--
-- NO SE ADIVINA LA FIRMA DE is_admin(). El bloque COPIA el predicado de la
-- política de INSERT que la tabla ya tiene (la que usa el badge de liberar
-- fases), así que el permiso de actualizar queda exactamente igual de
-- restringido que el de insertar: mismo rol, misma condición.
--
-- PROBADO CONTRA UN POSTGRES 16 REAL antes de mandarlo:
--   · sin la política, el UPDATE como 'authenticated' da "UPDATE 0";
--   · con ella, "UPDATE 1" y el monto queda guardado;
--   · una sesión que NO es admin sigue sin poder cambiarlo ("UPDATE 0");
--   · correrlo dos veces no duplica nada (la segunda avisa y no hace nada).
-- =====================================================================

do $$
declare
  pol       record;
  expr      text;
  roles_txt text;
begin
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'candidatos_fase_pagos'
       and cmd in ('UPDATE', 'ALL')
  ) then
    raise notice 'Ya hay una política que cubre UPDATE. No se crea nada.';
    return;
  end if;

  select * into pol
    from pg_policies
   where schemaname = 'public' and tablename = 'candidatos_fase_pagos'
     and cmd = 'INSERT'
   order by policyname
   limit 1;

  if not found then
    raise exception 'No encontré una política de INSERT en candidatos_fase_pagos para copiar. Revisa las políticas a mano con: select * from pg_policies where tablename = ''candidatos_fase_pagos'';';
  end if;

  expr := coalesce(pol.with_check, pol.qual);
  if expr is null then
    raise exception 'La política de INSERT no tiene predicado que copiar.';
  end if;

  select string_agg(quote_ident(r), ', ') into roles_txt
    from unnest(pol.roles) as r;

  execute format(
    'create policy %I on public.candidatos_fase_pagos for update to %s using (%s) with check (%s)',
    'admins actualizan montos cobrados', roles_txt, expr, expr
  );

  raise notice 'Política de UPDATE creada, copiando el permiso de "%": %', pol.policyname, expr;
end
$$;

-- Comprobación: deben salir INSERT, DELETE, SELECT y ahora UPDATE.
select policyname, cmd, roles::text, coalesce(with_check, qual) as predicado
  from pg_policies
 where schemaname = 'public' and tablename = 'candidatos_fase_pagos'
 order by cmd;


-- =====================================================================
-- LAS 40 FASES SIN MONTO CAPTURADO (renglón 10 del diagnóstico)
--
-- Esas se están contando al PRECIO DE LISTA. Ojo: no son 40 errores — son
-- 40 desconocidos. Donde la fase se pagó completa, el precio de lista es
-- correcto y no hay nada que hacer. El problema está donde se pagó a
-- medias, que por tu proceso es sobre todo 'registro' (dos abonos de 50%).
--
-- Esta consulta te dice dónde está el riesgo, de mayor a menor.
-- =====================================================================

select
  p.fase,
  count(*)                                            as fases_sin_capturar,
  sum(case p.fase
        when 'registro'   then coalesce(pr.monto_registro,   0)
        when 'alineacion' then coalesce(pr.monto_alineacion, 0)
        when 'evaluacion' then coalesce(pr.monto_evaluacion, 0)
        when 'entrega'    then coalesce(pr.monto_entrega,    0)
      end)                                            as se_esta_reportando,
  case when p.fase = 'registro'
       then 'Aquí está el riesgo: son dos abonos de 50%'
       else 'Normalmente se paga completa; revisa solo las dudosas' end as nota
from candidatos_fase_pagos p
left join candidatos_precio pr on lower(pr.email) = lower(p.email)
where p.monto is null
  and coalesce(p.origen, 'manual') <> 'registro-50'
group by p.fase
order by 3 desc nulls last;


-- Y el detalle, para ir capturando (empieza por las de 'registro'):
--
-- select p.email, p.fase, p.origen, p.autorizado_en,
--        case p.fase
--          when 'registro'   then pr.monto_registro
--          when 'alineacion' then pr.monto_alineacion
--          when 'evaluacion' then pr.monto_evaluacion
--          when 'entrega'    then pr.monto_entrega
--        end as precio_de_lista
-- from candidatos_fase_pagos p
-- left join candidatos_precio pr on lower(pr.email) = lower(p.email)
-- where p.monto is null and coalesce(p.origen, 'manual') <> 'registro-50'
-- order by (p.fase = 'registro') desc, p.autorizado_en desc;
--
-- Capturar el monto: en admin-precios.html, debajo del precio de esa fase.
-- A quien ya pagó completo, escríbele el precio de lista tal cual; a quien
-- va a medias, lo que de verdad entró.
-- =====================================================================
