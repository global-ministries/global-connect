/**
 * @jest-environment node
 *
 * T4 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/[taller]/[edicion],
 * the edición detail screen. Replaces app/(auth)/admin/talleres/edicion/[id]/
 * page.tsx and absorbs the per-edición half of
 * app/(auth)/admin/talleres/inscripciones/page.tsx and
 * app/(auth)/talleres/coordinacion/inscripciones/page.tsx.
 *
 * Mirrors the gate + structural-inspection pattern of
 * __tests__/app/(auth)/talleres/[taller]/page.test.tsx (flag -> user ->
 * session, each an informational card, inspected via extractText/findByType
 * rather than full rendering). Client components are mocked to markers and
 * inspected through their props; the walkers descend into children AND
 * element slot props (EdicionCliente's `panelGrupos`, TituloGrande's
 * `resumen`).
 *
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2, S4) — v2 layout: hero
 * «taller · edición» with one summary line, EdicionCliente (replaces
 * TablaInscripciones) with origen / por_verificar per row, GruposSection as
 * the «Grupos» tab panel, InscribirAlguien instead of the inline form, and
 * «Fechas» (the old Ventana).
 *
 * This page adds a SECOND resolution step beyond the taller-by-slug lookup:
 * the edición must both exist AND belong to the resolved taller — a
 * mismatched pair (a real edición id, but for a DIFFERENT taller's slug)
 * must 404 exactly like an unknown id, never silently render.
 *
 * The core of this test: every control's visibility is wired straight to
 * cargarPermisos()'s booleans, never a flat capability array.
 */

import EdicionDetallePage from '@/app/(auth)/talleres/[taller]/[edicion]/page'
import { CancelarEdicionButton, OpenEdicionButton } from '@/components/talleres/open-edicion-button'
import { CerrarEdicionButton } from '@/components/talleres/cerrar-edicion-dialog'
import { ReprogramarEdicionDialog } from '@/components/talleres/reprogramar-edicion'
import { EditarDatosPracticosEdicion } from '@/components/talleres/datos-practicos-edicion'
import { GruposSection } from '@/components/talleres/grupos-section'
import { EdicionCliente } from '@/components/talleres/edicion/edicion-cliente'
import { InscribirAlguien } from '@/components/talleres/edicion/inscribir-alguien'
import { AvisoMinimo } from '@/components/talleres/minimo/aviso-minimo'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import type { EdicionLocalDetalle } from '@/lib/platform/talleres/operacional'
import type { AdminInscripcionesResult } from '@/lib/platform/talleres/admin-inscripciones'
import { rutaTaller } from '@/lib/platform/talleres/rutas'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/catalogo', () => ({
  loadTallerDetalle: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/operacional', () => ({
  loadEdicionLocalDetalle: jest.fn(),
  loadCupoEdicion: jest.fn(),
  loadReprogramarPreview: jest.fn(),
  loadReprogramacionAudit: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/admin-inscripciones', () => ({
  loadAdminInscripciones: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/grupo-detalle', () => ({
  loadGruposDeCohorte: jest.fn(),
  loadGruposInstanciados: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/invitacion-acceso-estado', () => ({
  conEstadoAcceso: jest.fn(async (filas: unknown) => filas),
}))

jest.mock('@/lib/platform/talleres/minimo-suspension', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/minimo-suspension')
  return { ...actual, loadPanelMinimo: jest.fn() }
})

jest.mock('@/lib/platform/talleres/servidores-del-taller', () => ({
  loadServidoresDelTaller: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/inscripciones-actions', () => ({
  approveInscripcionAction: jest.fn(),
  rejectInscripcionAction: jest.fn(),
  reenviarAccesoAction: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisos: jest.fn() }
})

jest.mock('@/components/talleres/open-edicion-button', () => ({
  OpenEdicionButton: () => null,
  CancelarEdicionButton: () => null,
}))

jest.mock('@/components/talleres/cerrar-edicion-dialog', () => ({
  CerrarEdicionButton: () => null,
}))

jest.mock('@/components/talleres/reprogramar-edicion', () => ({
  ReprogramarEdicionDialog: () => null,
}))

jest.mock('@/components/talleres/grupos-section', () => ({
  GruposSection: () => null,
}))

jest.mock('@/components/talleres/datos-practicos-edicion', () => ({
  EditarDatosPracticosEdicion: () => null,
}))

jest.mock('@/components/talleres/edicion/edicion-cliente', () => ({
  EdicionCliente: () => null,
}))

jest.mock('@/components/talleres/edicion/inscribir-alguien', () => ({
  InscribirAlguien: () => null,
}))

