# Backfill: evidencias del Google Form viejo → Nextcloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un script Python de una sola corrida que migre a Nextcloud las evidencias (capturas de Zoom, INE, CURP, foto de diploma) que candidatos ya subieron al Google Form viejo, y deje `evidencias_data.documentosNextcloud` en Supabase consistente para que el gate de `entrega.html` deje de bloquearlos.

**Architecture:** El script vive junto a `assemble_expediente.py` (mismo directorio local, gitignored, mismas credenciales de Google ya autorizadas) y reutiliza directamente sus funciones de lectura del Form + fuzzy-match por nombre. Habla con Supabase por REST (service role key) para encontrar candidatos pendientes y escribir el resultado, y con Nextcloud por WebDAV directo (mismas credenciales de servicio + Service Token de Cloudflare Access ya verificadas, sin pasar por `api/subir-portafolio.js` porque aquí no hay sesión de candidato). Corre en modo dry-run por default; solo sube archivos y escribe en Supabase con `--ejecutar`.

**Tech Stack:** Python 3 (mismo intérprete que ya usa `assemble_expediente.py`), `requests` (ya instalado), Google Forms/Drive API (`google-api-python-client`, credenciales ya autorizadas en `token.json`).

**Spec de referencia:** `docs/superpowers/specs/2026-09-14-backfill-evidencias-nextcloud-design.md`

**Nota importante sobre control de versiones:** todo `_internal_no_publicar/` (incluido este script nuevo) está gitignored — `assemble_expediente.py` mismo nunca ha estado en git. Ninguna tarea de este plan incluye `git add`/`commit`/`push`: este es un script local, de un solo uso, que nunca se despliega.

---

### Task 1: Archivo de credenciales locales

**Files:**
- Create: `_internal_no_publicar/01-scripts/backfill_config.json`

- [ ] **Step 1: Crear el archivo de configuración**

Crear `_internal_no_publicar/01-scripts/backfill_config.json`:

```json
{
    "supabase_service_role_key": "PENDIENTE_QUE_DIEGO_LA_DE",
    "nextcloud_url": "https://nextcloud.paideiatech.net",
    "nextcloud_username": "techpaideia",
    "nextcloud_app_password": "m2PsY-yn42e-jsdS3-2ycNk-mBex6",
    "cf_access_client_id": "e6debef0699623cf4365f412bf2876e9.access",
    "cf_access_client_secret": "cfast_j96ZKBbhz5L856MOUnDNXWf86c7dxd3aqFGWU47Xa80b6fc9"
}
```

Los valores de `nextcloud_*` y `cf_access_*` ya están verificados (misma sesión que confirmó la integración de Nextcloud, ver `Claude.md`). Falta un solo valor real: `supabase_service_role_key`.

- [ ] **Step 2: Obtener la Service Role Key real**

`SUPABASE_SERVICE_ROLE_KEY` está guardada en Vercel como variable "Sensitive" — no se puede leer de vuelta ni con `vercel env pull` ni con la API de Vercel, solo revelándola desde el dashboard. Pedir a Diego que la copie desde **Supabase Dashboard → Project Settings → API → `service_role` key** (proyecto `numsuiuwrvpprhnxovmh`) y reemplazar el valor `"PENDIENTE_QUE_DIEGO_LA_DE"` en `backfill_config.json` con el valor real, antes de correr el Task 5.

- [ ] **Step 3: Confirmar que el archivo no se sube a git**

Run: `cd "/Users/diegogarzamx/Desktop/Paideia Tech" && git check-ignore -v "_internal_no_publicar/01-scripts/backfill_config.json"`
Expected: una línea confirmando que `.gitignore:29:_internal_no_publicar/` lo cubre.

---

### Task 2: Helpers de Supabase (leer candidatos pendientes, escribir resultado)

**Files:**
- Create: `_internal_no_publicar/01-scripts/backfill_evidencias_nextcloud.py`

- [ ] **Step 1: Escribir el encabezado del script y los helpers de Supabase**

Crear `_internal_no_publicar/01-scripts/backfill_evidencias_nextcloud.py` con este contenido inicial:

