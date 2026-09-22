-- =====================================================================
-- registrar_candidato_inicial() — 20 de septiembre, 2026
--
-- ⚠️ ESTE ES EL QUE ARREGLA EL ERROR DEL REGISTRO DE PRUEBA.
--    Sin él, NADIE nuevo puede registrarse por la liga.
--
-- QUÉ SE ROMPIÓ
--   Al registrar un correo nuevo salía "Tu cuenta quedó lista, pero no se
--   pudo guardar tu registro". No era la conexión. El error real de
--   Postgres era:
--
--       new row violates row-level security policy
--       for table "candidatos_ec1375"                       (código 42501)
--
--   La política RLS de candidatos_ec1375 exige
--   is_fase_authorized(email, 'registro'): la fila solo la puede escribir
--   quien YA tiene su fase de Registro pagada. Eso era correcto mientras el
--   único camino fuera "el equipo captura el pago, luego el candidato
--   entra". Con la liga pública el orden se invierte, y queda un candado
--   circular:
--
--       la fila necesita la fase pagada
--         → la fase la abre autorizar_registro_inicial()
--           → que exige que la fila ya exista con el Acuerdo firmado
--             → que necesita la fase pagada...
--
--   Nadie nuevo entra. Por eso nunca se vio en las pruebas: todas las
--   cuentas de prueba ya tenían su fase abierta de antes.
--
-- CÓMO SE ARREGLA
--   NO abriéndole RLS al candidato. candidatos_fase_pagos es la tabla que
--   decide quién ve el contenido protegido (los 142 reactivos viven en
--   contenido_ec1375 con RLS por fase): darle escritura al navegador sería
--   regalarle la llave.
--
--   Se hacen las DOS escrituras del lado del servidor, en el orden
--   correcto y en una sola transacción. Esta función es SECURITY DEFINER,
--   no recibe la identidad como parámetro (la saca de auth.uid()/auth.jwt(),
--   que el navegador no puede falsificar), solo puede tocar la fila de esa
--   misma persona, y solo puede escribir nombre, correo y las 5 llaves del
--   Acuerdo. El merge del JSON va AQUÍ y no en el navegador justo por eso:
--   así ni un cliente manipulado puede pisar su propio avance.
--
-- PROBADO CONTRA UN POSTGRES 16 REAL antes de mandarlo, replicando la
-- política RLS de producción. Se verificó que:
--   · sin la función, el alta de un correo nuevo falla con 42501 (el bug);
--   · con ella, queda la fila, queda la fase y el candidato ya se ve a sí
--     mismo por RLS (lo necesita panel.html);
--   · re-firmar NO vuelve a abrir la fase de alguien a quien el equipo se
--     la apagó por rajarse;
--   · re-firmar NO borra respuestas, certificados ni CURP;
--   · la cuenta demo (paideia.tech@outlook.com) no deja ni fila ni pago;
--   · una sesión anónima no la puede ejecutar;
--   · cada quien escribe su fila y nada más.
--
-- Convive con autorizar_registro_inicial() (la de antes): esa se queda
-- instalada y sigue sirviendo de respaldo. No hay que borrar nada.
-- =====================================================================


-- =====================================================================
-- PÉGALO COMPLETO EN UNA PESTAÑA VACÍA DEL SQL EDITOR Y DALE RUN.
-- Debe responder: Success. No rows returned
--
-- ⚠️ Es UNA sola función con $$: no la partas en pedazos ni la pegues
--    junto a otra cosa. El editor de Supabase parte el texto por ';' y el
--    dollar-quoting lo confunde ("unterminated dollar-quoted string").
-- =====================================================================