jest.mock('@/components/talleres/minimo/aviso-minimo', () => ({ AvisoMinimo: () => null }))
jest.mock('@/components/talleres/minimo/estado-suspension', () => ({ EstadoSuspension: () => null }))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadTallerDetalleMock = jest.requireMock('@/lib/platform/talleres/catalogo')
  .loadTallerDetalle as jest.Mock
const loadEdicionLocalDetalleMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadEdicionLocalDetalle as jest.Mock
const loadCupoEdicionMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadCupoEdicion as jest.Mock
const loadReprogramarPreviewMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadReprogramarPreview as jest.Mock
const loadReprogramacionAuditMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadReprogramacionAudit as jest.Mock
const loadAdminInscripcionesMock = jest.requireMock('@/lib/platform/talleres/admin-inscripciones')
  .loadAdminInscripciones as jest.Mock
const loadGruposDeCohorteMock = jest.requireMock('@/lib/platform/talleres/grupo-detalle')
  .loadGruposDeCohorte as jest.Mock
const loadGruposInstanciadosMock = jest.requireMock('@/lib/platform/talleres/grupo-detalle')
  .loadGruposInstanciados as jest.Mock
const loadServidoresDelTallerMock = jest.requireMock('@/lib/platform/talleres/servidores-del-taller')
  .loadServidoresDelTaller as jest.Mock
const cargarPermisosMock = jest.requireMock('@/lib/platform/talleres/permisos')
  .cargarPermisos as jest.Mock
const loadPanelMinimoMock = jest.requireMock('@/lib/platform/talleres/minimo-suspension')
  .loadPanelMinimo as jest.Mock

const TALLER: TallerDetalle = {
  id: 't-1',
  slug: 'matrimonio-sobre-la-roca',
  nombre: 'Matrimonio sobre la Roca',
  descripcion: 'Un taller de ejemplo.',
  modalidad_default: 'periodo_general',
  estado: 'active',
  dream_team_equipo_id: 'eq-1',
  cadencia_dias: 7,
  duracion_minutos: null,
  tipo: 'pareja',
  vinculo: 'matrimonio',
  regimen: 'temporada',
  cierre_inscripcion_offset_dias: -3,
  intervalo_ediciones_dias: null,
  clases_minimas_para_completar: null,
  ediciones: [],
}

const EDICION: EdicionLocalDetalle = {
  id: 'e-1',
  taller_id: 't-1',
  taller_nombre: 'Matrimonio sobre la Roca',
  taller_slug: 'matrimonio-sobre-la-roca',
  nombre_snapshot: 'Septiembre 2026',
  tipo: 'pareja',
  link_type: 'matrimonio',
  modalidad_inscripcion: 'periodo_general',
  estado: 'borrador',
  sesiones_snapshot: 8,
  duracion_estimada_minutos_snapshot: 90,
  firmantes: [],
  cohorte: {
    id: 'c-1',
    dream_team_equipo_id: 'eq-1',
    edicion: 'Septiembre 2026',
    started_at: '2026-09-01T00:00:00Z',
    ended_at: null,
  },
  fecha_inicio: '2026-09-01',
  fecha_fin: '2026-10-27',
  cierre_inscripcion: '2026-08-29',
  inscripciones_count: 5,
  inscripciones_aprobadas_count: 3,
  certificados_count: 0,
  cerrada_en: null,
  lugar: null,
  indicaciones: null,
}

const INSCRIPCION_ROW = {
  id: 'i-1',
  edicion_id: 'e-1',
  edicion_nombre: 'Septiembre 2026',
  edicion_estado: 'borrador',
  taller_id: 't-1',
  taller_nombre: 'Matrimonio sobre la Roca',
  taller_slug: 'matrimonio-sobre-la-roca',
  cohorte_id: null,
  cohorte_edicion: null,
  persona_principal_id: 'p-1',
  persona_principal_nombre: 'Juan Pérez',
  persona_principal_email: 'juan@example.com',
  companero_id: null,
  companero_nombre: null,
  link_type: null,
  estado: 'pendiente',
  created_at: '2026-09-10T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
} as AdminInscripcionesResult['rows'][number]

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  taller?: TallerDetalle | null
  edicionDetalle?: EdicionLocalDetalle | null
  permisos?: Partial<PermisosTaller>
  inscripciones?: AdminInscripcionesResult
  cupo?: { cupo: number; ocupados: number; disponibles: number; sobreCupo: number; unidad: 'personas' | 'parejas' } | null
  reprogramarPreview?: { clasesPendientes: number; primeraClaseCerrada: boolean }
  reprogramacionAudit?: { nombre: string; apellido: string; en: string; motivo: string | null } | null
  /** Rows of the extras read (origen, por_verificar); null makes it fail. */
  extras?: Array<Record<string, unknown>> | null
  gruposInstanciados?: unknown[]
  panelMinimo?: unknown
}

let extrasSelect: jest.Mock

