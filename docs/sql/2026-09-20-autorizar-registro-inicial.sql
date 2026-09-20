-- =====================================================================
-- autorizar_registro_inicial() — 20 de septiembre, 2026
--
-- ⚠️ HAY QUE CORRERLO en el SQL Editor de Supabase. Mientras no se corra,
--    registro.html sigue funcionando igual que hoy (guarda el registro y la
--    firma del NDA); simplemente no abre la fase sola y el equipo la prende
--    a mano desde admin-precios.html, como hasta ahora.
--
-- QUÉ HACE
--   Quien llega por la liga de registro (registro.html) ya dejó el primer
--   abono del anticipo (el anticipo son $2,000 en dos pagos de 50%: uno en
--   la primera intervención y otro en la segunda, y la fase se libera desde
--   el primero), así que al terminar su alta se le abre la fase 'registro'.
--   Sin esto, la persona se registra, firma su Acuerdo, abre su
--   Autodiagnóstico y choca con "Este contenido se habilita al pagar su
--   fase": los 142 reactivos viven en contenido_ec1375, con RLS por fase.
--
-- POR QUÉ UN RPC Y NO UN INSERT DESDE EL NAVEGADOR
--   candidatos_fase_pagos es la tabla que decide quién ve el contenido
--   protegido. Abrirle RLS al candidato para que se autorice solo sería
--   regalarle la llave. Este RPC corre en el servidor (SECURITY DEFINER),
--   NO RECIBE PARÁMETROS —saca la identidad de auth.uid()/auth.jwt(), que
--   el navegador no puede falsificar—, solo puede tocar la fase 'registro'
--   del propio usuario, exige que ya haya firmado su Acuerdo, y nunca pisa
--   un pago que ya exista. Tampoco es un endpoint de Vercel porque el plan
--   Hobby ya está en su límite de 12 funciones.
--
-- ⚠️ LO QUE ESTO IMPLICA, Y CONVIENE TENER PRESENTE
--   La liga de registro es pública: cualquiera que la tenga puede
--   registrarse, y con este RPC quedaría con la fase 'registro' abierta y
--   acceso a los 142 reactivos. La liga se comparte por WhatsApp, y las
--   ligas de WhatsApp se reenvían. El control es a posteriori: el equipo
--   revisa quién se registró y apaga el badge de quien no pagó (la lista
--   sale filtrando por origen = 'registro-50' en admin-precios.html).
--   Si algún día eso deja de alcanzar, la salida natural es exigir un
--   código en la liga (registro.html?c=XXXX) y validarlo aquí dentro.
--
-- INGRESOS
--   La fila se inserta SIN monto y con origen 'registro-50'. AdminData
--   cuenta ese caso como $0 cobrado —no como el precio de lista— hasta que
--   alguien capture la cifra real al dar de alta al candidato. Así los
--   ingresos nunca se inflan con dinero que no ha entrado.
-- =====================================================================

create or replace function public.autorizar_registro_inicial()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  correo text;
begin
  correo := lower(coalesce(auth.jwt() ->> 'email', ''));
  if correo = '' or auth.uid() is null then
    return false;
  end if;

  -- La cuenta demo del equipo nunca toca datos reales.
  if correo = 'paideia.tech@outlook.com' then
    return false;
  end if;

  -- Solo si de verdad terminó su registro: su fila con el Acuerdo firmado
  -- es la prueba. Sin esto, cualquier cuenta autenticada podría pedirlo.
  if not exists (
    select 1
    from candidatos_ec1375 c
    where c.user_id = auth.uid()
      and coalesce((c.autodiagnostico_data ->> 'ndaAccepted')::boolean, false)
  ) then
    return false;
  end if;

  -- Idempotente, y jamás pisa un pago que ya exista (de Mercado Pago o
  -- liberado a mano): si ya hay fila, no se toca nada.
  if not exists (
    select 1 from candidatos_fase_pagos p
    where lower(p.email) = correo and p.fase = 'registro'
  ) then
    insert into candidatos_fase_pagos (email, fase, origen)
    values (correo, 'registro', 'registro-50');
  end if;

  return true;
end;
$$;

-- Solo una sesión iniciada puede pedirlo; nunca el rol anónimo.
revoke all on function public.autorizar_registro_inicial() from public, anon;
grant execute on function public.autorizar_registro_inicial() to authenticated;

-- =====================================================================
-- CÓMO COMPROBAR QUE QUEDÓ
--
-- 1) Regístrate por la liga con un correo de prueba y revisa que aparezca:
--      select email, fase, origen, monto, autorizado_en
--      from candidatos_fase_pagos
--      where origen = 'registro-50'
--      order by autorizado_en desc;
--
-- 2) Entra con ese correo al Autodiagnóstico: los 142 reactivos deben cargar.
--
-- 3) Quién se registró por la liga y todavía no tiene montos capturados:
--      select p.email, p.autorizado_en, c.nombre
--      from candidatos_fase_pagos p
--      join candidatos_ec1375 c on lower(c.nombre) is not null
--      left join candidatos_precio pr on lower(pr.email) = lower(p.email)
--      where p.origen = 'registro-50' and pr.email is null
--      order by p.autorizado_en desc;
--
-- PARA APAGARLE EL ACCESO A ALGUIEN QUE SE RAJÓ
--   Desde admin-precios.html, clic en el badge "Registro" de esa persona
--   (pide confirmación). O a mano:
--      delete from candidatos_fase_pagos
--      where lower(email) = 'correo@de.la.persona' and fase = 'registro';
--
-- PARA DESACTIVAR EL AUTOMATISMO POR COMPLETO
--      drop function if exists public.autorizar_registro_inicial();
--   registro.html lo tolera: vuelve a guardar el registro sin abrir la fase.
-- =====================================================================

-- =====================================================================
-- SOLO SI HACE FALTA: permiso de UPDATE sobre candidatos_fase_pagos
--
-- admin-precios.html ahora captura, debajo del precio de cada fase
-- liberada, cuánto se lleva COBRADO de esa fase (acumulado). El registro se
-- paga en dos abonos de 50% —uno en cada intervención— y la fase se libera
-- con el primero, así que sin ese dato los ingresos se calcularían con el
-- precio de lista: $2,000 dados por cobrados cuando solo entraron $1,000.
--
-- Ese campo hace un UPDATE de candidatos_fase_pagos.monto. Las políticas que
-- ya existen permiten a un admin insertar y borrar (el badge de liberar y
-- revocar); si además cubren UPDATE, no hay nada que correr aquí. Si al
-- capturar un monto sale la alerta "No se pudo guardar el monto cobrado",
-- falta esta política:
--
--   create policy "admins actualizan montos cobrados"
--     on candidatos_fase_pagos for update
--     using (is_admin(auth.jwt() ->> 'email'))
--     with check (is_admin(auth.jwt() ->> 'email'));
--
-- (Ajusta la llamada a is_admin() a la firma que ya use el proyecto; el
--  resto de las políticas de esta tabla son la referencia.)
--
-- LÍMITE CONOCIDO
--   `monto` es UN número por (email, fase): el acumulado cobrado. Si una
--   misma fase se pagara en dos transacciones DE MERCADO PAGO, el webhook
--   (api/mercadopago-webhook.js, Prefer: resolution=merge-duplicates)
--   sobrescribe la fila y dejaría solo el monto de la última, no la suma.
--   Hoy no aplica: el Payment Link de Registro es de $2,000 completos y los
--   abonos de 50% se cobran en las intervenciones, fuera de Mercado Pago.
--   Si algún día se cobran abonos por MP, hay que acumular en el webhook en
--   vez de reemplazar.
-- =====================================================================
