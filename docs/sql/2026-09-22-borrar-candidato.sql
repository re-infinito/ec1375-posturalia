-- =====================================================================
-- Borrar a un candidato desde Precios y pagos — 22 de septiembre, 2026
--
-- QUÉ RESUELVE
--   Hasta hoy el panel podía agregar y editar, pero no BORRAR. Un correo de
--   prueba, un duplicado o alguien que nunca entró se quedaban en la lista
--   para siempre, contaminando el conteo de candidatos.
--
--   El expediente de una persona vive en TRES lugares:
--     · candidatos_precio      — precios, lote, estado
--     · candidatos_fase_pagos  — qué fases tiene liberadas (= su acceso)
--     · candidatos_ec1375      — su avance del flujo
--
--   Los dos primeros se borran por correo desde el navegador, con las
--   políticas de abajo. El tercero NO tiene columna de correo (se cruza por
--   user_id contra auth.users, que RLS no deja leer desde el cliente), así
--   que necesita la función.
--
-- LO QUE ESTO **NO** BORRA
--   La cuenta de Supabase Auth (correo + contraseña). Eso requiere la
--   service_role y se hace en Authentication → Users del panel de Supabase.
--   El panel lo dice al terminar, no lo esconde: si no, el correo quedaría
--   "ocupado" para siempre y nadie entendería por qué.
--
-- PROBADO CONTRA UN POSTGRES 16 REAL antes de mandarlo:
--   · un admin borra y las tres tablas quedan limpias;
--   · quien NO es admin no borra nada (0 filas, sin error) — por eso el
--     panel usa .select() y comprueba lo que de verdad se borró;
--   · borrar a alguien no toca a nadie más;
--   · la función es idempotente: correrla dos veces no truena.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — Permiso para borrar precios. (Sin $$: pégala y Run.)
-- Si ya existe una política de DELETE para admins en esa tabla, este
-- CREATE va a fallar con "policy already exists": eso es que ya estaba,
-- y no hay nada que hacer.
-- =====================================================================

create policy "admins borran candidatos"
  on public.candidatos_precio for delete to authenticated
  using (public.is_admin(auth.jwt() ->> 'email'));


-- =====================================================================
-- PARTE 2 — La función que borra el avance del flujo.
-- Pégala COMPLETA en una pestaña VACÍA (lleva $$).
-- Debe responder: Success. No rows returned
-- =====================================================================

create or replace function public.admin_borrar_candidato(correo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  objetivo uuid;
  borradas int := 0;
begin
  -- Solo un admin. Falla cerrado, como is_admin/is_fase_authorized.
  if not public.is_admin(auth.jwt() ->> 'email') then
    raise exception 'Solo un administrador puede borrar candidatos';
  end if;

  correo := lower(btrim(coalesce(correo, '')));
  if correo = '' then
    return false;
  end if;

  -- Un admin no puede borrarse a sí mismo por accidente desde el panel.
  if correo = lower(auth.jwt() ->> 'email') then
    raise exception 'No puedes borrar tu propia cuenta desde aquí';
  end if;

  select id into objetivo from auth.users where lower(email) = correo;
  if objetivo is null then
    return false;   -- no tiene cuenta: no hay avance que borrar
  end if;

  delete from candidatos_ec1375 where user_id = objetivo;
  get diagnostics borradas = row_count;
  return borradas > 0;
end;
$$;

revoke all on function public.admin_borrar_candidato(text) from public, anon;
grant execute on function public.admin_borrar_candidato(text) to authenticated;


-- =====================================================================
-- COMPROBAR QUE QUEDÓ (debe salir 'OK' en los dos renglones)
-- =====================================================================
-- select 'politica de borrado' as que,
--        case when exists (select 1 from pg_policies
--              where schemaname='public' and tablename='candidatos_precio'
--                and cmd in ('DELETE','ALL')) then 'OK' else '❌ falta' end as estado
-- union all
-- select 'funcion admin_borrar_candidato',
--        case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--              where n.nspname='public' and p.proname='admin_borrar_candidato')
--        then 'OK' else '❌ falta' end;
-- =====================================================================
