/**
 * `<PromocionClient>` — /estudiantes/promocion (C6b3 of
 * odd/tasks/estudiantes-fase-b.md, artboards 09 / 10). The server action is
 * mocked; each flow checks what the screen sends and shows. Without
 * matchMedia the drawer is the desktop side panel. Every person is fictitious.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PromocionClient, type PromocionClientProps } from '@/components/estudiantes/promocion/promocion-client'
import { leerVistaPromocion, type VistaPromocion } from '@/lib/platform/estudiantes/promocion'
import * as acciones from '@/lib/actions/estudiantes-promocion.actions'

jest.mock('@/lib/actions/estudiantes-promocion.actions', () => ({ aplicarPromocion: jest.fn() }))

const exito = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: exito, error: jest.fn(), info: jest.fn() }),
}))

const refresh = jest.fn()
const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh, push }),
  usePathname: () => '/estudiantes/promocion',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

jest.setTimeout(15_000)

const mock = acciones as jest.Mocked<typeof acciones>
const CAMPUS = 'd0000000-0000-4000-8000-000000000001'
const G_T3 = 'c0000000-0000-4000-8000-000000000003'
const G_T7 = 'c0000000-0000-4000-8000-000000000007'
const G_I3 = 'c0000000-0000-4000-8000-000000000013'

const d = (nombre: string, anio_etiqueta: string, ambito: string, subarea: string, extra: Record<string, unknown> = {}) => ({
  nombre,
  nombre_cambia: true,
  choca: null,
  anio: Number(anio_etiqueta[0]),
  anio_etiqueta,
  subarea_id: `s-${ambito}-${subarea}`,
  subarea,
  ambito_id: `a-${ambito}`,
  ambito,
  ...extra,
})

const tercero = (grupo_id: string, nombre: string, subarea: string, lider: [string, string], sexo: string) => ({
  grupo_id,
  nombre,
  ambito_id: 'a-transit',
  ambito: 'Transit',
  subarea_id: `s-${subarea}`,
  subarea,
  anio: 3,
  anio_etiqueta: '3er año',
  tipo: 'por_decidir',
  lideres: [{ servicio_id: `s-${grupo_id}`, persona_id: `p-${grupo_id}`, nombre: lider[0], apellido: lider[1], rol: 'Líder' }],
  miembros: 6,
  visitantes: 0,
  egresan: 0,
  visitantes_egresan: 0,
  suben: 6,
  queda_vacio: false,
  despues: null,
  opciones: {
    pasan_chicos: { grupo: d(`1er año · ${sexo}`, '1er año', 'Transit', subarea), nuevo: d(`4to año · ${sexo} B`, '4to año', 'Inside Out', subarea, { choca: `4to año · ${sexo}` }), llegan: 6, llegan_visitantes: 0 },
    pasa_grupo: {
      grupo: d(`4to año · ${sexo} B`, '4to año', 'Inside Out', subarea, { choca: `4to año · ${sexo}` }),
      sin_primer_anio: true,
      servicios: [{ servicio_id: `s-${grupo_id}`, persona_id: `p-${grupo_id}`, nombre: lider[0], apellido: lider[1], rol: 'Líder', rol_destino: 'Líder', turnos: 1, turnos_destino: 1 }],
    },
  },
  integrantes: [{ persona_id: `m-${grupo_id}`, nombre: 'Elena', apellido: 'Durán', estado: 'miembro', anio: 3, anio_etiqueta: '3er año', egresa: false, anio_nuevo: 4, anio_nuevo_etiqueta: '4to año' }],
})

function crudo(): Record<string, unknown> {
  return {
    campus: { id: CAMPUS, nombre: 'Campus Norte' },
    bloqueado: false,
    ultima: null,
    ambitos: [
      { ambito_id: 'a-transit', nombre: 'Transit', primer_anio: 1, ultimo_anio: 3, primer_etiqueta: '1er año', ultimo_etiqueta: '3er año' },
      { ambito_id: 'a-io', nombre: 'Inside Out', primer_anio: 4, ultimo_anio: 6, primer_etiqueta: '4to año', ultimo_etiqueta: '6to año' },
    ],
    the_living_room: { ambito_id: 'a-tlr', nombre: 'The Living Room' },
    grupos: [
      tercero(G_T3, '3er año · Chicas', 'Grupos de Chicas', ['Karla', 'Mujica'], 'Chicas'),
      tercero(G_T7, '3er año · Chicos', 'Grupos de Chicos', ['Diego', 'Carrasco'], 'Chicos'),
      {
        grupo_id: G_I3,
        nombre: '6to año · Chicas',
        ambito_id: 'a-io',
        ambito: 'Inside Out',
        subarea_id: 's-io-chicas',
        subarea: 'Grupos de Chicas',
        anio: 6,
        anio_etiqueta: '6to año',
        tipo: 'vuelve',
        lideres: [{ servicio_id: 's-i3', persona_id: 'p-i3', nombre: 'Mariela', apellido: 'Duarte', rol: 'Líder' }],
        miembros: 1,
        visitantes: 0,
        egresan: 1,
        visitantes_egresan: 0,
        suben: 0,
        queda_vacio: true,
        despues: d('4to año · Chicas', '4to año', 'Inside Out', 'Grupos de Chicas'),
        opciones: null,
        integrantes: [{ persona_id: 'p-41', nombre: 'Adriana', apellido: 'Belisario', estado: 'miembro', anio: 6, anio_etiqueta: '6to año', egresa: true, anio_nuevo: null, anio_nuevo_etiqueta: null }],
      },
    ],
    egresados: [
      { persona_id: 'p-41', nombre: 'Adriana', apellido: 'Belisario', genero: 'Femenino', grupo_id: G_I3, grupo: '6to año · Chicas', estado: 'miembro', anio: 6, anio_etiqueta: '6to año', anio_final: 6, anio_final_etiqueta: '6to año', destino: { ambito_id: 'a-tlr', subarea_id: 's-tlr', subarea: 'Grupos de Chicas' } },
    ],
    sin_grupo: [],
    totales: { grupos: 3, integrantes: 13, visitantes: 0, suben: 12, pasan_inside_out: 12, egresan: 1, sin_grupo: 0, por_decidir: 2, quedan_vacios: 1 },
  }
}

const leer = (cambios: (v: Record<string, unknown>) => void = () => {}): VistaPromocion => {
  const v = crudo()
  cambios(v)
  return leerVistaPromocion(v)!
}

function props(extra: Partial<PromocionClientProps> = {}): PromocionClientProps {
  return { campus: [{ id: CAMPUS, nombre: 'Campus Norte' }], campusId: CAMPUS, contenido: { tipo: 'vista', vista: leer() }, ...extra }
}

let user: ReturnType<typeof userEvent.setup>
const replaceState = jest.spyOn(window.history, 'replaceState')

beforeEach(() => {
  jest.clearAllMocks()
  user = userEvent.setup({ delay: null })
})

const promover = () => screen.getAllByRole('button', { name: 'Promover temporada' })[0]

describe('the preview', () => {
  it('shows the hero, the metrics, one decision per 3er año group and keeps "Promover temporada" disabled', () => {
    render(<PromocionClient {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Promover temporada' })).toBeInTheDocument()
    expect(screen.getByText('Se aplica una vez al año y no se puede deshacer desde la app.')).toBeInTheDocument()
    const metricas = screen.getByRole('group', { name: 'Resumen de la promoción' })
    expect(within(metricas).getAllByRole('button')).toHaveLength(4)
    expect(screen.getAllByRole('group', { name: '¿Qué pasa con este grupo?' })).toHaveLength(2)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: /Pasan las chicas/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Pasan los chicos/ })).toBeInTheDocument()
    expect(promover()).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Falta decidir 2 grupos de 3er año: 3er año · Chicas y 3er año · Chicos.')
    expect(screen.getByText('Adriana Belisario')).toBeInTheDocument()
  })

  it('explains each choice and enables "Promover temporada" once both are made', async () => {
    render(<PromocionClient {...props()} />)
    await user.click(screen.getByRole('radio', { name: /Pasan las chicas/ }))
    expect(screen.getByText('→ Inside Out · 4to año · Chicas (grupo nuevo, sin líder)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir 4to año · Chicas B (grupo nuevo)' })).toBeInTheDocument()
    expect(promover()).toBeDisabled()
    const chicos = screen.getAllByRole('radio', { name: /Pasa el grupo con su líder/ })[1]
    await user.click(chicos)
    expect(screen.getByText(/Diego Carrasco deja de servir en Transit · Grupos de Chicos/)).toBeInTheDocument()
    expect(screen.getByText(/Transit se queda sin grupo de 1er año · Chicos/)).toBeInTheDocument()
    expect(promover()).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('Todo listo.')
  })

  it('filters by a metric and writes it in the URL', async () => {
    render(<PromocionClient {...props()} />)
    await user.click(within(screen.getByRole('group', { name: 'Resumen de la promoción' })).getByRole('button', { name: /Quedan vacíos/ }))
    expect(screen.getAllByRole('button', { name: /^Abrir / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir 6to año · Chicas'])
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/estudiantes/promocion?metrica=vacios')
  })

  it('opens a pending group in the drawer and goes to its decision', async () => {
    render(<PromocionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Abrir 3er año · Chicas' }))
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Falta decidir qué pasa con este grupo')).toBeInTheDocument()
    expect(within(panel).getByText('3er año → 4to año · Inside Out')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Ir a la decisión' }))
    await waitFor(() => expect(screen.getAllByRole('radio', { name: /Pasan las chicas/ })[0]).toHaveFocus())
  })
})

describe('applying', () => {
  async function decidirTodo() {
    await user.click(screen.getByRole('radio', { name: /Pasan las chicas/ }))
    await user.click(screen.getAllByRole('radio', { name: /Pasa el grupo con su líder/ })[1])
  }

  it('asks first, then applies with one decision per 3er año group', async () => {
    mock.aplicarPromocion.mockResolvedValue({ ok: true, data: { grupos: 3, egresan: 1, fichasSuben: 13, gruposNuevos: ['4to año · Chicas B'], pasanGrupo: [], aplicadaAt: null, proxima: null } })
    render(<PromocionClient {...props()} />)
    await decidirTodo()
    await user.click(promover())
    const dialogo = screen.getByRole('alertdialog')
    expect(within(dialogo).getByRole('heading', { name: '¿Promover Campus Norte?' })).toBeInTheDocument()
    const lineas = within(dialogo).getAllByRole('listitem').map((li) => li.textContent)
    expect(lineas[0]).toBe('3 grupos y 12 estudiantes suben un año.')
    expect(lineas[1]).toMatch(/^3er año · Chicas: pasan las chicas a 4to año · Chicas B/)
    await user.click(within(dialogo).getByRole('button', { name: 'Promover temporada' }))
    expect(mock.aplicarPromocion).toHaveBeenCalledWith({ campusId: CAMPUS, decisiones: { [G_T3]: 'pasan_chicos', [G_T7]: 'pasa_grupo' } })
    await waitFor(() => expect(exito).toHaveBeenCalledWith('Campus Norte promovido: 3 grupos subieron un año'))
    expect(refresh).toHaveBeenCalled()
  })

  it('keeps the dialog open with the error', async () => {
    mock.aplicarPromocion.mockResolvedValue({ ok: false, message: 'Este campus ya se promovió hace menos de 180 días. Recarga la página para ver cuándo se habilita.' })
    render(<PromocionClient {...props()} />)
    await decidirTodo()
    await user.click(promover())
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Promover temporada' }))
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent('Este campus ya se promovió hace menos de 180 días.')
    expect(refresh).not.toHaveBeenCalled()
    expect(exito).not.toHaveBeenCalled()
  })
})

describe('other states', () => {
  it('shows the blocked state of a campus promoted less than 180 days ago', () => {
    const vista = leer((c) => {
      c.bloqueado = true
      c.ultima = { promocion_id: 'e1', aplicada_at: '2026-09-14T13:15:00+00:00', por: { nombre: 'Rosa', apellido: 'Díaz' }, proxima: '2027-03-13', resumen: { grupos: 13, egresan: 16, fichas_suben: 115, grupos_nuevos: [] } }
    })
    render(<PromocionClient {...props({ contenido: { tipo: 'vista', vista } })} />)
    expect(screen.getByText('Ya se promovió este campus el 14 sep 2026')).toBeInTheDocument()
    expect(screen.getByText(/Lo hizo Rosa Díaz a las 9:15/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Grupos' })).toHaveAttribute('href', '/estudiantes/grupos')
    expect(screen.getByRole('link', { name: 'Ver Sin grupo de The Living Room' })).toHaveAttribute('href', '/estudiantes/grupos?ambito=a-tlr')
    expect(screen.queryByRole('button', { name: 'Promover temporada' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('explains a campus without a year scale', () => {
    render(<PromocionClient {...props({ contenido: { tipo: 'sin_escala' } })} />)
    expect(screen.getByText('Este campus no tiene escala de años')).toBeInTheDocument()
  })

  it('offers a campus select when there is more than one', async () => {
    const otro = 'd0000000-0000-4000-8000-000000000002'
    render(<PromocionClient {...props({ campus: [{ id: CAMPUS, nombre: 'Campus Norte' }, { id: otro, nombre: 'Campus Oeste' }] })} />)
    await user.selectOptions(screen.getByLabelText('Campus'), otro)
    expect(push).toHaveBeenCalledWith(`/estudiantes/promocion?campus=${otro}`)
  })
})
