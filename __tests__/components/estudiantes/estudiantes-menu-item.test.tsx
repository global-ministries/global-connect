/**
 * The "Estudiantes" menu section (C4b of odd/tasks/estudiantes-fase-b.md),
 * built like Niños from the server-fed facts of hooks/useEstudiantesAcceso.
 */
import React, { type ReactNode } from 'react'
import { renderHook } from '@testing-library/react'

import {
  buildEstudiantesMenuItem,
  getEstudiantesNavItems,
  insertEstudiantesMenuItem,
  useEstudiantesMenuItem,
} from '@/components/estudiantes/estudiantes-menu-item'
import { EstudiantesAccesoProvider, useEstudiantesAcceso } from '@/hooks/useEstudiantesAcceso'
import { SIN_ACCESO_ESTUDIANTES } from '@/lib/platform/estudiantes/acceso'

describe('buildEstudiantesMenuItem', () => {
  it('is null when the user sees no entry', () => {
    expect(buildEstudiantesMenuItem(getEstudiantesNavItems(SIN_ACCESO_ESTUDIANTES))).toBeNull()
  })

  it('opens on its first entry and carries an icon per entry', () => {
    const item = buildEstudiantesMenuItem(getEstudiantesNavItems({ grupos: 0, lidera: false, vivo: true, gestiona: true }))
    expect(item).toMatchObject({ id: 'estudiantes', label: 'Estudiantes', href: '/estudiantes/vivo' })
    expect(item?.children.map((hija) => hija.id)).toEqual(['estudiantes-vivo', 'estudiantes-grupos'])
    expect(item?.icon).toBeDefined()
    expect(item?.children.every((hija) => hija.icon !== undefined)).toBe(true)
  })
})

describe('the Voluntarios entry (C5)', () => {
  it('has its own icon and comes last', () => {
    const item = buildEstudiantesMenuItem(getEstudiantesNavItems({ grupos: 0, lidera: false, vivo: true, gestiona: false, voluntarios: true }))
    expect(item?.children.map((hija) => [hija.id, hija.href])).toEqual([
      ['estudiantes-vivo', '/estudiantes/vivo'],
      ['estudiantes-voluntarios', '/estudiantes/voluntarios'],
    ])
    expect(item?.children[1].icon).toBeDefined()
  })
})

describe('insertEstudiantesMenuItem', () => {
  const item = { id: 'estudiantes' }
  const ids = (lista: readonly { id: string }[]) => lista.map((x) => x.id)

  it('goes right after Niños, else Dream Team, else Grupos de Vida, else last', () => {
    expect(ids(insertEstudiantesMenuItem([{ id: 'grupos-vida' }, { id: 'dream-team' }, { id: 'ninos' }, { id: 'x' }], item))).toEqual([
      'grupos-vida', 'dream-team', 'ninos', 'estudiantes', 'x',
    ])
    expect(ids(insertEstudiantesMenuItem([{ id: 'grupos-vida' }, { id: 'dream-team' }, { id: 'x' }], item))).toEqual(['grupos-vida', 'dream-team', 'estudiantes', 'x'])
    expect(ids(insertEstudiantesMenuItem([{ id: 'grupos-vida' }, { id: 'x' }], item))).toEqual(['grupos-vida', 'estudiantes', 'x'])
    expect(ids(insertEstudiantesMenuItem([{ id: 'x' }], item))).toEqual(['x', 'estudiantes'])
    expect(ids(insertEstudiantesMenuItem([{ id: 'x' }], null))).toEqual(['x'])
  })
})

describe('useEstudiantesAcceso / useEstudiantesMenuItem', () => {
  it('has no access outside the provider', () => {
    expect(renderHook(() => useEstudiantesAcceso()).result.current).toEqual(SIN_ACCESO_ESTUDIANTES)
    expect(renderHook(() => useEstudiantesMenuItem()).result.current).toBeNull()
  })

  it('builds the section from the provided facts', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EstudiantesAccesoProvider acceso={{ grupos: 1, lidera: true, vivo: false, gestiona: false }}>{children}</EstudiantesAccesoProvider>
    )
    const { result } = renderHook(() => useEstudiantesMenuItem(), { wrapper })
    expect(result.current?.children.map((hija) => [hija.label, hija.href])).toEqual([['Mi grupo', '/estudiantes']])
  })
})
