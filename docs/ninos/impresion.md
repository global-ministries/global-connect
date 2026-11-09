# Niños — printed labels (print queue)

Spec: [`odd/tasks/ninos-checkin-pco.md`](../../odd/tasks/ninos-checkin-pco.md)
S10 (labels), S6 (reprint with audit), S9.2 (custody never on a label), S9.3
(first visit). Tasks T3a (queue, agent, templates, reprint) and T3b (station
admin and desk UI). Database: `supabase/migrations/20261109100000_ninos_impresion.sql`.

The 4B-2054N label printer goes by USB to a laptop or PC at the desk that runs
the print agent. Any phone or tablet at the desk prints to that station with
no dialog.

## Flow

1. Any device at the desk confirms the ingreso: `POST /api/ninos/checkin` with
   the usual body plus `estacionId` (the desk's print station).
2. The check-in answers as before. After the response, the server queues the
   labels as the desk user (`ninos_impresion_encolar`): one **child** label
   per child and one **parent receipt** per family visit (código).
3. The print agent on the computer that has the printer polls
   `GET /api/ninos/impresion/agente`, prints each job with no dialog and
   reports it with `POST /api/ninos/impresion/agente`.
4. A jammed or lost label is reprinted from the desk with a reason:
   `POST /api/ninos/impresion/reimprimir`.

Printing is best effort. A missing or malformed `estacionId`, an inactive
station or a failed enqueue never fails or delays the ingreso. The código
stays on screen and on the parent's phone.

## What each label shows

The database builds the payload from its own rows, never from what the desk
sends.

| Label | Shows | Never shows |
|---|---|---|
| Child (one per child) | Name, last name, salón, area, date and hour of the horario, pickup código, the **ALERGIA** mark (reversed black; only the mark), **PRIMERA VEZ** or **VISITANTE** (framed) | Allergy text, medical notes, phone, cédula, custody restrictions |
| Parent receipt (one per family visit) | Pickup código (also as QR), the children's first names (3 + «y N más»), date and hour, «Presenta este recibo para retirar» | Salón, phone, custody restrictions |

- **Horario.** `servicio` is the turno name and `hora` its hour on that date:
  the planned hour of a dated turno (event) when it has one, else the turno's
  hour (`ninos_turno_hora_en`).
- **First visit (S9.3).** `visita` counts the child's earlier check-in dates:
  none → `primera` (PRIMERA VEZ), 1–2 → `visitante` (VISITANTE), 3 or more →
  `null` (no mark). It is the same rule as the desk (`ninos_es_visitante`).
- **Custody (S9.2).** Restrictions stay on the desk, salón and pickup screens.
  The templates read only the fields above, so nothing else can reach paper.

## Stations and label size

A station (`ninos_estaciones_impresion`) is one desk printer of a campus.

| Field | Meaning |
|---|---|
| `nombre` | Label shown at the desk, up to 60 characters. |
| `ancho_mm`, `alto_mm` | Label size in mm. Both stay `null` until the roll is measured; when set, width is 20–120 and height 10–300. While `null`, the agent prints at **102 × 51 mm, 203 dpi** (the 4B-2054N roll). |
| `dpi` | 203 (default, 4B-2054N) or 300. |
| `activa` | An inactive station gets no jobs and its token is refused. |
| `ultima_conexion` | Last agent call (heartbeat). |

The labels fit the station's size: the 102 × 51 mm layout scales down, with
the 50 × 30 mm values as the smallest. Long names shrink and then print only
the first name; last name and salón are cut with «…». Tested sizes: 102 × 51,
76 × 51, 76 × 40, 57 × 32 (2.25" × 1.25") and 50 × 30 mm, at 203 and 300 dpi.

The people who manage the Niños rooms of the campus (`ninos_puede_configurar`:
Directora de Niños, area coordinators, admin, pastor) create stations, rotate
their token and edit the size. Hosts (Anfitriones) can list the stations of
their campus and print to them. RPCs: `ninos_impresion_estaciones`,
`ninos_impresion_estacion_crear`, `ninos_impresion_estacion_rotar_token`,
`ninos_impresion_estacion_actualizar` (the admin UI is T3b).

**Token.** Creating a station or rotating its token returns
`{ estacion, token }`. The token (64 hex chars) is shown only once and the
database keeps only its sha256. Rotating it disconnects the old agent at once.

## Agent API

Every call sends `Authorization: Bearer <token>`. A missing, malformed or
unknown token, or an inactive station, gets `401 { "error": { "code": "401" } }`.
Responses carry `Cache-Control: no-store`.

### Claim jobs — `GET /api/ninos/impresion/agente?max=10`

`max` is 1–20 (default 10). Response `200`:

```json
{
  "estacion": { "id": "uuid", "nombre": "Mesa Waumba", "ancho_mm": 50, "alto_mm": 30, "dpi": 203 },
  "trabajos": [
    {
      "id": "uuid",
      "tipo": "nino",
      "intentos": 1,
      "created_at": "2026-11-08T13:05:00Z",
      "payload": {
        "nombre": "Sofía", "apellido": "Pérez", "codigo": "4821",
        "salon": "Preescolar II", "area": "waumba", "alergias": true, "visita": "primera",
        "fecha": "2026-11-08", "servicio": "Primer servicio", "hora": "09:00"
      }
    },
    {
      "id": "uuid",
      "tipo": "representante",
      "intentos": 1,
      "created_at": "2026-11-08T13:05:00Z",
      "payload": {
        "codigo": "4821", "ninos": ["Mateo", "Sofía"], "areas": ["upstreet", "waumba"],
        "qr": "(optional, N5c)",
        "fecha": "2026-11-08", "servicio": "Primer servicio", "hora": "09:00"
      }
    }
  ]
}
```

- `ancho_mm` / `alto_mm` are `null` while the roll is not measured. The agent
  then prints at 102 × 51 mm, 203 dpi, and says so once when it connects.
- `area` is `waumba` or `upstreet` (it selects the mascot). `alergias` is
  only a flag; the allergy text never leaves the database. `visita` is
  `primera`, `visitante` or `null`.
- Claiming marks a job as taken for 2 minutes. If it is not reported in that
  time, it is handed out again (`intentos` + 1). After 5 claims it ends as
  `error` / `sin_respuesta`. A job not printed within 12 hours ends as
  `error` / `vencida`, so labels from an old service never print.
- Polling every few seconds is the first version; Realtime comes later.

### Report a job — `POST /api/ninos/impresion/agente`

```json
{ "id": "uuid", "estado": "impresa" }
{ "id": "uuid", "estado": "error", "error": "sin papel" }
```

`error` is optional and capped at 300 characters. The agent sends fixed codes
or the printer's own message, never label data: `etiqueta_invalida`,
`lp_no_disponible`, `lp_salida_<code>: <CUPS message>`. Response `200`:
`{ "id": "uuid", "estado": "impresa" }`. A job that was already reported
keeps its first result, so retrying a report is safe.

| Status | Body | When |
|---|---|---|
| 400 | `{ "error": { "code": "22023" } }` | Malformed body. |
| 401 | `{ "error": { "code": "401" } }` | Bad token. |
| 422 | `{ "error": { "code": "22023", "message": "trabajo_no_encontrado" } }` | The job is not one of this station's claimed jobs. |
| 500 | `{ "error": { "code": "500" } }` | Unexpected. |

## Print agent

`tools/agente-impresion/` (setup guide for the desk in its `README.md`). A
dependency-free Node 18+ script for the computer that has the printer:

- Polls the claim route every `intervaloMs` (2 s), at once again when it got a
  full batch; on a network error it waits 2 s, doubling up to 30 s. A 401
  stops it with a message.
- Renders each job to TSPL (`tspl.js`, pure) with the station's
  `ancho_mm` / `alto_mm` / `dpi` (102 × 51 mm, 203 dpi while unset),
  following `design/ninos-checkin-pco/03`: name shrinks to 70 % and then only
  the first name prints; last name and salón are cut with «…»; ALERGIA is a
  reversed (black) block only when `alergias` is true; PRIMERA VEZ /
  VISITANTE is a framed block next to it (short «1.ª VEZ» / «VISITA» when
  the label is narrow); the parent receipt has the QR (`qr`, else the
  código), up to 3 first names + «y N más», and a neutral header («NIÑOS ·
  GLOBAL») when the children are in two areas. Text goes out as windows-1252 with
  `CODEPAGE 1252`. Mascots: `logos/<area>.bmp` (1-bit BMP → `BITMAP`); with
  no file only the area name prints.
- Sends the bytes with `lp -d <queue> -o raw` (macOS/Linux; Windows later,
  behind `crearEnvio()` in `impresora.js`) and reports `impresa` / `error`. A
  job printed whose report was lost is not printed again when it is handed out
  again.
- `--prueba` prints sample labels with no server, `--guardar <file>` writes the
  TSPL instead of printing, `--impresoras` lists the CUPS queues.
- Logs carry job ids and counts only, never the token nor label data.

## Desk API

### Check-in — `POST /api/ninos/checkin`

The same body as before, plus `"estacionId": "uuid"` (optional). The response
and status are unchanged.

### Reprint — `POST /api/ninos/impresion/reimprimir`

S10 "Anfitriones y coordinación, con motivo": whoever operates the desk for
that salón (anfitriones and coordinación of the campus, `ninos_puede_operar`
on the room of every child) reprints, choosing a reason.

```json
{ "estacionId": "uuid", "turnoId": "uuid", "fecha": "2026-11-08", "codigo": "4821",
  "tipo": "todas", "motivo": "se_perdio", "nota": "Verificado con cédula" }
```

`tipo`:

- `todas`: every child label plus the parent receipt.
- `representante`: the parent receipt only.
- `nino`: one child label; also send `"ninoId"`.

`motivo` (required):

| Value | At the desk |
|---|---|
| `se_trabo` | Se trabó |
| `se_perdio` | Se perdió |
| `otro` | Otro — `nota` is required |

`nota` is optional otherwise; it is trimmed and at most 200 characters. Each
queued label stores `motivo`, `nota`, who (`created_by`) and when
(`created_at`). The pickup código never changes: the reprint reads the
check-in and writes only print jobs.

Response `200 { "ninos": 2, "representantes": 1 }`. Only open check-ins
(not picked up yet) get labels. A malformed body (also a missing or unknown
`motivo`, `otro` without `nota`, a `nota` over 200) is `400`. RPC errors come
back as `{ "error": { "code", "message"? } }`. `message` is one of
`sin_autoridad` (403), `datos_invalidos`, `estacion_no_encontrada`,
`estacion_inactiva` or `checkin_no_encontrado` (422; also when a child is in
a salón the caller does not operate).
