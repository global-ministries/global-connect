# Niños — printed labels (print queue)

Spec: [`odd/tasks/ninos-v2.md`](../../odd/tasks/ninos-v2.md) S9–S10 (tasks N6b–N6d).
Database: `supabase/migrations/20261103100000_ninos_impresion.sql`.

## Flow

1. Any device at the desk confirms the ingreso: `POST /api/ninos/checkin` with
   the usual body plus `estacionId` (the desk's print station).
2. The check-in answers as before. After the response, the server queues the
   labels as the desk user (`ninos_impresion_encolar`): one **child** label
   per child and one **parent** label per family visit (código).
3. The print agent on the computer that has the printer polls
   `GET /api/ninos/impresion/agente`, prints each job with no dialog and
   reports it with `POST /api/ninos/impresion/agente`.
4. A missing label is reprinted from the desk:
   `POST /api/ninos/impresion/reimprimir`.

Printing is best effort. A missing or malformed `estacionId`, an inactive
station or a failed enqueue never fails or delays the ingreso. The código
stays on screen and on the parent's phone.

## Stations and label size

A station (`ninos_estaciones_impresion`) is one desk printer of a campus.

| Field | Meaning |
|---|---|
| `nombre` | Label shown at the desk, up to 60 characters. |
| `ancho_mm`, `alto_mm` | Label size in mm. Both stay `null` until the roll is measured; when set, width is 20–120 and height 10–300. |
| `dpi` | 203 (default, 4B-2054N) or 300. |
| `activa` | An inactive station gets no jobs and its token is refused. |
| `ultima_conexion` | Last agent call (heartbeat). |

The people who manage the Niños rooms of the campus (`ninos_puede_configurar`:
Directora de Niños, area coordinators, admin, pastor) create stations, rotate
their token and edit the size. Hosts (Anfitriones) can list the stations of
their campus and print to them. RPCs: `ninos_impresion_estaciones`,
`ninos_impresion_estacion_crear`, `ninos_impresion_estacion_rotar_token`,
`ninos_impresion_estacion_actualizar` (the admin UI is N6d).

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
        "salon": "Preescolar II", "area": "waumba", "alergias": true,
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
        "fecha": "2026-11-08", "servicio": "Primer servicio", "hora": "09:00"
      }
    }
  ]
}
```

- `ancho_mm` / `alto_mm` are `null` while the roll is not measured. The agent
  then uses its own default or refuses to print.
- `area` is `waumba` or `upstreet` (it selects the mascot). `alergias` is
  only a flag; the allergy text never leaves the database.
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

`error` is optional and capped at 300 characters. Response `200`:
`{ "id": "uuid", "estado": "impresa" }`. A job that was already reported
keeps its first result, so retrying a report is safe.

| Status | Body | When |
|---|---|---|
| 400 | `{ "error": { "code": "22023" } }` | Malformed body. |
| 401 | `{ "error": { "code": "401" } }` | Bad token. |
| 422 | `{ "error": { "code": "22023", "message": "trabajo_no_encontrado" } }` | The job is not one of this station's claimed jobs. |
| 500 | `{ "error": { "code": "500" } }` | Unexpected. |

## Desk API

### Check-in — `POST /api/ninos/checkin`

The same body as before, plus `"estacionId": "uuid"` (optional). The response
and status are unchanged.

### Reprint — `POST /api/ninos/impresion/reimprimir`

```json
{ "estacionId": "uuid", "turnoId": "uuid", "fecha": "2026-11-08", "codigo": "4821", "tipo": "todas" }
```

`tipo`:

- `todas`: every child label plus the parent label.
- `representante`: the parent label only.
- `nino`: one child label; also send `"ninoId"`.

Response `200 { "ninos": 2, "representantes": 1 }`. Only open check-ins
(not picked up yet) get labels. Errors come back as
`{ "error": { "code", "message"? } }`. `message` is one of `sin_autoridad`
(403), `datos_invalidos`, `estacion_no_encontrada`, `estacion_inactiva` or
`checkin_no_encontrado` (422).