```python
"""
Backfill: sube a Nextcloud las evidencias (Zoom/INE/CURP/foto de diploma) que
candidatos subieron al Google Form "Evidencia EC1375" ANTES de que existiera
la integración con Nextcloud (12 de septiembre, 2026) — ver
docs/superpowers/specs/2026-09-14-backfill-evidencias-nextcloud-design.md.

Uso:
    python3 backfill_evidencias_nextcloud.py              # dry-run (no sube ni escribe nada)
    python3 backfill_evidencias_nextcloud.py --ejecutar    # corrida real

Requiere backfill_config.json en este mismo directorio (ver Task 1 del plan).
El dry-run solo necesita 'supabase_service_role_key'; --ejecutar necesita
también las credenciales de Nextcloud/Cloudflare Access.
"""
import json
import os
import sys
import time

import requests

from assemble_expediente import (
    get_services, build_question_map, find_response_for_candidate,
    extract_files_by_slot, download_file, normalize,
)

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(HERE, 'backfill_config.json')
WORKDIR = os.path.join(HERE, 'workdir_backfill')

SUPABASE_URL = 'https://numsuiuwrvpprhnxovmh.supabase.co'

# slot interno de assemble_expediente.py -> clave que usa el sitio en documentosNextcloud
SLOT_TO_KEY = {
    'video_capturas': 'zoom',
    'ine': 'ine',
    'curp': 'curp',
    'foto_diploma': 'fotoDiploma',
}
MULTI_VALUE_KEYS = {'zoom'}  # se guardan como lista de rutas; el resto, como string


def load_config():
    with open(CONFIG_FILE) as f:
        return json.load(f)


def supabase_headers(config):
    key = config['supabase_service_role_key']
    return {'apikey': key, 'Authorization': f'Bearer {key}'}


def fetch_candidatos(config):
    resp = requests.get(
        f'{SUPABASE_URL}/rest/v1/candidatos_ec1375',
        headers=supabase_headers(config),
        params={'select': 'user_id,autodiagnostico_data,evidencias_data'},
    )
    resp.raise_for_status()
    return resp.json()


def fetch_emails_evaluacion(config):
    resp = requests.get(
        f'{SUPABASE_URL}/rest/v1/candidatos_fase_pagos',
        headers=supabase_headers(config),
        params={'select': 'email', 'fase': 'eq.evaluacion'},
    )
    resp.raise_for_status()
    return {row['email'].strip().lower() for row in resp.json() if row.get('email')}


def actualizar_evidencias_data(config, user_id, evidencias_data):
    resp = requests.patch(
        f'{SUPABASE_URL}/rest/v1/candidatos_ec1375',
        headers={**supabase_headers(config), 'Prefer': 'return=minimal'},
        params={'user_id': f'eq.{user_id}'},
        json={'evidencias_data': evidencias_data},
    )
    resp.raise_for_status()


def documentos_completos(evidencias_data):
    """True si las 4 claves requeridas ya están presentes (no vacías)."""
    docs = (evidencias_data or {}).get('documentosNextcloud') or {}
    for key in SLOT_TO_KEY.values():
        val = docs.get(key)
        if isinstance(val, list):
            if not val:
                return False
        elif not val:
            return False
    return True


def candidatos_pendientes(config):
    """Candidatos con fase Evaluación autorizada, cuyo evidencias_data.documentosNextcloud
    todavía no tiene las 4 claves completas."""
    emails_evaluacion = fetch_emails_evaluacion(config)
    pendientes = []
    for row in fetch_candidatos(config):
        auto = row.get('autodiagnostico_data') or {}
        personal = auto.get('personalData') or {}
        email = (personal.get('email') or '').strip().lower()
        if not email or email not in emails_evaluacion:
            continue
        if documentos_completos(row.get('evidencias_data')):
            continue
        pendientes.append({
            'user_id': row['user_id'],
            'nombre': personal.get('nombre', ''),
            'curp': personal.get('curp', ''),
            'evidencias_data': row.get('evidencias_data') or {},
        })
    return pendientes
```

- [ ] **Step 2: Verificar sintaxis**

Run: `python3 -m py_compile "_internal_no_publicar/01-scripts/backfill_evidencias_nextcloud.py"`
Expected: sin salida (éxito silencioso).

- [ ] **Step 3: Probar `documentos_completos()` de forma aislada**

Crear un script temporal en el scratchpad de la sesión (no se commitea, y de todas formas `_internal_no_publicar/` está gitignored):

