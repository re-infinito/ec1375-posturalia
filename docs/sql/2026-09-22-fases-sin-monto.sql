-- =====================================================================
-- ¿Cuáles son las fases sin monto capturado? — 22 de septiembre, 2026
-- Solo lectura: no escribe ni borra nada.
--
-- CORRECCIÓN A LO QUE SE DIJO EL 20 DE SEPTIEMBRE
--   Ese día el diagnóstico decía "40 fases se están contando al PRECIO DE
--   LISTA" como si fueran 40 errores. Diego lo corrigió con la regla real
--   del negocio:
--
--     "si la fase ya está liberada por MP o manual, es porque ya se hizo
--      el cobro de esa fase por persona"
--
--   Y tiene razón: el equipo libera una fase DESPUÉS de cobrarla. Donde eso
--   se cumple, el precio de lista ES lo cobrado y no hay nada que capturar.
--
--   Queda UNA excepción, y es la que importa: **el Registro se paga en dos
--   abonos de 50% y la fase se libera con el PRIMERO**. Una fase 'registro'
--   liberada a mano tras la primera intervención reporta $2,000 cuando
--   entraron $1,000. Ahí sí sobra la mitad.
--
--   Mercado Pago no tiene ese problema: su Payment Link de Registro cobra
--   los $2,000 completos de un tirón.
--
--   Y las abiertas por la liga (origen 'registro-50') ya cuentan $0, no el
--   precio de lista — eso se arregló el 20 de septiembre.
--
--   Conclusión: no hay 40 cosas que revisar. Hay que revisar las fases de
--   REGISTRO liberadas A MANO. Todo lo demás está bien como está.
--
-- PROBADO CONTRA UN POSTGRES 16 REAL con los cuatro casos mezclados.
-- =====================================================================


-- =====================================================================
-- 1) EL RESUMEN: cuántas hay de cada tipo y cuál importa
-- =====================================================================

select
  initcap(p.fase)                     as fase,
  coalesce(p.origen, 'manual')        as liberada_por,
  count(*)                            as cuantas,
  sum(case when coalesce(p.origen,'manual') = 'registro-50' then 0
           else case p.fase
                  when 'registro'   then coalesce(pr.monto_registro, 0)
                  when 'alineacion' then coalesce(pr.monto_alineacion, 0)
                  when 'evaluacion' then coalesce(pr.monto_evaluacion, 0)
                  when 'entrega'    then coalesce(pr.monto_entrega, 0)
                end end)              as se_esta_contando_hoy,
  case
    when coalesce(p.origen, 'manual') = 'registro-50'
      then 'Cuenta $0 — captura el abono al darlo de alta'
    when coalesce(p.origen, 'manual') = 'mercadopago'
      then 'OK — Mercado Pago cobró la fase completa'
    when p.fase = 'registro'
      then 'REVISAR — si solo entró el primer abono, sobra la mitad'
    else 'OK — se cobra completa, el precio de lista es correcto'
  end                                 as veredicto
from candidatos_fase_pagos p
left join candidatos_precio pr on lower(pr.email) = lower(p.email)
where p.monto is null
group by p.fase, coalesce(p.origen, 'manual')
order by (p.fase = 'registro') desc, 2;


-- =====================================================================
-- 2) QUIÉNES SON las de 'registro' liberadas a mano — las únicas dudosas.
--    En cada una: ¿ya dio los dos abonos, o solo el primero?
--      · los dos  → escribe el precio de lista en su campo "cobrado";
--      · solo uno → escribe la mitad.
--    Se captura en Precios y pagos, debajo del precio de esa fase.
-- =====================================================================

select
  coalesce(pr.nombre, '(sin nombre)') as candidato,
  p.email,
  pr.lote,
  pr.estado,
  pr.monto_registro                   as precio_de_lista,
  p.autorizado_en::date               as liberada_el
from candidatos_fase_pagos p
left join candidatos_precio pr on lower(pr.email) = lower(p.email)
where p.monto is null
  and p.fase = 'registro'
  and coalesce(p.origen, 'manual') = 'manual'
order by p.autorizado_en;


-- =====================================================================
-- ATAJO SIN SQL
--   En Precios y pagos, el filtro "Falta capturar lo cobrado" deja en
--   pantalla justo a estas personas. Es lo mismo que la consulta 2, pero
--   con los campos donde escribir la cifra al lado.
-- =====================================================================
