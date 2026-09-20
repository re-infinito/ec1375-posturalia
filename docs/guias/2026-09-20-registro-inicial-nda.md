# Liga de registro inicial con NDA — guía para el equipo

**Fecha:** 20 de septiembre, 2026
**Página:** `registro.html`
**Liga para compartir:** `https://sepconocer.paideiatech.com/registro.html`

---

## 1. Qué hace la liga

Es la puerta de entrada de alguien que todavía **no existe en ninguna parte del sistema**. En tres pasos:

1. **Tus datos** — nombre completo (como en su identificación oficial) y correo electrónico.
2. **Confidencialidad** — lee el Acuerdo de Confidencialidad (NDA) del EC1375 y lo firma, dibujando la firma con el dedo/mouse o escribiendo su nombre.
3. **Tu contraseña** — crea su contraseña. Al terminar, queda:
   - un usuario en **Supabase Auth** con ese correo y esa contraseña,
   - una fila en **`candidatos_ec1375`** con su **nombre** y el **Acuerdo firmado** (fecha, hora e imagen de la firma).

Después de eso ya puede entrar a `panel.html` con su correo y contraseña como cualquier candidato.

## 2. A quién se la mandas

A cualquier prospecto que quieras dar de alta **antes** de que pague, o a quien ya pagó y todavía no tiene cuenta. La liga **no exige haber pagado** — es al revés que el resto del sitio, y es a propósito: sin esto nadie podría registrarse.

**No la publiques en la landing ni en redes.** La página nombra el estándar EC1375, y la decisión de negocio sigue siendo que el nombre del estándar se revela hasta después del pago (`index.html`, `quiz.html` y los retornos de pago lo siguen ocultando). La página lleva `noindex, nofollow` para que Google no la indexe, pero eso no la esconde de quien tenga el enlace: compártela por WhatsApp, correo o en llamada, no en un post.

## 3. Cómo se ve

Usa la **identidad oficial de la plataforma**, la misma que ve el candidato en su panel y en el Autodiagnóstico: el logo de Paideia Tech arriba, los mismos colores, tarjetas, campos y botones, y el mismo **botón de tema claro/oscuro**. Si el candidato ya eligió tema en otra parte del sitio, esta página respeta esa elección (comparten la misma preferencia guardada).

Abre en **modo claro** por default, como el resto de la plataforma, y funciona igual en celular que en computadora (probada a 360, 375, 414 y 768 px de ancho, sin barras de scroll horizontal, en los dos temas).

## 4. Qué pasa si…

| Situación | Qué hace la liga |
|---|---|
| El correo **ya tiene cuenta** | Le avisa y le ofrece **"Ya tengo cuenta con este correo"**: entra con su contraseña y su firma se guarda igual. |
| **Ya tenía la sesión abierta** en ese dispositivo | Se salta el paso de contraseña: solo confirma su nombre y firma. |
| **Ya había firmado** antes | Se lo dice arriba, y puede volver a firmar si algo cambió (por ejemplo, su nombre legal). |
| **Ya había avanzado** en el Autodiagnóstico | **No se borra nada.** El registro solo actualiza nombre, correo y el Acuerdo; sus respuestas, certificados, CURP y documentos siguen ahí. |
| **Se le cae el internet** al guardar | Se lo dice claramente y le pide reintentar. Nunca le muestra "listo" si no se guardó. |
| **Recarga la página** a media firma | Su firma sigue ahí (borrador en el navegador, se borra al terminar). |

## 5. El NDA se firma **una sola vez**

El Acuerdo de esta liga es **el mismo documento** que el paso "Confidencialidad" del Autodiagnóstico, y se guarda en el mismo lugar. Entonces:

- Quien firma aquí **llega al Autodiagnóstico con ese paso ya palomeado**. No firma dos veces.
- Su **acuse en PDF** ("Acuse de Recibido — NDA") se genera en el Autodiagnóstico con esta misma firma y sube solo al expediente en el NAS.
- Esa firma también se le ofrece como "usar la misma firma" en el Plan de Evaluación, la Encuesta y Evidencias.

No hay que hacer nada manual para que esto pase.

## 6. ⚠️ Lo que todavía **no** hace (decisión pendiente)

Un candidato que se registra por esta liga **no aparece todavía en el panel del equipo** (`admin-candidatos.html`, `admin-crm.html`). Esas pantallas arman su lista desde `candidatos_precio`, y un auto-registrado no tiene fila ahí hasta que alguien lo da de alta.

Es una decisión de producto, no un error: falta acordar **cómo se trata a un prospecto** que se registró pero no ha pagado (¿se le crea fila automáticamente con un `estado` nuevo tipo `prospecto`? ¿el equipo lo da de alta a mano cuando aparta?). Meterlo de golpe en `candidatos_precio` cambiaría los conteos de KPIs y del reparto de utilidades, así que no se hizo sin decidirlo.

**Mientras tanto**, para ver quién se registró y no está dado de alta, corre esto en el SQL Editor de Supabase:

```sql
select c.nombre,
       u.email,
       (c.autodiagnostico_data ->> 'ndaSignedAt') as nda_firmado,
       c.updated_at
from candidatos_ec1375 c
join auth.users u on u.id = c.user_id
left join candidatos_precio p on lower(p.email) = lower(u.email)
where p.email is null
  and (c.autodiagnostico_data ->> 'ndaAccepted')::boolean is true
order by c.updated_at desc;
```

Y para dar de alta a uno como candidato (mismo camino que ya usas desde `admin-precios.html`):

```sql
insert into candidatos_precio (email, lote, estado, total_acordado)
values ('correo@del.candidato', 1, 'activo', 14750)
on conflict (email) do nothing;
```

## 7. Para revisar una firma concreta

```sql
select nombre,
       autodiagnostico_data -> 'personalData' ->> 'email'   as correo,
       autodiagnostico_data ->> 'ndaAccepted'               as acepto,
       autodiagnostico_data ->> 'ndaSignedAt'               as firmado_el,
       autodiagnostico_data ->> 'ndaSignatureMode'          as tipo_de_firma,
       autodiagnostico_data ->> 'ndaSignatureTypedName'     as firma_escrita
from candidatos_ec1375
where lower(nombre) like '%apellido%';
```

La imagen de la firma dibujada está en `ndaSignatureDataUrl` (es un PNG en base64; se ve pegándolo en la barra del navegador). El documento formal que se entrega es el PDF del acuse, que se genera desde el Autodiagnóstico.

## 8. Dónde vive el código

| Qué | Dónde |
|---|---|
| La página | `registro.html` |
| El guardado (alta + NDA) | `Auth.registrarCandidato()` y `Auth.construirRegistroInicial()` en `auth.js` |
| Las pruebas | `tests/registro-inicial.test.js` (`node --test tests/*.test.js`) |
| El diseño y el porqué | sección "Registro inicial (liga pública)" en `Claude.md` |
