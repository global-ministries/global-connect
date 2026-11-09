# Niños — printed labels (print queue)

Spec: [`odd/tasks/ninos-checkin-pco.md`](../../odd/tasks/ninos-checkin-pco.md)
S10 (labels), S6 (reprint with audit), S9.2 (custody never on a label), S9.3
(first visit). Tasks T3a (queue, agent, templates, reprint) and T3b (station
admin and desk UI). Database: `supabase/migrations/20261109100000_ninos_impresion.sql`
and `20261109110000_ninos_impresion_vistas.sql` (the reprint history).

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
`ninos_impresion_estacion_actualizar` (screen: [Station admin](#station-admin--ninosetiquetas)).

**Token.** Creating a station or rotating its token returns
`{ estacion, token }`. The token (64 hex chars) is shown only once and the
database keeps only its sha256. Rotating it disconnects the old agent at once.

## Station admin — `/ninos/etiquetas`

Artboard `design/ninos-checkin-pco/03-admin-etiquetas.html`. Tab «Etiquetas»
next to Eventos and Salones; same gate as those screens
(`ninos_puede_configurar_algun_area`, then the campus with
`ninos_puede_configurar_algun_area_campus`; anyone else gets a 404). Code:
`app/(auth)/ninos/etiquetas/page.tsx`, `components/ninos/etiquetas/`,
helpers in `lib/platform/ninos/impresion-vista.ts`.

- **Stations.** One row per station of the campus: name, size («102 × 51 mm ·
  203 dpi (por defecto)» while unset), jobs in queue and the connection from
  `ultima_conexion`: «Conectada» when the agent called in the last 2 minutes,
  «Sin conexión desde HH:MM» (another day adds the date: «desde el dom 1 nov,
  18:05»), «Nunca se conectó», or «Desactivada». The page refreshes every
  30 s while visible.
- **Create** («Agregar estación»): name (≤ 60), width and height in mm (both
  empty = 102 × 51 mm, said in the form; else width 20–120 and height 10–300,
  checked before calling), resolution 203 or 300 dpi.
- **Edit** (open a row): name, size, dpi, active. **Crear token nuevo** asks
  first: the agent with the old token stops at once.
- **Token.** Creating or rotating shows the token once, with «Copiar token»,
  three plain steps (USB printer, paste it in `token` of the agent config,
  leave it open) and a link to `tools/agente-impresion/README.md`.
- Every write is the RPC as the user; its refusal is said in the panel
  («No tienes permiso para hacer esto en este campus.», …). Whoever cannot
  manage the campus reads the list without opening rows.

### Reprints of the campus — `ninos_impresion_reimpresiones`

`ninos_impresion_reimpresiones(p_campus_id, p_desde, p_hasta)` returns the
reprinted labels (`motivo` set; never the labels of the check-in itself) whose
`created_at` falls, in Caracas, between the two dates (inclusive). Both NULL =
today; one NULL = that day; at most 31 days, else `datos_invalidos`. Newest
first, up to 500 rows:

| Column | Meaning |
|---|---|
| `id`, `created_at` | The job and when it was reprinted. |
| `quien` | Name of who reprinted (`created_by`). |
| `tipo` | `nino` or `representante`. |
| `nino` | The child of a child label (from its payload). |
| `ninos` | The first names on a receipt (jsonb array; `[]` for a child label). |
| `codigo`, `motivo`, `nota` | The pickup código, the reason and the note. |
| `estacion_id`, `estacion` | The station and its name. |
| `estado`, `error` | `pendiente` / `impresa` / `error` and the agent's message. |

Same campus scope as the other print RPCs: `ninos_impresion_puede_operar`
(anfitriones and coordinación on a room of the campus) or
`ninos_impresion_puede_administrar`; anyone else, another campus or anon gets
`sin_autoridad` (42501). The screen shows today's list («Reimpresiones de
hoy», with hour, what, reason · note, who · station · código and status) and
«Historial» with Desde / Hasta (last 7 days by default). Suite:
`supabase/tests/ninos-impresion-vistas.test.sql`.

## Desk — printer and reprint

Artboard `design/ninos-checkin-pco/05-mesa-tableta.html`. Code:
`components/ninos/checkin/use-estacion-mesa.ts`, `estacion-mesa.tsx`,
`reimprimir-etiquetas.tsx`.

- **Printer of this desk.** Under the service, «Impresora de esta mesa»
  lists the active stations of the desk's campuses with their connection
  (`ninos_impresion_estaciones`, refreshed every 30 s). The choice is kept on
  this device per campus in `localStorage` (`ninos-mesa-estacion:<campus>`).
  A campus without stations (or a refused read) shows nothing, and the
  check-in body is exactly the one of before.
- **Notice, never a block.** No station chosen: «Esta mesa no tiene impresora
  elegida: el código queda en pantalla». The chosen one offline: «La impresora
  "X" está sin conexión: el código queda en pantalla». The check-in goes on.
- **Check-in.** With a station the body carries `estacionId` (also when it is
  offline: the labels print when the agent comes back, within 12 hours). The
  code then says «Las etiquetas salen por «X»…» instead of «Escríbelo en las
  dos etiquetas».
- **Reprint.** «Reimprimir» on the code, and «Reimprimir etiquetas · código»
  on a family already checked in (both only with a station chosen), open the
  form: the label of each child of that código and/or the parent receipt, the
  reason (Se trabó · Se perdió · Otro) and a note (required for Otro, ≤ 200).
  It posts one `/api/ninos/impresion/reimprimir` per piece (every child + the
  receipt = one `todas`) and says «Listo: 1 etiqueta y 1 recibo van a «Mesa 1».
  El código sigue siendo 4821.» or the refusal in plain Spanish («Ese código ya
  no está adentro: solo se reimprime antes del retiro.»).
- Not yet: «Registrar y dar ingreso» in the Nueva familia panel
  (`components/ninos/registro-rapido/use-registro-mesa.ts`) does not send
  `estacionId`, so those labels are not queued.

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
