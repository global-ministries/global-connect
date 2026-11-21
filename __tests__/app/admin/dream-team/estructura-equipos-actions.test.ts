/**
 * Estructura server actions for equipos (odd/tasks/dream-team-estructura-correcciones.md,
 * T3, S4, S5): crearEquipo, renombrarEquipo, cambiarActivoEquipo and moverEquipo
 * call the dream_team_equipo_* RPCs, which decide per equipo
 * (dream_team_gestiona_equipo). The action lets in a director (dream_team.direct
 * anywhere), org.manage, admin and pastor, refuses everyone else before any
 * call, validates the input and maps the RPC codes to Spanish messages.
 */
import { cambiarActivoEquipo, crearEquipo, moverEquipo, renombrarEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'

const rpc = jest.fn()
const revalidatePath = jest.fn()
let sesion: unknown

jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn(async () => ({ rpc })) }))
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => true,
  requireDreamTeamSession: async () => sesion,
  hasDreamTeamOrgManageCapability: () => false,
}))
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({}),
}))

const capacidad = (key: string, scopeId?: string) => ({
  key,
  experience: 'dream_team',
  scopeType: scopeId ? 'equipo' : 'experience',
  ...(scopeId ? { scopeId } : {}),
  source: 'test',
})
const sesionCon = (capabilities: unknown[], globalRoles: string[] = []) => ({
  personaId: 'p1',
  subjectAuthId: 'a1',
  globalRoles,
  contexts: [],
  capabilities,
})

const FILA = { id: 'eq-new', experiencia: 'dps', parent_equipo_id: 'eq-dps', label: 'Bautizos', activo: true }
const EQUIPO = { id: 'eq-new', experiencia: 'dps', parentEquipoId: 'eq-dps', label: 'Bautizos', activo: true }

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: FILA, error: null })
  revalidatePath.mockReset()
  sesion = sesionCon([capacidad('dream_team.direct', 'eq-dps')])
})