function setup(opts: SetupOpts): void {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)

  extrasSelect = jest.fn()
  const extrasIn = jest.fn().mockResolvedValue(
    opts.extras === null ? { data: null, error: { message: 'boom' } } : { data: opts.extras ?? [], error: null },
  )
  extrasSelect.mockReturnValue({ in: extrasIn })
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    from: jest.fn(() => ({ select: extrasSelect })),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
  })

  const hasSession = opts.hasSession ?? true
  resolveSessionMock.mockReset().mockResolvedValue(
    hasSession
      ? {
          personaId: 'p-1',
          subjectAuthId: 'auth-1',
          globalRoles: [],
          contexts: [],
          capabilities: [],
        }
      : null,
  )

  loadTallerDetalleMock.mockReset().mockResolvedValue(opts.taller === undefined ? TALLER : opts.taller)
  loadEdicionLocalDetalleMock
    .mockReset()
    .mockResolvedValue(opts.edicionDetalle === undefined ? EDICION : opts.edicionDetalle)
  cargarPermisosMock.mockReset().mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, ...opts.permisos })
  loadAdminInscripcionesMock
    .mockReset()
    .mockResolvedValue(opts.inscripciones ?? { rows: [INSCRIPCION_ROW], total: 1 })
  loadGruposDeCohorteMock
    .mockReset()
    .mockResolvedValue([{ id: 'g-1', nombre: 'Grupo Alfa' }])
  loadGruposInstanciadosMock.mockReset().mockResolvedValue(opts.gruposInstanciados ?? [])
  loadPanelMinimoMock.mockReset().mockResolvedValue(opts.panelMinimo ?? null)
  loadServidoresDelTallerMock.mockReset().mockResolvedValue({ ok: true, servidores: [] })
  loadCupoEdicionMock.mockReset().mockResolvedValue(opts.cupo === undefined ? null : opts.cupo)
  loadReprogramarPreviewMock
    .mockReset()
    .mockResolvedValue(opts.reprogramarPreview ?? { clasesPendientes: 0, primeraClaseCerrada: false })
  loadReprogramacionAuditMock
    .mockReset()
    .mockResolvedValue(opts.reprogramacionAudit === undefined ? null : opts.reprogramacionAudit)
}

function params(taller = 'matrimonio-sobre-la-roca', edicion = 'e-1', searchParams?: Record<string, string>) {
  return {
    params: Promise.resolve({ taller, edicion }),
    ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}),
  }
}

/** Every React element / array a prop holds (children and slot props such as `panelGrupos`, `resumen`). */
function hijos(props: Record<string, unknown> | undefined): unknown[] {
  if (!props) return []
  return Object.entries(props)
    .filter(
      ([clave, v]) =>
        Array.isArray(v) ||
        (typeof v === 'object' && v !== null && 'type' in v) ||
        (clave === 'children' && (typeof v === 'string' || typeof v === 'number')),
    )
    .map(([, v]) => v)
}

/** Walks a React element tree's props (children and element slots) without rendering it. */
function extractText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join(' ').replace(/\s+/g, ' ').trim()
  if (typeof node === 'object' && node !== null && 'props' in node) {
    return hijos((node as { props?: Record<string, unknown> }).props).map(extractText).join(' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

/** Finds EVERY element of the given type in the tree, WITHOUT executing it. */
function findAllByType(node: unknown, type: unknown, out: Array<{ props: Record<string, unknown> }> = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) findAllByType(child, type, out)
    return out
  }
  if ('type' in node) {
    const el = node as { type: unknown; props?: Record<string, unknown> }
    if (el.type === type) out.push(el as { props: Record<string, unknown> })
    for (const hijo of hijos(el.props)) findAllByType(hijo, type, out)
  }
  return out
}

/** Finds the first element of the given type in the tree, WITHOUT executing it. */
function findByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  return findAllByType(node, type)[0] ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
async function render(...args: Parameters<typeof params>): Promise<any> {
  return EdicionDetallePage(params(...args))
}


const INSCRIPCION_APROBADA = {
  ...INSCRIPCION_ROW,
  id: 'i-2',
  persona_principal_nombre: 'Ana López',
  persona_principal_email: null,
  estado: 'aprobado',
  grupo_id: 'g-1',
  grupo_nombre: 'Grupo Alfa',
} as AdminInscripcionesResult['rows'][number]