```python
import sys
sys.path.insert(0, '/Users/diegogarzamx/Desktop/Paideia Tech/_internal_no_publicar/01-scripts')
from backfill_evidencias_nextcloud import documentos_completos

def assertEqual(actual, expected, label):
    status = 'OK' if actual == expected else 'FALLÓ'
    print(f'{status}: {label} (obtuvo {actual})')

assertEqual(documentos_completos(None), False, 'sin evidencias_data')
assertEqual(documentos_completos({}), False, 'sin documentosNextcloud')
assertEqual(documentos_completos({'documentosNextcloud': {'zoom': [], 'ine': 'x', 'curp': 'x', 'fotoDiploma': 'x'}}), False, 'zoom vacío cuenta como incompleto')
assertEqual(documentos_completos({'documentosNextcloud': {'zoom': ['a'], 'ine': 'x', 'curp': 'x', 'fotoDiploma': 'x'}}), True, 'las 4 claves presentes')
assertEqual(documentos_completos({'documentosNextcloud': {'zoom': ['a'], 'ine': 'x', 'curp': 'x'}}), False, 'falta fotoDiploma')
```

Run: `python3 /tmp/test_documentos_completos.py` (guardar el script ahí primero)
Expected: 5 líneas `OK: ...`, ninguna `FALLÓ`.

- [ ] **Step 4: Borrar el script de prueba**

Run: `rm -f /tmp/test_documentos_completos.py`

- [ ] **Step 5: Prueba real de lectura contra producción**

Requiere que `backfill_config.json` ya tenga la `supabase_service_role_key` real (Task 1, Step 2). Crear un script temporal:

```python
import sys
sys.path.insert(0, '/Users/diegogarzamx/Desktop/Paideia Tech/_internal_no_publicar/01-scripts')
from backfill_evidencias_nextcloud import load_config, candidatos_pendientes

config = load_config()
pendientes = candidatos_pendientes(config)
print(f'{len(pendientes)} candidato(s) pendientes:')
for p in pendientes:
    print(f"  - {p['nombre']!r} (user_id={p['user_id']})")
```

Run: `python3 /tmp/test_candidatos_pendientes.py`
Expected: no truena (confirma que las credenciales de Supabase y las consultas REST funcionan), y una lista de nombres que tenga sentido dado lo que Diego sabe de sus candidatos reales. Borrar el script después: `rm -f /tmp/test_candidatos_pendientes.py`.

---

### Task 3: Helpers de WebDAV (puerto de `api/subir-portafolio.js` a Python)

**Files:**
- Modify: `_internal_no_publicar/01-scripts/backfill_evidencias_nextcloud.py`

- [ ] **Step 1: Agregar los helpers de WebDAV**

Agregar al final de `backfill_evidencias_nextcloud.py` (después de `candidatos_pendientes`):

```python
# ---------------------------------------------------------------------------
# WebDAV — mismo comportamiento que api/subir-portafolio.js, puerto a Python.
# Habla directo con Nextcloud (no pasa por el endpoint del sitio): aquí no
# hay sesión de candidato, el script mismo es el operador de confianza.
# ---------------------------------------------------------------------------

FASE_CARPETA_EVALUACION = '03-Evaluacion'


def normalizar_nextcloud_url(url):
    normalized = (url or '').strip().rstrip('/')
    for suffix in ('/index.php/login', '/login'):
        if normalized.lower().endswith(suffix):
            normalized = normalized[: -len(suffix)]
    return normalized


def slugify(text):
    import re
    text = normalize(text or '')  # normalize() de assemble_expediente.py: minúsculas, sin acentos
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')


def carpeta_candidato(nombre, curp):
    partes = [p for p in (slugify(nombre), slugify(curp)) if p]
    return '_'.join(partes) or 'candidato_sin_identificar'


def cloudflare_access_headers(config):
    return {
        'CF-Access-Client-Id': config['cf_access_client_id'],
        'CF-Access-Client-Secret': config['cf_access_client_secret'],
    }


def nextcloud_base_auth_headers(config):
    url = normalizar_nextcloud_url(config['nextcloud_url'])
    user = config['nextcloud_username']
    base = f'{url}/remote.php/dav/files/{user}'
    auth = (user, config['nextcloud_app_password'])
    headers = cloudflare_access_headers(config)
    return base, auth, headers


def ensure_folder(base, auth, headers, folder_path):
    partes = [p for p in folder_path.split('/') if p]
    acumulado = ''
    for parte in partes:
        acumulado += f'/{parte}'
        resp = requests.request('MKCOL', f'{base}{acumulado}', auth=auth, headers=headers)
        # 201 = creada. 405 = ya existía. Cualquier otra cosa es un error real.
        if resp.status_code not in (201, 405):
            raise RuntimeError(f'No se pudo crear la carpeta {acumulado} (status {resp.status_code})')


def subir_a_nextcloud(config, nombre, curp, filename, local_path):
    base, auth, headers = nextcloud_base_auth_headers(config)
    carpeta = carpeta_candidato(nombre, curp)
    folder_path = f'Portafolios/{carpeta}/{FASE_CARPETA_EVALUACION}'
    ensure_folder(base, auth, headers, folder_path)
    file_path = f'{folder_path}/{filename}'
    with open(local_path, 'rb') as f:
        resp = requests.put(f'{base}/{file_path}', auth=auth, headers=headers, data=f)
    if resp.status_code not in (201, 204):
        raise RuntimeError(f'Nextcloud respondió con status {resp.status_code} al subir {filename}')
    return file_path
```

