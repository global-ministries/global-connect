/**
 * «Notas de líderes» (S11) and «Próximos cumpleaños» (S12) of the home
 * (odd/tasks/home-por-rol.md T7). The sections come from decidirSecciones, as
 * on the page; each one is hidden when its data is empty.
 */
import { render, screen, within } from '@testing-library/react'

import { PantallaInicio } from '@/components/inicio/pantalla-inicio'
import type { Cumpleanos } from '@/lib/inicio/cargar-cumpleanos'
import type { NotaLider } from '@/lib/inicio/cargar-notas-lideres'
import { decidirSecciones } from '@/lib/inicio/decidir-secciones'
import { HECHOS_VACIOS, type HechosInicio } from '@/lib/inicio/hechos'

const hechos = (h: Partial<HechosInicio>): HechosInicio => ({ ...HECHOS_VACIOS, usuarioId: 'u-1', hizoProximoPaso: true, ...h })
const DIRECTORA = hechos({ etapasDirigidas: ['sl-1'] })

const nota = (n: number, extra: Partial<NotaLider> = {}): NotaLider => ({
  eventoId: `e-${n}`,
  grupoId: `g-${n}`,
  grupo: `Grupo ${n}`,
  nota: `Nota del grupo ${n}`,
  lider: `Líder ${n}`,
  presentes: 9,
  total: 12,
  fecha: '2026-11-05',
  ...extra,
})

const NOTAS: NotaLider[] = [
  nota(1, { grupo: 'Mujeres +36 · El Ujano', nota: 'Oramos por la familia Pérez; Gladys vuelve la próxima semana.', lider: 'Yelitza Rodríguez', fecha: '2026-11-09' }),
  nota(2, { fecha: '2026-11-08' }),
  ...[3, 4, 5, 6, 7].map((n) => nota(n)),
]

const CUMPLEANOS: Cumpleanos[] = [
  { id: 'u-1', nombre: 'Ramón Pérez', fecha: '2026-11-09', contexto: 'Hombres +36' },
  { id: 'u-2', nombre: 'Luis Torres', fecha: '2026-11-10', contexto: null },
  { id: 'u-3', nombre: 'Ana María Linárez', fecha: '2026-11-12', contexto: null },
]

function pintar(h: HechosInicio, datos: { notasLideres?: NotaLider[]; cumpleanos?: Cumpleanos[] }) {
  return render(<PantallaInicio nombre="Gladys" hoy="2026-11-09" secciones={decidirSecciones(h)} {...datos} />)
}

const titulos = () => screen.getAllByRole('heading', { level: 2 }).map((t) => t.textContent)

describe('Notas de líderes (S11)', () => {
  it('muestra la cuenta, hasta 5 notas que abren su reunión y el enlace a todas', () => {
    pintar(DIRECTORA, { notasLideres: NOTAS })

    const notas = screen.getByRole('region', { name: 'Notas de líderes' })
    expect(within(notas).getByText('7', { selector: '[aria-hidden="true"]' })).toBeInTheDocument()
    expect(within(notas).getByText(', 7 notas')).toBeInTheDocument()

    const filas = within(notas).getAllByRole('link').filter((l) => l.getAttribute('href')?.includes('/asistencia/'))
    expect(filas).toHaveLength(5)
    const primera = filas[0]
    expect(primera).toHaveAttribute('href', '/grupos-vida/g-1/asistencia/e-1')
    expect(within(primera).getByText('Mujeres +36 · El Ujano')).toBeInTheDocument()
    expect(within(primera).getByText('Oramos por la familia Pérez; Gladys vuelve la próxima semana.')).toHaveClass('truncate')
    expect(within(primera).getByText(/Yelitza Rodríguez/)).toBeInTheDocument()
    expect(within(primera).getByText('9/12')).toHaveClass('font-mono')
    expect(within(primera).getByText('Hoy')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Ayer')).toBeInTheDocument()
    expect(within(filas[2]).getByText('jue 5 nov')).toBeInTheDocument()

    expect(within(notas).getByRole('link', { name: 'Ver todas las notas (7)' })).toHaveAttribute('href', '/notas-lideres')
  })

  it('va justo después de «A tu cargo» cuando hay notas', () => {
    pintar(hechos({ esAdminOPastor: true }), { notasLideres: [nota(1)], cumpleanos: CUMPLEANOS })

    expect(titulos()).toEqual(['Notas de líderes', 'Próximos cumpleaños', 'Explorar'])
    expect(screen.getByRole('link', { name: 'Ver todas las notas (1)' })).toBeInTheDocument()
  })

  it('sin notas (o si no cargaron) no aparece', () => {
    pintar(DIRECTORA, { notasLideres: [] })

    expect(screen.queryByRole('region', { name: 'Notas de líderes' })).not.toBeInTheDocument()
  })
})

describe('Próximos cumpleaños (S12)', () => {
  it('cada fila con iniciales, nombre, contexto y el día', () => {
    pintar(DIRECTORA, { cumpleanos: CUMPLEANOS })

    const seccion = screen.getByRole('region', { name: 'Próximos cumpleaños' })
    const filas = within(seccion).getAllByRole('listitem')
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('RP')
    expect(within(filas[0]).getByText('Ramón Pérez')).toBeInTheDocument()
    expect(within(filas[0]).getByText('Hombres +36')).toBeInTheDocument()
    expect(within(filas[0]).getByText('Hoy')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Mañana')).toBeInTheDocument()
    expect(within(filas[2]).getByText('jue 12 nov')).toBeInTheDocument()
    expect(filas[2]).toHaveTextContent('AM')
    // No page lists every birthday: no «Ver todos».
    expect(within(seccion).queryByRole('link')).not.toBeInTheDocument()
  })

  it('muestra hasta 5', () => {
    const muchos = Array.from({ length: 7 }, (_, i): Cumpleanos => ({ id: `u-${i}`, nombre: `Persona ${i}`, fecha: '2026-11-15', contexto: null }))
    pintar(DIRECTORA, { cumpleanos: muchos })

    expect(within(screen.getByRole('region', { name: 'Próximos cumpleaños' })).getAllByRole('listitem')).toHaveLength(5)
  })

  it('sin cumpleaños no aparece', () => {
    pintar(DIRECTORA, { cumpleanos: [] })

    expect(screen.queryByRole('region', { name: 'Próximos cumpleaños' })).not.toBeInTheDocument()
  })

  it.each(['Miembro', 'Colíder'] as const)('el %s ve los de su grupo, con el grupo como contexto (S14a), pero no las notas', (rol) => {
    const deSuGrupo: Cumpleanos[] = [{ id: 'u-2', nombre: 'Ana Pérez', fecha: '2026-11-10', contexto: 'Matrimonios · Zona Este' }]
    pintar(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios · Zona Este', rol }] }), { cumpleanos: deSuGrupo, notasLideres: NOTAS })

    const seccion = screen.getByRole('region', { name: 'Próximos cumpleaños' })
    const [fila] = within(seccion).getAllByRole('listitem')
    expect(within(fila).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(fila).getByText('Matrimonios · Zona Este')).toBeInTheDocument()
    expect(within(fila).getByText('Mañana')).toBeInTheDocument()
    expect(fila).not.toHaveTextContent(/\d{4}|años/)
    expect(screen.queryByRole('region', { name: 'Notas de líderes' })).not.toBeInTheDocument()
  })

  it('el miembro sin cumpleaños cercanos en su grupo no ve la sección', () => {
    pintar(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Miembro' }] }), { cumpleanos: [] })

    expect(screen.queryByRole('region', { name: 'Próximos cumpleaños' })).not.toBeInTheDocument()
  })
})