describe('EdicionDetallePage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    expect(extractText(await render())).toMatch(/deshabilitado/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('asks to log in (neutral Spanish, no voseo) and resolves nothing when there is no user', async () => {
    setup({ user: null })
    expect(extractText(await render())).toMatch(/necesitas iniciar sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    expect(extractText(await render())).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('calls notFound() (404) when the taller slug does not resolve', async () => {
    setup({ taller: null })
    await expect(render('no-existe')).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
  })

  it('calls notFound() (404) when the edición id does not resolve', async () => {
    setup({ edicionDetalle: null })
    await expect(render('matrimonio-sobre-la-roca', 'no-existe')).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
    expect(loadAdminInscripcionesMock).not.toHaveBeenCalled()
  })

  it('calls notFound() (404) when the edición belongs to a DIFFERENT taller', async () => {
    setup({ edicionDetalle: { ...EDICION, taller_slug: 'otro-taller' } })
    await expect(render('matrimonio-sobre-la-roca', 'e-1')).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
    expect(loadAdminInscripcionesMock).not.toHaveBeenCalled()
  })
})

describe('EdicionDetallePage — controls of the edición (permission wiring)', () => {
  it('shows OpenEdicionButton when editarEdicion is granted and estado is borrador', async () => {
    setup({ permisos: { editarEdicion: true } })
    expect(findByType(await render(), OpenEdicionButton)?.props).toEqual({ edicionId: 'e-1' })
  })

  it('hides OpenEdicionButton when editarEdicion is denied', async () => {
    setup({ permisos: { editarEdicion: false } })
    expect(findByType(await render(), OpenEdicionButton)).toBeNull()
  })

  it('shows CancelarEdicionButton for borrador and abierto with editarEdicion, with slug, id and inscritos', async () => {
    for (const estado of ['borrador', 'abierto'] as const) {
      setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado } })
      expect(findByType(await render(), CancelarEdicionButton)?.props).toEqual({
        tallerSlug: 'matrimonio-sobre-la-roca',
        edicionId: 'e-1',
        inscritos: 5,
      })
    }
  })

  it('hides CancelarEdicionButton without editarEdicion, and for en_curso/cerrado/cancelado', async () => {
    setup({ permisos: { editarEdicion: false }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
    expect(findByType(await render(), CancelarEdicionButton)).toBeNull()
    for (const estado of ['en_curso', 'cerrado', 'cancelado'] as const) {
      setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado } })
      expect(findByType(await render(), CancelarEdicionButton)).toBeNull()
    }
  })

  it('passes taller.dream_team_equipo_id to cargarPermisos and scopes loadAdminInscripciones to this edición', async () => {
    setup({})
    await render()
    expect(cargarPermisosMock).toHaveBeenCalledWith(expect.anything(), 'eq-1')
    expect(loadAdminInscripcionesMock).toHaveBeenCalledWith(expect.anything(), { edicion_id: 'e-1' })
  })

  describe('Cerrar edición', () => {
    it('never renders CerrarEdicionButton without editarEdicion', async () => {
      setup({ permisos: { editarEdicion: false }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
      expect(findByType(await render(), CerrarEdicionButton)).toBeNull()
    })

    it('offers the close for abierto, en_curso and a date-derived cerrado that was never closed', async () => {
      for (const estado of ['abierto', 'en_curso', 'cerrado'] as const) {
        setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado } })
        expect(findByType(await render(), CerrarEdicionButton)?.props).toEqual({
          tallerSlug: 'matrimonio-sobre-la-roca',
          edicionId: 'e-1',
          puedeCerrar: true,
        })
      }
    })

    it('does not offer the close for borrador, cancelado or once cerrada_en is set', async () => {
      for (const edicion of [
        { ...EDICION, estado: 'borrador' as const },
        { ...EDICION, estado: 'cancelado' as const },
        { ...EDICION, estado: 'cerrado' as const, cerrada_en: '2026-10-28T12:00:00Z' },
      ]) {
        setup({ permisos: { editarEdicion: true }, edicionDetalle: edicion })
        expect(findByType(await render(), CerrarEdicionButton)?.props.puedeCerrar).toBe(false)
      }
    })
  })

  describe('Inscribir a alguien', () => {
    it('renders with aprobarInscripciones and a cohorte, with the edición data', async () => {
      setup({ permisos: { aprobarInscripciones: true } })
      expect(findByType(await render(), InscribirAlguien)?.props).toEqual({
        tallerSlug: 'matrimonio-sobre-la-roca',
        edicionId: 'e-1',
        cohorteId: 'c-1',
        tipo: 'pareja',
      })
    })

    it('does not render without aprobarInscripciones or without a cohorte', async () => {
      setup({ permisos: { aprobarInscripciones: false } })
      expect(findByType(await render(), InscribirAlguien)).toBeNull()
      setup({ permisos: { aprobarInscripciones: true }, edicionDetalle: { ...EDICION, cohorte: null } })
      expect(findByType(await render(), InscribirAlguien)).toBeNull()
    })
  })
})

