/**
 * PR14 — DT-050 — Talleres route-integration contract v1.
 *
 * The contract is a strict, versioned projection of the canonical Fase 5
 * tables. Future Path modules (the F4 / `app/(pastoral)/ruta/**` cascade)
 * MUST consume talleres data ONLY through this contract — never through
 * the raw tables.
 *
 * Allowed fields (consumed by Path modules):
 *   taller_id, nombre (snapshot), tipo, edicion,
 *   periodo { id, nombre, fecha_cierre_real },
 *   sesiones_total, estado,
 *   inscripcion { estado, unit_estado, fecha_completitud },
 *   certificado { id, codigo_verificacion, emitido_at }
 *
 * Disallowed (sensitive): motivos, attendance rows, group notes,
 * correction history, contact data, participation_eventos payloads.
 *
 * CI guard: `__tests__/invariants/talleres-ruta.test.ts` scans files in
 * `app/(pastoral)/ruta/**` for direct `taller_*` table access (`.from('taller_')`
 * or `taller_*` literals in SQL). The guard enforces "consume via
 * route-integration only".
 */

export const SCHEMA_VERSION = 'v1' as const

// ── Sub-shapes ───────────────────────────────────────────────────────────────

export interface PeriodoView {
  readonly id: string
  readonly nombre: string
  readonly fecha_cierre_real: string | null
}

export interface InscripcionView {
  readonly estado: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'
  readonly unit_estado: 'completado' | 'no_completado' | 'abandono' | null
  readonly fecha_completitud: string | null
}

export interface CertificadoView {
  readonly id: string
  readonly codigo_verificacion: string
  readonly emitido_at: string | null
}

export interface TallerView {
  readonly taller_id: string
  readonly nombre: string // snapshot — frozen at issuance
  readonly tipo: 'individual' | 'pareja'
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
  readonly periodo: PeriodoView | null
  readonly sesiones_total: number
  readonly inscripcion: InscripcionView | null
  readonly certificado: CertificadoView | null
}

// ── Input shapes (raw row shapes — not exported as part of the contract) ──

interface RawTaller {
  readonly id: string
  readonly nombre_snapshot: string
  readonly tipo: 'individual' | 'pareja'
  readonly edicion: string
  readonly estado: 'borrador' | 'abierto' | 'en_curso' | 'cerrado' | 'cancelado'
}

interface RawPeriodo {
  readonly id: string
  readonly edicion_label: string
  readonly fecha_cierre_real: string | null
}

interface RawInscripcion {
  readonly estado: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'
  readonly unit_estado: 'completado' | 'no_completado' | 'abandono' | null
  readonly fecha_completitud: string | null
}

interface RawCertificado {
  readonly id: string
  readonly codigo_verificacion: string
  readonly created_at: string | null
}

interface RawSesion {
  readonly id: string
}

interface RawInput {
  readonly taller: RawTaller
  readonly periodo: RawPeriodo | null
  readonly inscripcion: RawInscripcion | null
  readonly certificado: RawCertificado | null
  readonly sesiones: readonly RawSesion[]
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Pure projection: raw DB rows → TallerView. Only the fields enumerated in
 * SCHEMA_VERSION=v1 are exposed. `fecha_cierre_real` of periodos comes from
 * the GENERATED column on `taller_periodos_generales`.
 */
export function toTallerView(input: RawInput): TallerView {
  const periodoView: PeriodoView | null = input.periodo
    ? {
        id: input.periodo.id,
        nombre: input.periodo.edicion_label,
        fecha_cierre_real: input.periodo.fecha_cierre_real,
      }
    : null

  const inscripcionView: InscripcionView | null = input.inscripcion
    ? {
        estado: input.inscripcion.estado,
        unit_estado: input.inscripcion.unit_estado,
        fecha_completitud: input.inscripcion.fecha_completitud,
      }
    : null

  const certificadoView: CertificadoView | null = input.certificado
    ? {
        id: input.certificado.id,
        codigo_verificacion: input.certificado.codigo_verificacion,
        emitido_at: input.certificado.created_at,
      }
    : null

  return {
    taller_id: input.taller.id,
    nombre: input.taller.nombre_snapshot,
    tipo: input.taller.tipo,
    edicion: input.taller.edicion,
    estado: input.taller.estado,
    periodo: periodoView,
    sesiones_total: input.sesiones.length,
    inscripcion: inscripcionView,
    certificado: certificadoView,
  }
}

/**
 * Strip a TallerView to the minimum set the F4 cascade needs. Removes the
 * certificado (Path modules shouldn't read cert codes) and sesiones_total
 * (Path modules query sesiones directly via their own contract).
 */
export function toMinimalTallerView(view: TallerView): Pick<
  TallerView,
  'taller_id' | 'nombre' | 'tipo' | 'edicion' | 'estado' | 'periodo' | 'inscripcion'
> {
  // Object spread with explicit picks — guarantees the return type.
  return {
    taller_id: view.taller_id,
    nombre: view.nombre,
    tipo: view.tipo,
    edicion: view.edicion,
    estado: view.estado,
    periodo: view.periodo,
    inscripcion: view.inscripcion,
  }
}

/**
 * Sentinel version constant — every consumer can compare against this to
 * detect schema drift. Bumping SCHEMA_VERSION is a breaking change.
 */
export function currentSchemaVersion(): 'v1' {
  return SCHEMA_VERSION
}
