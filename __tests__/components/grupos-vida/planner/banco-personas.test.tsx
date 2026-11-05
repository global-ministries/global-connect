/**
 * `<BancoPersonas>` — the people bank of the planner (S11; artboard 01).
 *
 * Everyone of the church: the header "N sin ubicar · X de <origen> y Y
 * nuevos" with the church total; couples as one row with both names and ages;
 * the sections "De <origen>, sin ubicar" and "Nuevos, sin segmento" under the
 * default "Sin ubicar" filter, the rest when it is off; the quick filters,
 * the Edad and Ciudad selects, the search, the row marks, and 100 rows at a
 * time.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BancoPersonas } from '@/components/grupos-vida/planner/banco-personas'
import { IRIBARREN, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { PersonaBanco, TemporadaPlanner } from '@/lib/platform/grupos-vida/planner'

const TEMPORADA: TemporadaPlanner = {
  id: 't-2026-ii',
  nombre: '2026-II',
  fecha_inicio: '2026-10-12',
  fecha_fin: null,
  estado: 'planificacion',
  activa: false,
  cohorte: 'II',
  origen_id: 't-2025-ii',
  origen_nombre: '2025 - II',
}

const sinGrupo = { grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 }
const deOrigen = (grupo: string) => ({ ...sinGrupo, origen_grupo_id: `og-${grupo}`, origen_grupo_nombre: grupo, segmento_sugerido_id: 'seg-mat', segmento_sugerido_nombre: 'Matrimonios' })

const CARLOS = persona({ usuario_id: 'c1', nombre: 'Carlos', apellido: 'Mendoza', edad: 52, conyuge_id: 'c2', municipio_id: IRIBARREN, ...deOrigen('Cabudare Matrimonios 2') })
const YELITZA = persona({ usuario_id: 'c2', nombre: 'Yelitza', apellido: 'de Mendoza', edad: 48, conyuge_id: 'c1', municipio_id: IRIBARREN, ...deOrigen('Cabudare Matrimonios 2') })
const YANETH = persona({
  usuario_id: 'y1',
  nombre: 'Yaneth',
  apellido: 'Rodríguez',
  edad: 39,
  ...deOrigen('Mujeres de Fe'),
  segmento_sugerido_id: 'seg-muj',
  segmento_sugerido_nombre: 'Mujeres +36',
  otras_temporadas: [{ temporada_id: 't-2026-i', temporada_nombre: '2026-I', grupo_id: 'gx', grupo_nombre: 'Mujeres de Fe' }],
})
const ANA = persona({ usuario_id: 'n1', nombre: 'Ana Lucía', apellido: 'Méndez', edad: 41, municipio_id: null, fecha_registro: '2026-10-28T15:00:00Z', ...sinGrupo })
const UBICADO = persona({ usuario_id: 'u1', nombre: 'Rafael', apellido: 'Escalona', edad: 60, grupo_actual_nombre: 'Grupo #14 Los Escalona', segmento_sugerido_id: 'seg-mat', segmento_sugerido_nombre: 'Matrimonios' })

const BANCO: PersonaBanco[] = [CARLOS, ANA, UBICADO, YANETH, YELITZA]

const renderBanco = (banco: readonly PersonaBanco[] = BANCO) => render(<BancoPersonas id="banco" banco={banco} temporada={TEMPORADA} />)
const seccion = (nombre: string | RegExp) => screen.getByRole('region', { name: nombre })
const filas = (region: HTMLElement) => within(region).getAllByRole('listitem')

describe('BancoPersonas', () => {
  it('counts the unplaced people of the origin season and the new ones, and the whole church', () => {
    renderBanco()

    const banco = screen.getByRole('complementary', { name: 'Banco de personas' })
    expect(banco).toHaveTextContent('4 sin ubicar · 3 de 2025 - II y 1 nuevo')
    expect(banco).toHaveTextContent('Toda la iglesia, de cualquier segmento · 5')
  })

  it('shows a couple as one row with both names and ages, and groups the rows by section', () => {
    renderBanco()

    const origen = seccion('De 2025 - II, sin ubicar')
    expect(filas(origen)).toHaveLength(2)
    expect(filas(origen)[0]).toHaveTextContent('Carlos Mendoza52 y Yelitza de Mendoza48')
    expect(filas(origen)[0]).toHaveTextContent('Matrimonios · 2025 - II: Cabudare Matrimonios 2')
    expect(within(filas(origen)[0]).getByRole('button', { name: 'Ubicar a Carlos Mendoza y Yelitza de Mendoza' })).toBeDisabled()
    expect(filas(origen)[1]).toHaveTextContent('Yaneth Rodríguez')
    expect(within(filas(origen)[1]).getByText('Activo en 2026-I')).toBeInTheDocument()

    const nuevos = seccion('Nuevos, sin segmento')
    expect(filas(nuevos)).toHaveLength(1)
    expect(within(nuevos).getByText('Nuevo · sin segmento')).toBeInTheDocument()
    expect(within(nuevos).getByText('Sin dirección')).toBeInTheDocument()
    expect(filas(nuevos)[0]).toHaveTextContent(/Se registró el 28 oct/)

    expect(screen.queryByText('Rafael Escalona')).not.toBeInTheDocument()
  })

  it('shows everyone else when "Sin ubicar" is off', async () => {
    renderBanco()

    const sinUbicar = screen.getByRole('button', { name: 'Sin ubicar 4' })
    expect(sinUbicar).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(sinUbicar)

    expect(sinUbicar).toHaveAttribute('aria-pressed', 'false')
    expect(seccion('En un grupo de 2026-II')).toHaveTextContent('Rafael Escalona')
    expect(seccion('En un grupo de 2026-II')).toHaveTextContent('En Grupo #14 Los Escalona')
  })

  it('keeps only the couples with "Matrimonios" and only the people without segment with "Sin segmento"', async () => {
    renderBanco()

    await userEvent.click(screen.getByRole('button', { name: 'Matrimonios 1' }))
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(filas(seccion('De 2025 - II, sin ubicar'))).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Matrimonios 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sin segmento 1' }))
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(seccion('Nuevos, sin segmento')).toHaveTextContent('Ana Lucía Méndez')
  })

  it('filters by age, city and search', async () => {
    renderBanco()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Edad' }), '51+')
    expect(filas(seccion('De 2025 - II, sin ubicar'))).toHaveLength(1)
    expect(screen.queryByText('Yaneth Rodríguez')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Edad' }), '')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ciudad donde vive' }), 'sin-direccion')
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(seccion('Nuevos, sin segmento')).toHaveTextContent('Ana Lucía Méndez')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ciudad donde vive' }), '')
    await userEvent.type(screen.getByRole('searchbox', { name: /Buscar en el banco/ }), 'mujeres de fe')
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(seccion('De 2025 - II, sin ubicar')).toHaveTextContent('Yaneth Rodríguez')

    await userEvent.clear(screen.getByRole('searchbox', { name: /Buscar en el banco/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: /Buscar en el banco/ }), 'zzz')
    expect(screen.getByText('Nadie coincide con estos filtros. Quita alguno.')).toBeInTheDocument()
  })

  it('shows 100 rows at a time', async () => {
    const muchos = Array.from({ length: 250 }, (_, i) => persona({ usuario_id: `p${i}`, nombre: `Persona ${i}`, ...sinGrupo }))
    renderBanco(muchos)

    expect(filas(seccion('Nuevos, sin segmento'))).toHaveLength(100)
    await userEvent.click(screen.getByRole('button', { name: 'Ver 100 más · quedan 150' }))
    expect(filas(seccion('Nuevos, sin segmento'))).toHaveLength(200)
    await userEvent.click(screen.getByRole('button', { name: 'Ver 50 más · quedan 50' }))
    expect(filas(seccion('Nuevos, sin segmento'))).toHaveLength(250)
    expect(screen.queryByRole('button', { name: /^Ver \d+ más/ })).not.toBeInTheDocument()
  })
})