describe('EdicionDetallePage — inscripciones (EdicionCliente)', () => {
  it('builds one plain row per inscripción with origen and por_verificar from the extras read', async () => {
    setup({
      inscripciones: { rows: [INSCRIPCION_ROW, INSCRIPCION_APROBADA], total: 2 },
      extras: [
        { id: 'i-1', origen: 'publico', por_verificar: true },
        { id: 'i-2', origen: 'admin', por_verificar: false },
      ],
    })
    const cliente = findByType(await render(), EdicionCliente)
    expect(extrasSelect).toHaveBeenCalledWith('id, origen, por_verificar')
    const inscritas = cliente?.props.inscritas as Array<Record<string, unknown>>
    expect(inscritas).toHaveLength(2)
    expect(inscritas[0]).toMatchObject({
      id: 'i-1',
      nombre: 'Juan Pérez',
      correo: 'juan@example.com',
      estado: 'pendiente',
      origen: 'publico',
      porVerificar: true,
    })
    expect(inscritas[1]).toMatchObject({ id: 'i-2', estado: 'aprobado', origen: 'admin', grupoId: 'g-1', grupoNombre: 'Grupo Alfa' })
  })

  it('keeps the rows without origen or the identity flag when the extras read fails', async () => {
    setup({ extras: null })
    const inscritas = findByType(await render(), EdicionCliente)?.props.inscritas as Array<Record<string, unknown>>
    expect(inscritas).toHaveLength(1)
    expect(inscritas[0]).toMatchObject({ id: 'i-1', origen: null, porVerificar: false })
  })

  it('passes puedeAprobar from aprobarInscripciones and puedeAsignar from gestionarGrupos with a cohorte', async () => {
    setup({ permisos: { aprobarInscripciones: true, gestionarGrupos: true } })
    expect(findByType(await render(), EdicionCliente)?.props).toMatchObject({ puedeAprobar: true, puedeAsignar: true })

    setup({ permisos: {} })
    expect(findByType(await render(), EdicionCliente)?.props).toMatchObject({ puedeAprobar: false, puedeAsignar: false })

    setup({ permisos: { gestionarGrupos: true }, edicionDetalle: { ...EDICION, cohorte: null } })
    expect(findByType(await render(), EdicionCliente)?.props).toMatchObject({ puedeAsignar: false, panelGrupos: null })
  })

  it('asks for the Resultado only once the edición is closed', async () => {
    setup({})
    expect(findByType(await render(), EdicionCliente)?.props.mostrarResultado).toBe(false)
    setup({ edicionDetalle: { ...EDICION, estado: 'cerrado', cerrada_en: '2026-10-28T12:00:00Z' } })
    expect(findByType(await render(), EdicionCliente)?.props.mostrarResultado).toBe(true)
  })

  it('reads the tab, the filters and the open drawer from the URL', async () => {
    setup({ permisos: { gestionarGrupos: true } })
    const cliente = findByType(
      await render('matrimonio-sobre-la-roca', 'e-1', { vista: 'grupos', atencion: 'identidad', origen: 'publico', q: 'ana', item: 'i-1' }),
      EdicionCliente,
    )
    expect(cliente?.props).toMatchObject({
      vistaInicial: 'grupos',
      filtrosIniciales: { atencion: 'identidad', origen: 'publico', q: 'ana' },
      itemInicial: 'i-1',
    })
  })

  it('ignores unknown URL values', async () => {
    setup({})
    const cliente = findByType(await render('matrimonio-sobre-la-roca', 'e-1', { vista: 'x', atencion: 'x', origen: 'x' }), EdicionCliente)
    expect(cliente?.props).toMatchObject({
      vistaInicial: 'inscripciones',
      filtrosIniciales: { atencion: null, origen: null, q: '' },
      itemInicial: null,
    })
  })
})