describe('crearEquipo («+ Subequipo»)', () => {
  it('lets a scoped director create through dream_team_equipo_crear', async () => {
    const resultado = await crearEquipo({ parentEquipoId: 'eq-dps', label: '  Bautizos  ' })

    expect(resultado).toEqual({ ok: true, equipo: EQUIPO })
    expect(rpc).toHaveBeenCalledWith('dream_team_equipo_crear', { p_padre: 'eq-dps', p_label: 'Bautizos' })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/dream-team/estructura')
  })

  it.each([
    ['org.manage', sesionCon([capacidad('dream_team.org.manage')])],
    ['an admin', sesionCon([], ['admin'])],
    ['a pastor', sesionCon([], ['pastor'])],
  ])('lets %s in too', async (_quien, laSesion) => {
    sesion = laSesion
    expect(await crearEquipo({ parentEquipoId: 'eq-dps', label: 'Bautizos' })).toEqual({ ok: true, equipo: EQUIPO })
  })

  it.each([
    ['a coordinator', sesionCon([capacidad('dream_team.coordinate', 'eq-dps')])],
    ['director.coordinate', sesionCon([capacidad('dream_team.director.coordinate')])],
    ['a volunteer', sesionCon([capacidad('dream_team.serve', 'eq-dps')])],
  ])('refuses %s before calling the database', async (_quien, laSesion) => {
    sesion = laSesion
    expect(await crearEquipo({ parentEquipoId: 'eq-dps', label: 'Bautizos' })).toEqual({ ok: false, error: 'forbidden' })
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses without a session', async () => {
    sesion = null
    expect(await crearEquipo({ parentEquipoId: 'eq-dps', label: 'Bautizos' })).toEqual({ ok: false, error: 'unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('validates the name and the parent before calling', async () => {
    expect(await crearEquipo({ parentEquipoId: 'eq-dps', label: '  ' })).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'La etiqueta es obligatoria.',
    })
    expect(await crearEquipo({ parentEquipoId: ' ', label: 'Bautizos' })).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'Falta el equipo padre.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers the database refusal in Spanish and does not revalidate', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_autoridad' } })

    expect(await crearEquipo({ parentEquipoId: 'eq-otro', label: 'Bautizos' })).toEqual({
      ok: false,
      error: 'forbidden',
      message: 'No diriges este equipo ni uno superior, así que no puedes cambiarlo.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('renombrarEquipo and cambiarActivoEquipo', () => {
  it('rename through dream_team_equipo_renombrar', async () => {
    expect(await renombrarEquipo({ id: 'eq-new', label: ' Bautizos ' })).toEqual({ ok: true, equipo: EQUIPO })
    expect(rpc).toHaveBeenCalledWith('dream_team_equipo_renombrar', { p_equipo: 'eq-new', p_label: 'Bautizos' })
  })

  it('maps a repeated name', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'nombre_repetido' } })
    expect(await renombrarEquipo({ id: 'eq-new', label: 'Video' })).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'Ya hay un equipo con ese nombre en ese lugar (puede estar inactivo). Elige otro nombre.',
    })
  })

  it('deactivates through dream_team_equipo_cambiar_activo', async () => {
    rpc.mockResolvedValue({ data: { ...FILA, activo: false }, error: null })
    expect(await cambiarActivoEquipo({ id: 'eq-new', activo: false })).toEqual({ ok: true, equipo: { ...EQUIPO, activo: false } })
    expect(rpc).toHaveBeenCalledWith('dream_team_equipo_cambiar_activo', { p_equipo: 'eq-new', p_activo: false })
  })

  it('refuses a coordinator before calling', async () => {
    sesion = sesionCon([capacidad('dream_team.coordinate', 'eq-dps')])
    expect(await renombrarEquipo({ id: 'eq-new', label: 'X' })).toEqual({ ok: false, error: 'forbidden' })
    expect(await cambiarActivoEquipo({ id: 'eq-new', activo: false })).toEqual({ ok: false, error: 'forbidden' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('moverEquipo («Mover a…»)', () => {
  it('moves through dream_team_equipo_mover and returns the new path', async () => {
    rpc.mockResolvedValue({ data: { ...FILA, parent_equipo_id: 'eq-con', ruta: 'Dirección de Conexión › Bautizos' }, error: null })

    expect(await moverEquipo({ id: 'eq-new', nuevoPadreId: 'eq-con' })).toEqual({
      ok: true,
      equipo: { ...EQUIPO, parentEquipoId: 'eq-con' },
      ruta: 'Dirección de Conexión › Bautizos',
    })
    expect(rpc).toHaveBeenCalledWith('dream_team_equipo_mover', { p_equipo: 'eq-new', p_nuevo_padre: 'eq-con' })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/dream-team/estructura')
  })

  it('validates both ids before calling', async () => {
    expect(await moverEquipo({ id: '', nuevoPadreId: 'eq-con' })).toEqual({ ok: false, error: 'invalid-input', message: 'Falta el equipo a mover.' })
    expect(await moverEquipo({ id: 'eq-new', nuevoPadreId: ' ' })).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'Elige el equipo de destino.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['42501', 'sin_autoridad', 'forbidden', 'Para moverlo tienes que dirigir el equipo donde está y el equipo destino (o uno superior a cada uno).'],
    ['22023', 'ciclo', 'invalid-input', 'No puedes moverlo dentro de sí mismo ni de uno de sus subequipos.'],
    [
      '22023',
      'dps_convocados_pendientes',
      'invalid-input',
      'Hay personas convocadas en planes de DPS de hoy en adelante en este equipo. Quítalas de esos planes antes de sacarlo de DPS.',
    ],
  ])('maps %s %s', async (code, message, error, texto) => {
    rpc.mockResolvedValue({ data: null, error: { code, message } })
    expect(await moverEquipo({ id: 'eq-new', nuevoPadreId: 'eq-con' })).toEqual({ ok: false, error, message: texto })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a coordinator before calling', async () => {
    sesion = sesionCon([capacidad('dream_team.coordinate', 'eq-dps')])
    expect(await moverEquipo({ id: 'eq-new', nuevoPadreId: 'eq-con' })).toEqual({ ok: false, error: 'forbidden' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
