import { render, screen, within } from '@testing-library/react'

import { PantallaInicio } from '@/components/inicio/pantalla-inicio'
import type { DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import { decidirSecciones } from '@/lib/inicio/decidir-secciones'
import { HECHOS_VACIOS, type HechosInicio } from '@/lib/inicio/hechos'

// Profiles of design/home-por-rol (01 nuevo, 02 asiste, 04 servidor, 08 colíder): the
// sections come from decidirSecciones, as on the page.
const hechos = (h: Partial<HechosInicio>): HechosInicio => ({ ...HECHOS_VACIOS, usuarioId: 'u-1', ...h })

const NUEVO = hechos({ perfilCompleto: false, hizoProximoPaso: false })
const ASISTE = hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios · Zona Este', rol: 'Miembro' }], hizoProximoPaso: false })
const SERVIDOR = hechos({
  grupos: [{ grupoId: 'g-1', nombre: 'Jóvenes profesionales · Centro', rol: 'Miembro' }],
  serviciosActivos: [{ servicioId: 's-1', equipoId: 'eq-1', nivel: 'servidor' }],
})
const COLIDER = hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36 · Cabudare Este', rol: 'Colíder' }], hizoProximoPaso: true })

const GRUPO: DatosGrupoMiembro = {
  grupoId: 'g-1',
  nombre: 'Matrimonios · Zona Este',
  lideres: ['Luis Torres', 'Andreína Torres'],
  proximaReunion: { fecha: '2026-11-12', hora: '19:30' },
  lugar: 'Casa de los Hernández · Urb. El Pedregal',
  comoLlegar: 'https://www.google.com/maps/search/?api=1&query=10.07%2C-69.28',
  escribirLider: 'https://wa.me/584145557346',
  asistencia: { fui: 6, de: 8 },
}

function pintar(h: HechosInicio, nombre = 'Daniela Rojas') {
  return render(<PantallaInicio nombre={nombre} hoy="2026-11-09" secciones={decidirSecciones(h)} gruposMiembro={{ 'g-1': GRUPO }} />)
}

const titulosSecciones = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('PantallaInicio', () => {
  it('saluda con la fecha y el nombre', () => {
    pintar(NUEVO)

    expect(screen.getAllByRole('heading', { level: 1, name: 'Hola, Daniela' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Lunes 9 de noviembre').length).toBeGreaterThan(0)
  })

  it('01 nuevo: Próximo Paso destacado primero y sin nombrar Dream Team', () => {
    const { container } = pintar(NUEVO)

    expect(titulosSecciones()).toEqual(['Tus próximos pasos', 'Explorar'])
    const destacado = screen.getByRole('article', { name: 'Próximo Paso' })
    expect(within(destacado).getByText('Tu siguiente paso')).toBeInTheDocument()
    expect(
      within(destacado).getByText('Conoce la visión de Global, cómo funciona la iglesia y dónde puedes crecer. Es el primer paso para todo lo demás.'),
    ).toBeInTheDocument()
    expect(within(destacado).getByRole('link', { name: 'Inscribirme' })).toHaveAttribute('href', '/talleres/explorar')
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '0 de 3 pasos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Completar/ })).toHaveAttribute('href', '/perfil')
    expect(container.textContent).not.toMatch(/Dream Team/)
  })

  it('02 asiste: su grupo, Próximo Paso destacado y sin Dream Team', () => {
    const { container } = pintar(ASISTE, 'Carlos Mendoza')

    expect(titulosSecciones()).toEqual(['Mi grupo de vida', 'Tus próximos pasos', 'Explorar'])
    const grupo = screen.getByRole('region', { name: 'Mi grupo de vida' })
    expect(within(grupo).getByRole('heading', { level: 3, name: 'Matrimonios · Zona Este' })).toBeInTheDocument()
    expect(within(grupo).getByText('Líderes: Luis Torres y Andreína Torres')).toBeInTheDocument()
    expect(within(grupo).getByText(/Jueves 12 nov/)).toBeInTheDocument()
    expect(within(grupo).getByText('Casa de los Hernández · Urb. El Pedregal')).toBeInTheDocument()
    expect(within(grupo).getByText(/Fuiste a/)).toHaveTextContent('Fuiste a 6 de las últimas 8 reuniones')
    expect(within(grupo).getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', GRUPO.comoLlegar)
    expect(within(grupo).getByRole('link', { name: 'Escribir al líder' })).toHaveAttribute('href', GRUPO.escribirLider)
    expect(screen.getByRole('article', { name: 'Próximo Paso' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Dream Team/)
  })

  it('04 servidor: reserva Mis servicios antes de su grupo, sin nada visible', () => {
    pintar(SERVIDOR, 'Valentina Duarte')

    expect(titulosSecciones()).toEqual(['Mi grupo de vida', 'Explorar'])
    const ranura = document.getElementById('mis-servicios')
    expect(ranura).not.toBeNull()
    expect(ranura).toBeEmptyDOMElement()
    const grupo = screen.getByRole('region', { name: 'Mi grupo de vida' })
    expect(ranura!.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Explorar' })).getByText('Dream Team')).toBeInTheDocument()
  })

  it('08 colíder: su grupo en solo lectura, sin acciones de edición', () => {
    const { container } = pintar(COLIDER, 'Ramón Pérez')

    // Hizo Próximo Paso and has nothing pending: without «Servir en Dream Team» (S13) the steps go away.
    expect(titulosSecciones()).toEqual(['Mi grupo de vida', 'Explorar'])
    const grupo = screen.getByRole('region', { name: 'Mi grupo de vida' })
    expect(within(grupo).getByText('Colíder · solo lectura')).toBeInTheDocument()
    expect(within(grupo).getByRole('link', { name: 'Ver asistencia y miembros' })).toHaveAttribute('href', '/grupos-vida/g-1')
    expect(within(grupo).queryByRole('button')).not.toBeInTheDocument()
    expect(within(grupo).queryByText(/editar|pasar asistencia/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Próximo Paso' })).not.toBeInTheDocument()
    // Without a servicio Dream Team is not named anywhere (S13).
    expect(container.textContent).not.toMatch(/Dream Team/)
  })

  it('para responder enlaza cada cola con su cantidad', () => {
    render(
      <PantallaInicio
        nombre="Ricardo Colmenárez"
        hoy="2026-11-09"
        secciones={decidirSecciones(hechos({ esAdminOPastor: true, pendientes: { ...HECHOS_VACIOS.pendientes, solicitudesGrupo: 5, casasPorRevisar: 3 } }))}
        visionGeneral={{ personas: 2340, nuevos: 64, grupos: 128, asistencia: 78, dreamTeam: null, tendencia: [], gruposEnRiesgo: [], gruposSinCasa: 0, postulados: null }}
      />,
    )

    expect(titulosSecciones()).toEqual(['Para responder', 'Visión general', 'Explorar'])
    const pendientes = screen.getByRole('region', { name: 'Para responder' })
    expect(within(pendientes).getByRole('link', { name: /Solicitudes de grupo/ })).toHaveAttribute('href', '/grupos-vida/solicitudes')
    expect(within(pendientes).getByRole('link', { name: /Casas anfitrionas por revisar/ })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/revision')
    expect(screen.getAllByText(/cosas por responder/)[0]).toHaveTextContent('Tienes 8 cosas por responder.')
    expect(screen.getByRole('group', { name: 'Métricas del campus' })).toBeInTheDocument()
  })

  it('una sección sin contenido no se muestra', () => {
    render(<PantallaInicio nombre="Ana" hoy="2026-11-09" secciones={[{ id: 'mis-hijos', cantidad: 1 }, { id: 'explorar', tiles: ['talleres'] }]} />)

    expect(titulosSecciones()).toEqual(['Explorar'])
  })
})