describe('EdicionDetallePage — Grupos tab', () => {
  const INSTANCIADO = {
    id: 'g-1',
    nombre: 'Grupo Alfa',
    capacidad: 8,
    estado: 'activo',
    ocupacion: 3,
    facilitadores: [
      { id: 'a-2', personaId: 'p-9', rol: 'voluntario', nombre: 'Rosa', apellido: 'Díaz' },
      { id: 'a-1', personaId: 'p-8', rol: 'lider', nombre: 'Yelitza', apellido: 'Rojas' },
    ],
  }

  it('renders GruposSection as the panel with the instanciados grupos, servidores and puedeEditar', async () => {
    setup({ permisos: { gestionarGrupos: true }, gruposInstanciados: [INSTANCIADO] })
    loadServidoresDelTallerMock.mockResolvedValue({ ok: true, servidores: [{ personaId: 'p-8', nombre: 'Yelitza', apellido: 'Rojas' }] })
    const element = await render()
    expect(loadGruposInstanciadosMock).toHaveBeenCalledWith(expect.anything(), 'c-1')
    expect(loadServidoresDelTallerMock).toHaveBeenCalledWith(expect.anything(), 't-1')
    expect(findByType(element, GruposSection)?.props).toEqual({
      cohorteId: 'c-1',
      tallerSlug: 'matrimonio-sobre-la-roca',
      edicionId: 'e-1',
      grupos: [INSTANCIADO],
      servidores: [{ personaId: 'p-8', nombre: 'Yelitza', apellido: 'Rojas' }],
      puedeEditar: true,
    })
  })

  it('offers the grupos to the drawer with the líder as facilitadora and the ocupación', async () => {
    setup({ permisos: { gestionarGrupos: true }, gruposInstanciados: [INSTANCIADO] })
    expect(findByType(await render(), EdicionCliente)?.props.grupos).toEqual([
      { id: 'g-1', nombre: 'Grupo Alfa', facilitadora: 'Yelitza Rojas', ocupacion: 3, capacidad: 8 },
    ])
  })

  it('neither shows the tab nor loads grupos or servidores without gestionarGrupos', async () => {
    setup({ permisos: { aprobarInscripciones: true } })
    const element = await render()
    expect(findByType(element, GruposSection)).toBeNull()
    expect(findByType(element, EdicionCliente)?.props).toMatchObject({ panelGrupos: null, grupos: [] })
    expect(loadGruposInstanciadosMock).not.toHaveBeenCalled()
    expect(loadServidoresDelTallerMock).not.toHaveBeenCalled()
  })

  it('degrades a denied servidores read to an empty picker list', async () => {
    setup({ permisos: { gestionarGrupos: true } })
    loadServidoresDelTallerMock.mockResolvedValue({ ok: false, motivo: 'sin-acceso' })
    expect(findByType(await render(), GruposSection)?.props.servidores).toEqual([])
  })
})

describe('EdicionDetallePage — hero', () => {
  it('titles the page «taller · edición» (desktop h1) and the edición name (phone large title), with breadcrumbs', async () => {
    setup({})
    const element = await render()
    const h1 = findByType(element, 'h1')
    expect(extractText(h1)).toBe('Matrimonio sobre la Roca · Septiembre 2026')
    expect(findByType(element, TituloGrande)?.props).toMatchObject({ titulo: 'Septiembre 2026', nivel: 2 })
    expect(findByType(element, BotonAtrasMovil)?.props.atras).toEqual({
      etiqueta: 'Matrimonio sobre la Roca',
      href: rutaTaller('matrimonio-sobre-la-roca'),
    })
    expect((element.props.breadcrumbs as { props: Record<string, unknown> }).props).toEqual({
      tallerSlug: 'matrimonio-sobre-la-roca',
      tallerNombre: 'Matrimonio sobre la Roca',
      edicionNombre: 'Septiembre 2026',
    })
  })

  it('shows the estado label', async () => {
    setup({ edicionDetalle: { ...EDICION, estado: 'abierto' } })
    expect(findByType(await render(), PuntoEstado)?.props).toEqual({ tono: 'success', etiqueta: 'Abierta' })
    setup({ edicionDetalle: { ...EDICION, estado: 'cancelado' } })
    expect(findByType(await render(), PuntoEstado)?.props).toEqual({ tono: 'danger', etiqueta: 'Cancelada' })
  })

  it('summarises «N inscritas de cupo · mínimo M alcanzado · P por aprobar · la inscripción cierra el …»', async () => {
    setup({
      edicionDetalle: { ...EDICION, estado: 'abierto' },
      cupo: { cupo: 30, ocupados: 14, disponibles: 16, sobreCupo: 0, unidad: 'personas' },
      panelMinimo: { minimo: 10, conteo: { aprobados: 12 }, bajoMinimo: false, suspension: null },
    })
    const texto = extractText(findByType(await render(), TituloGrande)?.props.resumen)
    expect(texto).toMatch(/14 inscritas de 30/)
    expect(texto).toMatch(/mínimo 10 alcanzado/)
    expect(texto).toMatch(/1 por aprobar/)
    expect(texto).toMatch(/la inscripción cierra el sáb 29 ago/)
  })

  it('says parejas for a pareja cupo and flags the inscriptions over the cupo', async () => {
    setup({ cupo: { cupo: 10, ocupados: 11, disponibles: 0, sobreCupo: 1, unidad: 'parejas' } })
    const texto = extractText(findByType(await render(), TituloGrande)?.props.resumen)
    expect(texto).toMatch(/11 parejas de 10/)
    expect(texto).toMatch(/1 sobre el cupo/)
  })

  it('without a cupo counts the active inscriptions, and says «sin cupo definido» for cupo 0', async () => {
    setup({ cupo: null })
    expect(extractText(findByType(await render(), TituloGrande)?.props.resumen)).toMatch(/1 inscrita/)
    setup({ cupo: { cupo: 0, ocupados: 4, disponibles: 0, sobreCupo: 0, unidad: 'personas' } })
    expect(extractText(findByType(await render(), TituloGrande)?.props.resumen)).toMatch(/4 inscritas · sin cupo definido/)
  })

  it('says the mínimo without «alcanzado» below it', async () => {
    setup({ panelMinimo: { minimo: 10, conteo: { aprobados: 3 }, bajoMinimo: false, suspension: null } })
    const texto = extractText(findByType(await render(), TituloGrande)?.props.resumen)
    expect(texto).toMatch(/mínimo 10/)
    expect(texto).not.toMatch(/alcanzado/)
  })

  it('shows the borrador note only for a borrador', async () => {
    setup({ edicionDetalle: { ...EDICION, estado: 'borrador' } })
    expect(extractText(await render())).toMatch(/Esta edición está en borrador/)
    setup({ edicionDetalle: { ...EDICION, estado: 'abierto' } })
    expect(extractText(await render())).not.toMatch(/está en borrador/)
  })

  it('shows "Cerrada el <fecha>" in the church time zone once closed, nothing before', async () => {
    setup({ edicionDetalle: { ...EDICION, estado: 'cerrado', cerrada_en: '2026-10-29T02:00:00Z' } })
    // 02:00 UTC on the 29th is still the 28th in America/Caracas.
    expect(extractText(await render())).toMatch(/Cerrada el 28\/10\/2026/)
    setup({ edicionDetalle: { ...EDICION, estado: 'abierto' } })
    expect(extractText(await render())).not.toMatch(/Cerrada el/)
  })

  it('never uses voseo in the page copy', async () => {
    setup({ permisos: { editarEdicion: true, aprobarInscripciones: true, gestionarGrupos: true } })
    expect(extractText(await render())).not.toMatch(/\b(Tocá|tenés|Elegí|Intentá|Refrescá|podés|querés)\b/)
  })
})