- [ ] **Step 2: Verificar sintaxis**

Run: `python3 -m py_compile "_internal_no_publicar/01-scripts/backfill_evidencias_nextcloud.py"`
Expected: sin salida.

- [ ] **Step 3: Probar las funciones puras de forma aislada**

```python
import sys
sys.path.insert(0, '/Users/diegogarzamx/Desktop/Paideia Tech/_internal_no_publicar/01-scripts')
from backfill_evidencias_nextcloud import normalizar_nextcloud_url, slugify, carpeta_candidato

def assertEqual(actual, expected, label):
    status = 'OK' if actual == expected else 'FALLÓ'
    print(f'{status}: {label} (obtuvo {actual!r})')

assertEqual(normalizar_nextcloud_url('https://nextcloud.paideiatech.net/login'), 'https://nextcloud.paideiatech.net', 'quita /login')
assertEqual(normalizar_nextcloud_url('https://nextcloud.paideiatech.net/'), 'https://nextcloud.paideiatech.net', 'quita barra final')
assertEqual(slugify('Diego Garza Arroyo'), 'diego_garza_arroyo', 'slugify con espacios')
assertEqual(slugify('José Ñuñez'), 'jose_nunez', 'slugify quita acentos y eñe')
assertEqual(carpeta_candidato('Diego Garza', 'GADI900101HDFXXX01'), 'diego_garza_gadi900101hdfxxx01', 'carpeta candidato normal')
assertEqual(carpeta_candidato('', ''), 'candidato_sin_identificar', 'carpeta candidato sin datos')
```

Run: `python3 /tmp/test_webdav_helpers.py` (guardar el script ahí primero)
Expected: 6 líneas `OK: ...`, ninguna `FALLÓ`.

**Nota:** a diferencia del `slugify()` de `api/subir-portafolio.js` (que preserva mayúsculas), este usa `normalize()` de `assemble_expediente.py`, que además minusculiza — el nombre de carpeta queda en minúsculas. Esto es solo una diferencia cosmética en el nombre de la carpeta del candidato entre lo que sube el sitio y lo que sube este backfill; no afecta el gate (que solo lee `documentosNextcloud`, nunca el nombre de la carpeta).

- [ ] **Step 4: Borrar el script de prueba**

Run: `rm -f /tmp/test_webdav_helpers.py`

- [ ] **Step 5: Prueba real contra Nextcloud (subir y borrar un archivo de prueba)**

Requiere que `backfill_config.json` tenga los valores de Nextcloud/Cloudflare Access (ya están, Task 1).

```python
import sys
sys.path.insert(0, '/Users/diegogarzamx/Desktop/Paideia Tech/_internal_no_publicar/01-scripts')
from backfill_evidencias_nextcloud import load_config, subir_a_nextcloud, nextcloud_base_auth_headers
import requests

config = load_config()
with open('/tmp/prueba_backfill.txt', 'w') as f:
    f.write('prueba del backfill de evidencias')

ruta = subir_a_nextcloud(config, 'Prueba Backfill', 'PRUEBA000000HDFXXX00', 'prueba.txt', '/tmp/prueba_backfill.txt')
print(f'Subido en: {ruta}')

base, auth, headers = nextcloud_base_auth_headers(config)
resp = requests.delete(f'{base}/Portafolios/prueba_backfill_prueba000000hdfxxx00', auth=auth, headers=headers)
print(f'Carpeta de prueba borrada: {resp.status_code}')
```

