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

**A quien ya dejó el primer abono del anticipo.** El anticipo de Registro son $2,000 en **dos pagos de 50%** —uno en la primera intervención y otro en la segunda— y el acceso se libera desde el primero. Al terminar su alta, la liga le **abre sola su fase de Registro**, así que sus 142 preguntas del Autodiagnóstico le cargan de inmediato, sin que nadie del equipo tenga que hacer nada.

⚠️ **Por eso importa a quién se la mandas.** La liga es pública: cualquiera que la tenga puede registrarse y quedar con acceso al material. Y las ligas de WhatsApp se reenvían. El control es después: cada cierto tiempo revisa quién entró por ahí (salen con el badge 🪪 en Precios y pagos) y **apaga el badge de quien no haya pagado**, con un clic.

**No la publiques en la landing ni en redes.** La página nombra el estándar EC1375, y la decisión de negocio sigue siendo que el nombre del estándar se revela hasta después del pago (`index.html`, `quiz.html` y los retornos de pago lo siguen ocultando). La página lleva `noindex, nofollow` para que Google no la indexe, pero eso no la esconde de quien tenga el enlace: compártela por WhatsApp, correo o en llamada, no en un post.

## 3. Cómo se ve

Usa la **identidad oficial de la plataforma**, la misma que ve el candidato en su panel y en el Autodiagnóstico: el logo de Paideia Tech arriba, los mismos colores, tarjetas, campos y botones, y el mismo **botón de tema claro/oscuro**. Si el candidato ya eligió tema en otra parte del sitio, esta página respeta esa elección (comparten la misma preferencia guardada).

Abre en **modo claro** por default, como el resto de la plataforma, y funciona igual en celular que en computadora (probada a 360, 375, 414 y 768 px de ancho, sin barras de scroll horizontal, en los dos temas).

## 4. Qué pasa si…

| Situación | Qué hace la liga |
|---|---|
| El correo **ya tiene cuenta** | Le avisa y le ofrece **"Ya tengo cuenta con este correo"**: entra con su contraseña y su firma se guarda igual. |
| **Ya tenía la sesión abierta** en ese dispositivo | El correo aparece precargado **pero se puede cambiar**. Si es el mismo, se salta el paso de contraseña; si escribe otro, cerramos esa sesión y el alta sigue normal. |
| **Tú abres la liga** con tu sesión del equipo | Igual: el correo se puede cambiar. Escribe el de la persona que registras y al continuar se cierra tu sesión. |
| Está abierta la **cuenta de demostración** (`paideia.tech@outlook.com`) | La liga lo detecta y **no la deja registrar** — esa cuenta no guarda nada real. Pide el correo de la persona y cierra esa sesión al continuar. |
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

## 6. Dónde lo ves y cómo le capturas sus datos financieros

En cuanto alguien termina su registro **aparece solo** en `admin-candidatos.html`, sin que nadie haga nada. Se ve así:

- En el **panel del equipo** (`admin-crm.html`), dentro de "Requieren atención": *"Fulana se registró y falta capturarle lote y montos"*.
- En la **lista de candidatos**, con el chip **"sin datos financieros"**, un guion en la columna Lote, y un aviso arriba con cuántas personas están en esa situación. El filtro de estado tiene su propia opción para verlos a todos juntos.
- Al abrir su ficha: la fecha en que firmó su Acuerdo, el aviso de que todavía no cuenta en KPIs ni en el reparto, y el botón **"Capturar sus datos financieros"**.

Ese botón te lleva a `admin-precios.html` con **su correo y su nombre ya escritos** y el cursor puesto en el primer monto: solo tecleas las cifras, eliges lote y estado, y le das Agregar. En ese momento deja de ser "prospecto" y pasa a ser un candidato normal, contando en KPIs, ingresos y reparto de utilidades como cualquier otro.

**Mientras no le captures nada, no infla ningún número.** Su fase de Registro sí cuenta como pagada —de eso depende que vea su material—, pero como nadie ha capturado cuánto entró, **cuenta como $0 de ingreso**. En cuanto le pongas sus montos reales, entra a KPIs, ingresos y reparto como cualquier otro.

Es a propósito y es conservador: preferimos reportar de menos y corregir, que repartir entre socios dinero que todavía no llegó.

**El badge 🪪 en Precios y pagos** marca justo eso: fase abierta por la liga, monto real pendiente de capturar. Para quitarle el acceso a alguien que se rajó, un clic en ese badge.

## 6 bis. Capturar los dos abonos del anticipo

En **Precios y pagos**, debajo del precio de cada fase ya liberada aparece un segundo campo: **cuánto se lleva cobrado** de esa fase (acumulado, no el abono suelto).

- Tras la **primera intervención** escribe `1000`. El campo se pone **ámbar**: falta por cobrar.
- Tras la **segunda** cámbialo a `2000`. Se pone **verde**: completo.

De ese número salen los ingresos reales. Si lo dejas vacío en una fase liberada a mano, se usa el precio de lista (como siempre); en una fase abierta por la liga (🪪) cuenta como $0 hasta que escribas la cifra.

**Es el paso que evita repartir dinero que no ha llegado.** Mientras no lo captures, o reportas de menos (🪪) o de más (liberación a mano), pero nunca lo real.

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
