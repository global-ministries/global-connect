/**
 * /ninos/etiquetas (odd/tasks/ninos-checkin-pco.md, T3b, S10, S6): the same
 * gate as Eventos and Salones (ninos_puede_configurar_algun_area, else 404);
 * campuses where the caller configures some area; the stations of that
 * campus and its reprints of today, read as the user.
 */
import type { ReactElement } from 'react'

import NinosEtiquetasPage from '@/app/(auth)/ninos/etiquetas/page'

const rpc = jest.fn()
const from = jest.fn((tabla: string) => {
  const q: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'in', 'order']) q[op] = () => q
  const data = tabla === 'ninos_salones' ? [{ campus_id: 'c1' }, { campus_id: 'c2' }] : [{ id: 'c1', nombre: 'Barquisimeto' }]
  q.then = (resolve: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve)
  return q
})

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc, from }) }))
jest.mock('@/components/ninos/etiquetas/etiquetas-client', () => ({ EtiquetasClient: () => null }))

beforeEach(() => rpc.mockReset())

it('404 for whoever configures no Niños area', async () => {
  rpc.mockResolvedValue({ data: false, error: null })
  await expect(NinosEtiquetasPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
})

it('reads the stations and the reprints of today of the first allowed campus', async () => {
  rpc.mockImplementation(async (nombre: string, args: Record<string, unknown>) => {
    if (nombre === 'ninos_puede_configurar_algun_area') return { data: true, error: null }
    if (nombre === 'ninos_puede_configurar_algun_area_campus') return { data: args.p_campus_id === 'c1', error: null }
    if (nombre === 'ninos_impresion_estaciones')
      return {
        data: [
          { id: 'e1', campus_id: 'c1', nombre: 'Mesa 1', ancho_mm: null, alto_mm: null, dpi: 203, activa: true, ultima_conexion: null, pendientes: 0, puede_administrar: true },
          { id: 'e2', campus_id: 'c2', nombre: 'Otra', ancho_mm: null, alto_mm: null, dpi: 203, activa: true, ultima_conexion: null, pendientes: 0, puede_administrar: false },
        ],
        error: null,
      }
    if (nombre === 'ninos_impresion_reimpresiones') return { data: [], error: null }
    return { data: null, error: null }
  })
  const el = (await NinosEtiquetasPage({ searchParams: Promise.resolve({}) })) as ReactElement<Record<string, unknown>>
  expect(el.props.campusId).toBe('c1')
  expect((el.props.estaciones as { id: string }[]).map((e) => e.id)).toEqual(['e1'])
  expect(el.props.puedeAdministrar).toBe(true)
  expect(el.props.errorLectura).toBeNull()
  const hoy = el.props.hoy as string
  expect(rpc).toHaveBeenCalledWith('ninos_impresion_reimpresiones', { p_campus_id: 'c1', p_desde: hoy, p_hasta: hoy })
})

it('a failed read of the stations is said, not hidden', async () => {
  rpc.mockImplementation(async (nombre: string) => {
    if (nombre === 'ninos_impresion_estaciones') return { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    if (nombre === 'ninos_impresion_reimpresiones') return { data: [], error: null }
    return { data: true, error: null }
  })
  const el = (await NinosEtiquetasPage({ searchParams: Promise.resolve({ campus: 'c1' }) })) as ReactElement<Record<string, unknown>>
  expect(el.props.errorLectura).toBe('No se pudieron leer las impresoras. Recarga la página.')
})