describe('EdicionDetallePage — lugar e indicaciones (T10)', () => {
  it('shows lugar and indicaciones to a reader without editing rights, with no edit button', async () => {
    setup({
      permisos: { editarEdicion: false },
      edicionDetalle: { ...EDICION, estado: 'abierto', lugar: 'Salón 2', indicaciones: 'Trae tu Biblia' },
    })
    const element = await render()
    const texto = extractText(element)
    expect(texto).toContain('Lugar:')
    expect(texto).toContain('Salón 2')
    expect(texto).toContain('Indicaciones para los participantes')
    expect(texto).toContain('Trae tu Biblia')
    expect(findByType(element, EditarDatosPracticosEdicion)).toBeNull()
  })

  it('names neither when both are empty', async () => {
    setup({ permisos: { editarEdicion: false }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
    const texto = extractText(await render())
    expect(texto).not.toContain('Lugar:')
    expect(texto).not.toContain('Indicaciones para los participantes')
    expect(texto).not.toContain('Sin lugar ni indicaciones')
  })

  it('gives editarEdicion the edit button with the current values', async () => {
    setup({
      permisos: { editarEdicion: true },
      edicionDetalle: { ...EDICION, estado: 'abierto', lugar: 'Salón 2', indicaciones: null },
    })
    expect(findByType(await render(), EditarDatosPracticosEdicion)?.props).toEqual({
      tallerSlug: 'matrimonio-sobre-la-roca',
      edicionId: 'e-1',
      lugar: 'Salón 2',
      indicaciones: null,
    })
  })

  it('tells an editor that the notices say only date and hour while both are empty', async () => {
    setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado: 'borrador' } })
    expect(extractText(await render())).toContain('Sin lugar ni indicaciones: los avisos solo dirán la fecha y la hora.')
  })

  it('hides the edit button for a cancelled or closed edición', async () => {
    for (const edicion of [
      { ...EDICION, estado: 'cancelado' as const },
      { ...EDICION, estado: 'cerrado' as const, cerrada_en: '2026-10-28T12:00:00Z' },
    ]) {
      setup({ permisos: { editarEdicion: true }, edicionDetalle: edicion })
      expect(findByType(await render(), EditarDatosPracticosEdicion)).toBeNull()
    }
  })
})

describe('EdicionDetallePage — mínimo (T8a placement)', () => {
  it('places AvisoMinimo before the inscripciones when the edición is below the minimum', async () => {
    setup({ permisos: { editarEdicion: true }, panelMinimo: { minimo: 10, conteo: { aprobados: 3 }, bajoMinimo: true, suspension: null } })
    const element = await render()
    const hijosPagina = (element.props.children as unknown[]).flat().filter(Boolean) as Array<{ type: unknown }>
    const iAviso = hijosPagina.findIndex((h) => h.type === AvisoMinimo)
    const iCliente = hijosPagina.findIndex((h) => h.type === EdicionCliente)
    expect(iAviso).toBeGreaterThan(-1)
    expect(iAviso).toBeLessThan(iCliente)
  })
})