create or replace function public.registrar_candidato_inicial(
  p_nombre          text,
  p_nda_mode        text default 'draw',
  p_nda_data_url    text default null,
  p_nda_typed_name  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  correo      text;
  uid         uuid;
  ahora       timestamptz := now();
  fila        candidatos_ec1375%rowtype;
  datos       jsonb;
  personal    jsonb;
  modo        text;
  ya_firmo    boolean := false;
  abrio_fase  boolean := false;
begin
  uid    := auth.uid();
  correo := lower(coalesce(auth.jwt() ->> 'email', ''));
  if uid is null or correo = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;

  -- La cuenta demo del equipo nunca escribe datos reales (misma regla que
  -- Auth.isBypassSession() del lado del navegador, aquí en el servidor).
  if correo = 'paideia.tech@outlook.com' then
    return jsonb_build_object('ok', false, 'motivo', 'cuenta_demo');
  end if;

  if coalesce(btrim(p_nombre), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_nombre');
  end if;

  modo := case when p_nda_mode = 'type' then 'type' else 'draw' end;

  select * into fila from candidatos_ec1375 where user_id = uid;
  datos    := coalesce(fila.autodiagnostico_data, '{}'::jsonb);
  ya_firmo := coalesce((datos ->> 'ndaAccepted')::boolean, false);

  -- Merge, NUNCA reemplazo: lo que ya haya avanzado esta persona
  -- (answers, certificados, CURP, documentos) se queda tal cual.
  personal := coalesce(datos -> 'personalData', '{}'::jsonb);
  personal := jsonb_build_object(
      'nombre', '', 'curp', '', 'domicilio', '', 'escolaridad', '',
      'telefonoCasa', '', 'telefonoCelular', '', 'email', '',
      'fecha', '', 'renapAutorizado', false
  ) || personal;
  personal := personal || jsonb_build_object('nombre', btrim(p_nombre), 'email', correo);
  if coalesce(personal ->> 'fecha', '') = '' then
    personal := personal || jsonb_build_object('fecha', to_char(ahora at time zone 'utc', 'YYYY-MM-DD'));
  end if;

  datos := datos
    || jsonb_build_object('personalData', personal)
    || jsonb_build_object(
         'certificados',           coalesce(datos -> 'certificados', '[]'::jsonb),
         'sinCertificadosPrevios', coalesce(datos -> 'sinCertificadosPrevios', 'false'::jsonb),
         'answers',                coalesce(datos -> 'answers', '{}'::jsonb),
         'ndaAccepted',            true,
         'ndaSignedAt',            to_char(ahora at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'ndaSignatureMode',       modo,
         'ndaSignatureDataUrl',    case when modo = 'draw' then to_jsonb(p_nda_data_url) else 'null'::jsonb end,
         'ndaSignatureTypedName',  case when modo = 'type' then to_jsonb(coalesce(btrim(p_nda_typed_name), '')) else '""'::jsonb end
       );

  insert into candidatos_ec1375 (user_id, nombre, curp, autodiagnostico_data, updated_at)
  values (uid, btrim(p_nombre), coalesce(fila.curp, ''), datos, ahora)
  on conflict (user_id) do update
    set nombre               = excluded.nombre,
        autodiagnostico_data = excluded.autodiagnostico_data,
        updated_at           = excluded.updated_at;

  -- Solo en el PRIMER registro se abre la fase. A quien el equipo le apagó
  -- el badge por rajarse no le basta volver a abrir la liga y re-firmar:
  -- volver a darle acceso es una decisión del equipo, con su clic en
  -- admin-precios.html. Y jamás pisa un pago que ya exista.
  if not ya_firmo
     and not exists (select 1 from candidatos_fase_pagos p
                     where lower(p.email) = correo and p.fase = 'registro') then
    insert into candidatos_fase_pagos (email, fase, origen)
    values (correo, 'registro', 'registro-50');
    abrio_fase := true;
  end if;

  return jsonb_build_object(
    'ok', true, 'faseAbierta', abrio_fase, 'reRegistro', ya_firmo, 'datos', datos);
end;
$$;


-- =====================================================================
-- Y ESTAS DOS LÍNEAS DESPUÉS (pégalas en otra pestaña vacía, o abajo de
-- todo lo anterior; no llevan $$, no hay riesgo).
-- =====================================================================

revoke all on function public.registrar_candidato_inicial(text, text, text, text) from public, anon;
grant execute on function public.registrar_candidato_inicial(text, text, text, text) to authenticated;


-- =====================================================================
-- CÓMO COMPROBAR QUE QUEDÓ
--
-- 1) Debe salir 'OK — instalada':
--      select case when exists (
--        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public' and p.proname = 'registrar_candidato_inicial'
--      ) then 'OK — instalada' else '❌ no quedó' end;
--
-- 2) Regístrate por la liga con un correo de prueba NUEVO. Debe llegar
--    hasta "¡Bienvenido a Paideia Tech!". Luego:
--
--      select u.email, c.nombre,
--             c.autodiagnostico_data ->> 'ndaAccepted' as firmo,
--             c.autodiagnostico_data ->> 'ndaSignedAt' as cuando,
--             p.fase, p.origen, p.monto
--      from auth.users u
--      join candidatos_ec1375 c on c.user_id = u.id
--      left join candidatos_fase_pagos p
--             on lower(p.email) = lower(u.email) and p.fase = 'registro'
--      where lower(u.email) = 'tu-correo-de-prueba@ejemplo.com';
--
-- 3) Entra con ese correo a panel.html y abre el Autodiagnóstico: los 142
--    reactivos deben cargar.
--
-- PARA BORRAR UN REGISTRO DE PRUEBA
--      delete from candidatos_fase_pagos where lower(email) = 'prueba@outlook.com';
--      delete from candidatos_ec1375 where user_id =
--             (select id from auth.users where lower(email) = 'prueba@outlook.com');
--   (el usuario de Auth se borra desde Authentication → Users en el panel)
-- =====================================================================
