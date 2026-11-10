/**
 * «A tu cargo» and «Visión general» of the home (odd/tasks/home-por-rol.md
 * T4, S5–S7; design/home-por-rol 05 líder, 06 director de área, 07 pastor,
 * 09 directora de etapa, 10 director general). The sections come from
 * decidirSecciones, as on the page; the data is what cargarACargo and the
 * Visión general loader return.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { PantallaInicio } from '@/components/inicio/pantalla-inicio'
import type { DatosVisionGeneral } from '@/components/inicio/seccion-vision-general'
import type { DatosArea, DatosCargo, DatosEtapa, DatosGrupoLider, DatosSegmento } from '@/lib/inicio/cargar-a-cargo'
import { decidirSecciones } from '@/lib/inicio/decidir-secciones'
import { HECHOS_VACIOS, type HechosInicio } from '@/lib/inicio/hechos'

const marcarProximoPasoVoluntario = jest.fn()
const notificarError = jest.fn()

jest.mock('@/lib/actions/proximo-paso.actions', () => ({ marcarProximoPasoVoluntario: (...a: unknown[]) => marcarProximoPasoVoluntario(...a) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ error: notificarError, success: jest.fn(), info: jest.fn() }) }))

const hechos = (h: Partial<HechosInicio>): HechosInicio => ({ ...HECHOS_VACIOS, usuarioId: 'u-1', hizoProximoPaso: true, ...h })

const LIDER: DatosGrupoLider = {
  tipo: 'grupo-lider',
  grupoId: 'g-1',
  nombre: 'Hombres +36 · Cabudare Este',
  proximaReunion: { fecha: '2026-11-12', hora: '19:30' },
  lugar: 'Casa de los Linárez',
  miembros: 14,
  ultimaReunion: { fecha: '2026-10-29', asistencia: 71 },
  ausentes: ['Pedro Linárez', 'Jesús Escalona', 'Rafael Mujica'],
  nuevos: 1,
}

const AREA: DatosArea = {
  tipo: 'area-dream-team',
  equipoId: 'eq-1',
  nombre: 'Dirección de Niños',
  activos: 52,
  postulados: 4,
  enOrientacion: 1,
  sinTurno: 3,
  sinProximoPaso: [
    { usuarioId: 'u-a', nombre: 'Andrea Colmenares', estado: 'postulado', equipo: 'Waumba Land' },
    { usuarioId: 'u-j', nombre: 'Jesús Pacheco', estado: 'postulado', equipo: 'UpStreet' },
    { usuarioId: 'u-y', nombre: 'Yusmary Torres', estado: 'en_orientacion', equipo: 'Recepción de Niños' },
  ],
}

const ETAPA: DatosEtapa = {
  tipo: 'etapa',
  directorEtapaId: 'sl-1',
  nombre: 'Mujeres +36',
  grupos: [
    { grupoId: 'g-ok', nombre: 'Mujeres +36 · Centro', lideres: ['Ana Pérez'], asistencia: 80, reporto: true },
    { grupoId: 'g-sr', nombre: 'Mujeres +36 · Santa Rosa', lideres: ['Gladys Piña'], asistencia: null, reporto: false },
    { grupoId: 'g-ri', nombre: 'Mujeres +36 · El Ujano', lideres: ['Yelitza Rodríguez'], asistencia: 42, reporto: true },
  ],
  personas: 212,
  asistencia: 61,
  enRiesgo: 1,
  sinReporte: 1,
}

const SEGMENTO: DatosSegmento = {
  tipo: 'segmento',
  segmentoId: 'seg-1',
  nombre: 'Matrimonios',
  grupos: Array(39).fill(ETAPA.grupos[0]),
  personas: 380,
  asistencia: 77,
  enRiesgo: 2,
  sinReporte: 3,
  etapas: [
    { directorEtapaId: 'sl-a', directores: ['Andrés Rivas', 'Paola Rivas'], grupos: Array(14).fill(ETAPA.grupos[0]), personas: 120, asistencia: 81, enRiesgo: 0, sinReporte: 3 },
    { directorEtapaId: 'sl-b', directores: ['Carlos Oropeza'], grupos: Array(16).fill(ETAPA.grupos[0]), personas: 160, asistencia: 72, enRiesgo: 2, sinReporte: 0 },
    { directorEtapaId: 'sl-c', directores: ['Luis Querales'], grupos: Array(9).fill(ETAPA.grupos[0]), personas: 100, asistencia: 84, enRiesgo: 0, sinReporte: 0 },
  ],
}

const VISION: DatosVisionGeneral = {
  personas: 2340,
  nuevos: 64,
  grupos: 128,
  asistencia: 78,
  dreamTeam: 412,
  tendencia: [74, 76, 73, 77, 80, 79, 76, 78],
  gruposEnRiesgo: [
    { grupoId: 'g-1', nombre: 'Jóvenes · Patarata', asistencia: 38 },
    { grupoId: 'g-2', nombre: 'Matrimonios · Centro', asistencia: 45 },
  ],
  gruposSinCasa: 4,
  postulados: 23,
}

function pintar(h: HechosInicio, aCargo: (DatosCargo | null)[] = [], visionGeneral?: DatosVisionGeneral) {
  return render(<PantallaInicio nombre="José Silva" hoy="2026-11-09" secciones={decidirSecciones(h)} aCargo={aCargo} visionGeneral={visionGeneral} />)
}

const region = (nombre: string) => screen.getByRole('region', { name: nombre })
const metrica = (grupo: HTMLElement, etiqueta: string) => within(grupo).getByText(etiqueta).closest('[data-metrica]') as HTMLElement

describe('A tu cargo', () => {
  beforeEach(() => {
    marcarProximoPasoVoluntario.mockReset()
    notificarError.mockReset()
  })

  it('05 líder: su grupo, la acción de asistencia, 4 métricas y lo que necesita atención', () => {
    pintar(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Líder' }] }), [LIDER])

    const grupo = region('Grupo que lidero')
    expect(within(grupo).getByRole('heading', { level: 3, name: 'Hombres +36 · Cabudare Este' })).toBeInTheDocument()
    expect(within(grupo).getByText(/Próxima reunión: Jueves 12 nov/)).toHaveTextContent('Próxima reunión: Jueves 12 nov · 7:30 pm · Casa de los Linárez')
    expect(within(grupo).getByRole('link', { name: 'Pasar asistencia' })).toHaveAttribute('href', '/grupos-vida/g-1/asistencia')
    expect(within(grupo).getByRole('link', { name: 'Ver grupo' })).toHaveAttribute('href', '/grupos-vida/g-1')

    const metricas = within(grupo).getByRole('group', { name: 'Métricas de Hombres +36 · Cabudare Este' })
    expect(metrica(metricas, 'Miembros')).toHaveTextContent('14')
    expect(metrica(metricas, 'Asistencia')).toHaveTextContent('71%')
    expect(metrica(metricas, 'Ausentes')).toHaveTextContent('3')
    expect(metrica(metricas, 'Nuevos')).toHaveTextContent('1')

    const atencion = within(grupo).getByRole('list', { name: 'Atención' })
    expect(within(atencion).getByRole('link', { name: /3 faltan hace 3 semanas o más/ })).toHaveAttribute('href', '/grupos-vida/g-1/salud')
    expect(within(atencion).getByText('Pedro Linárez, Jesús Escalona y Rafael Mujica')).toBeInTheDocument()
    // Birthdays have their own section now (S12), never repeated here.
    expect(within(atencion).queryByText(/Cumpleaños/)).not.toBeInTheDocument()
  })

  it('06 director de área: sus voluntarios sin Próximo Paso y «Lo hizo» marca con la acción', async () => {
    marcarProximoPasoVoluntario.mockResolvedValue({ ok: true, hecho: true })
    pintar(hechos({ serviciosActivos: [{ servicioId: 's-1', equipoId: 'eq-1', nivel: 'director' }], pendientes: { ...HECHOS_VACIOS.pendientes, marcarProximoPaso: 3 } }), [AREA])

    const responder = region('Para responder')
    expect(within(responder).getByRole('link', { name: /Marcar Próximo Paso/ })).toHaveAttribute('href', '#proximo-paso-voluntarios')

    const area = region('Mi equipo · Dirección de Niños')
    const metricas = within(area).getByRole('group', { name: 'Métricas de Dirección de Niños' })
    expect(metrica(metricas, 'Activos')).toHaveTextContent('52')
    expect(metrica(metricas, 'Postulados')).toHaveTextContent('4')
    expect(metrica(metricas, 'En orientación')).toHaveTextContent('1')
    expect(metrica(metricas, 'Sin turno')).toHaveTextContent('3')

    const lista = within(area).getByRole('list', { name: 'Próximo Paso de tus voluntarios' })
    expect(lista.closest('[id]')).toHaveAttribute('id', 'proximo-paso-voluntarios')
    expect(within(area).getByText((_, el) => el?.textContent === '3 sin marcar')).toBeInTheDocument()
    expect(within(lista).getByText('Postulado · Waumba Land')).toBeInTheDocument()
    expect(within(lista).getByText('En orientación · Recepción de Niños')).toBeInTheDocument()

    const boton = within(lista).getByRole('button', { name: 'Andrea Colmenares hizo Próximo Paso' })
    expect(boton).toHaveAttribute('aria-pressed', 'false')
    await act(async () => {
      fireEvent.click(boton)
    })

    expect(marcarProximoPasoVoluntario).toHaveBeenCalledWith('u-a', true)
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(boton).toHaveTextContent('Lo hizo')
    expect(within(area).getByText((_, el) => el?.textContent === '2 sin marcar')).toBeInTheDocument()
    expect(within(area).getByRole('status')).toHaveTextContent('Marcado: Andrea Colmenares hizo Próximo Paso.')
  })

  it('06 director de área: si la marca falla vuelve atrás y avisa', async () => {
    marcarProximoPasoVoluntario.mockResolvedValue({ ok: false, message: 'No tienes permiso para marcar Próximo Paso de esta persona.' })
    pintar(hechos({ serviciosActivos: [{ servicioId: 's-1', equipoId: 'eq-1', nivel: 'director' }] }), [AREA])

    const boton = screen.getByRole('button', { name: 'Jesús Pacheco hizo Próximo Paso' })
    await act(async () => {
      fireEvent.click(boton)
    })

    expect(boton).toHaveAttribute('aria-pressed', 'false')
    expect(notificarError).toHaveBeenCalledWith('No tienes permiso para marcar Próximo Paso de esta persona.')
    expect(screen.getByRole('status')).toHaveTextContent('No tienes permiso para marcar Próximo Paso de esta persona.')
  })

  it('06 director de área: sin voluntarios por marcar no muestra la lista', () => {
    pintar(hechos({ serviciosActivos: [{ servicioId: 's-1', equipoId: 'eq-1', nivel: 'director' }] }), [{ ...AREA, sinProximoPaso: [] }])

    expect(region('Mi equipo · Dirección de Niños')).toBeInTheDocument()
    expect(screen.queryByText('Próximo Paso de tus voluntarios')).not.toBeInTheDocument()
  })

  it('09 directora de etapa: su etapa, sus métricas y los grupos que necesitan atención', () => {
    pintar(hechos({ etapasDirigidas: ['sl-1'], pendientes: { ...HECHOS_VACIOS.pendientes, lideresSinReporte: 1 } }), [ETAPA])

    expect(within(region('Para responder')).getByRole('link', { name: /Líderes sin reporte/ })).toHaveAttribute('href', '/grupos-vida/reportes/asistencia-semanal')
    const etapa = region('Mi etapa · Mujeres +36')
    expect(within(etapa).getByText((_, el) => el?.tagName === 'P' && el.textContent === '3 grupos · 212 personas')).toBeInTheDocument()
    expect(within(etapa).getByRole('link', { name: 'Abrir tablero de la etapa' })).toHaveAttribute('href', '/grupos-vida/dashboard-riesgo')
    expect(within(etapa).getByRole('link', { name: 'Reportes' })).toHaveAttribute('href', '/grupos-vida/reportes/asistencia-semanal')

    const metricas = within(etapa).getByRole('group', { name: 'Métricas de Mujeres +36' })
    expect(metrica(metricas, 'Grupos')).toHaveTextContent('3')
    expect(metrica(metricas, 'Asistencia')).toHaveTextContent('61%')
    expect(metrica(metricas, 'En riesgo')).toHaveTextContent('1')
    expect(metrica(metricas, 'Sin reporte')).toHaveTextContent('1')

    const filas = within(within(etapa).getByRole('list', { name: 'Grupos que necesitan atención' })).getAllByRole('listitem')
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringContaining('Mujeres +36 · El Ujano'),
      expect.stringContaining('Mujeres +36 · Santa Rosa'),
    ])
    expect(filas[0]).toHaveTextContent('En riesgo')
    expect(filas[0]).toHaveTextContent('Líder: Yelitza Rodríguez')
    expect(filas[1]).toHaveTextContent('Sin reporte')
    expect(within(filas[0]).getByRole('link')).toHaveAttribute('href', '/grupos-vida/g-ri')
  })

  it('10 director general: su segmento con sus etapas, sin la visión del campus', () => {
    const { container } = pintar(hechos({ segmentosDirigidos: ['seg-1'] }), [SEGMENTO], VISION)

    expect(screen.queryByRole('heading', { name: 'Visión general' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Métricas del campus' })).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/2\.340/)

    const segmento = region('Mi segmento · Matrimonios')
    expect(within(segmento).getByText((_, el) => el?.tagName === 'P' && el.textContent === '3 etapas · 39 grupos · 380 personas')).toBeInTheDocument()
    expect(within(segmento).getByRole('link', { name: 'Abrir tablero del segmento' })).toBeInTheDocument()
    const metricas = within(segmento).getByRole('group', { name: 'Métricas de Matrimonios' })
    expect(metrica(metricas, 'Asistencia')).toHaveTextContent('77%')
    expect(metrica(metricas, 'Sin reporte')).toHaveTextContent('3')

    const etapas = within(within(segmento).getByRole('list', { name: 'Etapas' })).getAllByRole('listitem')
    expect(etapas).toHaveLength(3)
    expect(etapas[0]).toHaveTextContent('Andrés Rivas y Paola Rivas')
    expect(etapas[0]).toHaveTextContent('14 grupos')
    expect(etapas[0]).toHaveTextContent('3 sin reporte')
    expect(etapas[0]).toHaveTextContent('81%')
    expect(etapas[1]).toHaveTextContent('2 en riesgo')
    expect(etapas[2]).toHaveTextContent('Al día')
  })

  it('un cargo que no cargó se oculta y los demás siguen', () => {
    pintar(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Líder' }], etapasDirigidas: ['sl-1'] }), [null, ETAPA])

    expect(screen.queryByRole('region', { name: 'Grupo que lidero' })).not.toBeInTheDocument()
    expect(region('Mi etapa · Mujeres +36')).toBeInTheDocument()
  })

  it('si ningún cargo cargó no muestra la sección', () => {
    pintar(hechos({ etapasDirigidas: ['sl-1'] }), [null])

    expect(screen.queryByRole('region', { name: /Mi etapa/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Explorar' })).toBeInTheDocument()
  })
})

describe('Visión general', () => {
  it('07 pastor: 4 métricas del campus, la tendencia de 8 semanas y lo que requiere atención', () => {
    pintar(hechos({ esAdminOPastor: true }), [], VISION)

    const vision = region('Visión general')
    const metricas = within(vision).getByRole('group', { name: 'Métricas del campus' })
    expect(metrica(metricas, 'Personas')).toHaveTextContent('2.340')
    expect(metrica(metricas, 'Nuevos')).toHaveTextContent('64')
    expect(metrica(metricas, 'Grupos')).toHaveTextContent('128')
    expect(metrica(metricas, 'Dream Team')).toHaveTextContent('412')
    expect(within(vision).getByRole('img', { name: 'Asistencia de 74% a 78% en 8 semanas' })).toBeInTheDocument()

    const atencion = within(within(vision).getByRole('list', { name: 'Requiere atención' })).getAllByRole('listitem')
    expect(atencion.map((f) => f.textContent)).toEqual([
      expect.stringContaining('2 grupos con asistencia baja'),
      expect.stringContaining('4 grupos sin casa anfitriona'),
      expect.stringContaining('23 servidores postulados'),
    ])
    expect(atencion[0]).toHaveTextContent('Jóvenes · Patarata y Matrimonios · Centro')
  })

  it('sin datos del campus no muestra la sección', () => {
    pintar(hechos({ esAdminOPastor: true }), [], undefined)

    expect(screen.queryByRole('heading', { name: 'Visión general' })).not.toBeInTheDocument()
  })
})