describe('EdicionDetallePage — Fechas (the old Ventana)', () => {
  it('shows "Inscripciones abiertas hasta el {fecha}" for borrador/abierto', async () => {
    setup({ edicionDetalle: { ...EDICION, estado: 'abierto' } })
    const text = extractText(await render())
    expect(text).toMatch(/Inscripciones abiertas hasta el/)
    expect(text).toMatch(/2026/)
  })

  it('shows "En curso hasta el {fecha}" for en_curso, "Cerrada el" for cerrado and a cancelled notice', async () => {
    setup({ edicionDetalle: { ...EDICION, estado: 'en_curso' } })
    expect(extractText(await render())).toMatch(/En curso hasta el/)
    setup({ edicionDetalle: { ...EDICION, estado: 'cerrado' } })
    expect(extractText(await render())).toMatch(/Cerrada el/)
    setup({ edicionDetalle: { ...EDICION, estado: 'cancelado' } })
    expect(extractText(await render())).toMatch(/cancelada/i)
  })

  it('never shows the detailed date fields for a viewer without editarEdicion', async () => {
    setup({ permisos: { editarEdicion: false } })
    const element = await render()
    expect(findByType(element, 'details')).toBeNull()
    expect(findByType(element, 'dl')).toBeNull()
    expect(extractText(element)).not.toMatch(/Ver fechas/)
  })

  it('shows the dates and the taller\'s cierre relativo inside <details> "Ver fechas" with editarEdicion', async () => {
    setup({ permisos: { editarEdicion: true } })
    const text = extractText(findByType(await render(), 'details'))
    expect(text).toMatch(/Ver fechas/)
    expect(text).toMatch(/2026/)
    expect(text).toMatch(/3 días antes de la primera clase/)
  })

  it('shows a "sin fechas" message when the edición has no dates registered yet (legacy row)', async () => {
    setup({ edicionDetalle: { ...EDICION, fecha_inicio: null, fecha_fin: null, cierre_inscripcion: null } })
    expect(extractText(await render())).toMatch(/no tiene fechas registradas/i)
  })

  describe('Reprogramar (T7b)', () => {
    it('shows ReprogramarEdicionDialog with editarEdicion for borrador/abierto/en_curso, never for cerrado/cancelado', async () => {
      for (const estado of ['borrador', 'abierto', 'en_curso'] as const) {
        setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado } })
        expect(findByType(await render(), ReprogramarEdicionDialog)).not.toBeNull()
      }
      for (const estado of ['cerrado', 'cancelado'] as const) {
        setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado } })
        expect(findByType(await render(), ReprogramarEdicionDialog)).toBeNull()
      }
    })

    it('hides ReprogramarEdicionDialog and loads no preview/audit without editarEdicion', async () => {
      setup({ permisos: { editarEdicion: false }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
      expect(findByType(await render(), ReprogramarEdicionDialog)).toBeNull()
      expect(loadReprogramarPreviewMock).not.toHaveBeenCalled()
      expect(loadReprogramacionAuditMock).not.toHaveBeenCalled()
    })

    it('passes the edición dates and the preview counts to ReprogramarEdicionDialog', async () => {
      setup({
        permisos: { editarEdicion: true },
        edicionDetalle: { ...EDICION, estado: 'abierto' },
        reprogramarPreview: { clasesPendientes: 3, primeraClaseCerrada: true },
      })
      expect(findByType(await render(), ReprogramarEdicionDialog)?.props).toEqual({
        tallerSlug: 'matrimonio-sobre-la-roca',
        edicionId: 'e-1',
        fechaInicio: '2026-09-01',
        fechaFin: '2026-10-27',
        cierreInscripcion: '2026-08-29',
        clasesPendientes: 3,
        primeraClaseCerrada: true,
      })
    })

    it('shows the audit line "Reprogramada por {nombre} {apellido} el {fecha}: {motivo}" when present', async () => {
      setup({
        permisos: { editarEdicion: true },
        reprogramacionAudit: { nombre: 'Ana', apellido: 'Gómez', en: '2026-09-15T00:00:00Z', motivo: 'Ajuste de agenda' },
      })
      const text = extractText(await render())
      expect(text).toMatch(/Reprogramada por Ana Gómez el/)
      expect(text).toMatch(/Ajuste de agenda/)
    })

    it('shows no audit line when the edición was never reprogramada', async () => {
      setup({ permisos: { editarEdicion: true }, reprogramacionAudit: null })
      expect(extractText(await render())).not.toMatch(/Reprogramada por/)
    })
  })
})