Run: `python3 /tmp/test_subir_nextcloud.py`
Expected: `Subido en: Portafolios/prueba_backfill_prueba000000hdfxxx00/03-Evaluacion/prueba.txt` seguido de `Carpeta de prueba borrada: 204`.

- [ ] **Step 6: Borrar los archivos de prueba**

Run: `rm -f /tmp/test_subir_nextcloud.py /tmp/prueba_backfill.txt`

---

### Task 4: Emparejado con el Form + orquestación principal

**Files:**
- Modify: `_internal_no_publicar/01-scripts/backfill_evidencias_nextcloud.py`

- [ ] **Step 1: Agregar la lógica de emparejado, procesamiento por candidato, y `main()`**

Agregar al final de `backfill_evidencias_nextcloud.py`:

```python
# ---------------------------------------------------------------------------
# Emparejado con el Form y orquestación
# ---------------------------------------------------------------------------

def emparejar_con_form(forms_service, qid_to_slot, candidato):
    """Devuelve (response, estado). estado es 'match_claro', 'sin_match', o
    'ambiguo' — nunca se adivina cuando hay más de un match, a diferencia de
    assemble_expediente.py (que ahí sí asume el más reciente porque un humano
    ya está apuntando a un candidato específico)."""
    matches = find_response_for_candidate(forms_service, qid_to_slot, candidato['nombre'])
    if len(matches) == 0:
        return None, 'sin_match'
    if len(matches) > 1:
        return None, 'ambiguo'
    return matches[0], 'match_claro'


def procesar_candidato(config, drive_service, qid_to_slot, candidato, response, ejecutar):
    slot_files = extract_files_by_slot(response, qid_to_slot)
    docs_actuales = dict(candidato['evidencias_data'].get('documentosNextcloud') or {})
    resultado = {'nombre': candidato['nombre'], 'subidos': [], 'sin_archivo': [], 'errores': []}

    for slot, key in SLOT_TO_KEY.items():
        ya_tiene = docs_actuales.get(key)
        if isinstance(ya_tiene, list):
            ya_tiene = len(ya_tiene) > 0
        if ya_tiene:
            continue  # no se pisa un documento que ya llegó por el flujo nuevo

        entries = slot_files.get(slot) or []
        if not entries:
            resultado['sin_archivo'].append(key)
            continue

        if not ejecutar:
            resultado['subidos'].append(f'{key} ({len(entries)} archivo(s), dry-run)')
            continue

        rutas = []
        for idx, (file_id, file_name) in enumerate(entries):
            try:
                local_path = os.path.join(WORKDIR, f'{candidato["user_id"]}_{key}_{idx}_{file_name}')
                download_file(drive_service, file_id, local_path)
                unique_name = f'{int(time.time() * 1000)}_{idx}_{file_name}' if key in MULTI_VALUE_KEYS else file_name
                ruta = subir_a_nextcloud(config, candidato['nombre'], candidato['curp'], unique_name, local_path)
                rutas.append(ruta)
                os.remove(local_path)
            except Exception as e:
                resultado['errores'].append(f'{key}: {e}')

        if rutas:
            docs_actuales[key] = rutas if key in MULTI_VALUE_KEYS else rutas[0]
            resultado['subidos'].append(f'{key} ({len(rutas)} archivo(s))')

    if ejecutar and resultado['subidos'] and not resultado['errores']:
        evidencias_data = dict(candidato['evidencias_data'])
        evidencias_data['documentosNextcloud'] = docs_actuales
        try:
            actualizar_evidencias_data(config, candidato['user_id'], evidencias_data)
        except Exception as e:
            resultado['errores'].append(f'Supabase: {e}')

    return resultado


def main():
    ejecutar = '--ejecutar' in sys.argv
    config = load_config()
    if ejecutar:
        os.makedirs(WORKDIR, exist_ok=True)

    print('Buscando candidatos con Evaluación pagada y evidencias incompletas en Nextcloud...')
    pendientes = candidatos_pendientes(config)
    print(f'{len(pendientes)} candidato(s) por revisar.\n')

    if not pendientes:
        print('Nada que hacer.')
        return

    forms_service, drive_service = get_services()
    qid_to_slot, _ = build_question_map(forms_service)

    migrados, fallidos, revisar = [], [], []

    for candidato in pendientes:
        response, estado = emparejar_con_form(forms_service, qid_to_slot, candidato)
        if estado != 'match_claro':
            revisar.append((candidato['nombre'], estado))
            print(f"  ⚠️  {candidato['nombre']}: {estado}")
            continue

        resultado = procesar_candidato(config, drive_service, qid_to_slot, candidato, response, ejecutar)
        if resultado['errores']:
            fallidos.append(resultado)
            print(f"  ❌ {resultado['nombre']}: {resultado['errores']}")
        else:
            migrados.append(resultado)
            verbo = 'subiría' if not ejecutar else 'subió'
            print(f"  ✅ {resultado['nombre']}: {verbo} {resultado['subidos']}, sin archivo: {resultado['sin_archivo']}")

    print(f"\n--- Resumen ({'DRY-RUN' if not ejecutar else 'CORRIDA REAL'}) ---")
    print(f'Migrados: {len(migrados)}')
    print(f'Fallidos: {len(fallidos)}')
    print(f'Para revisar a mano: {len(revisar)}')
    for nombre, estado in revisar:
        print(f'  - {nombre} ({estado})')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Verificar sintaxis del archivo completo**

Run: `python3 -m py_compile "_internal_no_publicar/01-scripts/backfill_evidencias_nextcloud.py"`
Expected: sin salida.

- [ ] **Step 3: Verificar que no quedan referencias rotas**

Run: `cd "/Users/diegogarzamx/Desktop/Paideia Tech/_internal_no_publicar/01-scripts" && python3 -c "import backfill_evidencias_nextcloud"`
Expected: sin errores (confirma que todos los imports, incluido `from assemble_expediente import ...`, resuelven correctamente).

---

### Task 5: Corrida supervisada (dry-run → revisión → real → verificación)

**Files:** ninguno (solo ejecución)

- [ ] **Step 1: Confirmar que `backfill_config.json` ya tiene la Service Role Key real**

Run: `grep -c "PENDIENTE_QUE_DIEGO_LA_DE" "_internal_no_publicar/01-scripts/backfill_config.json"`
Expected: `0` (si regresa `1`, falta completar el Task 1 Step 2 — pedirle el valor a Diego antes de continuar).

- [ ] **Step 2: Correr el dry-run**

Run: `cd "_internal_no_publicar/01-scripts" && python3 backfill_evidencias_nextcloud.py`
Expected: un reporte con la lista de candidatos pendientes, para cada uno si hizo match claro (y qué subiría) o si quedó para revisión manual (`sin_match`/`ambiguo`), y el resumen final.

- [ ] **Step 3: Revisar el reporte con Diego**

Compartirle el resumen: cuántos migrarían, cuántos quedarían para revisión manual y por qué (nombre no encontrado en el Form, o ambiguo). Esperar su confirmación explícita antes de continuar — el siguiente paso ya sube archivos reales y escribe en Supabase.

- [ ] **Step 4: Correr la migración real**

Run: `cd "_internal_no_publicar/01-scripts" && python3 backfill_evidencias_nextcloud.py --ejecutar`
Expected: mismo formato de reporte que el dry-run, pero esta vez con archivos realmente subidos a Nextcloud y `evidencias_data.documentosNextcloud` actualizado en Supabase para cada candidato migrado.

- [ ] **Step 5: Verificar 1-2 candidatos a mano**

Para uno de los candidatos que el reporte marcó como migrado exitosamente: confirmar en el navegador (con su cuenta, o con login-maestro — ver `Claude.md` sección "Autenticación y gates") que `evidencias.html` ya no le pide subir Zoom/INE/CURP/foto de diploma, y que si tiene evaluación completa, `entrega.html` ya no lo bloquea por evidencias faltantes.

- [ ] **Step 6: Confirmar idempotencia**

Run: `cd "_internal_no_publicar/01-scripts" && python3 backfill_evidencias_nextcloud.py`
Expected: los candidatos ya migrados en el Step 4 ya no aparecen en el reporte (su `documentosNextcloud` ya tiene las 4 claves) — solo quedan, si acaso, los que estaban en la lista de "revisar a mano".
