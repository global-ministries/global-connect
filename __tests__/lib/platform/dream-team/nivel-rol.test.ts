/**
 * Rol level classifier (odd/tasks/uno-a-uno.md, T1): the authority level a rol
 * label maps to. It must agree with the label sets of nivel-rol.ts, because the
 * migration backfills the existing roles with the same classification.
 */
import fs from 'fs'
import path from 'path'

import {
  DIRECTOR_ROLE_LABELS,
  LEAD_ROLE_LABELS,
  NIVELES_ROL,
  esNivelRol,
  nivelDesdeLabel,
  nivelRolLabel,
} from '@/lib/platform/dream-team/nivel-rol'

const MIGRATION = path.join(process.cwd(), 'supabase/migrations/20261015100000_dream_team_nivel_rol.sql')

describe('nivelDesdeLabel', () => {
  it.each([
    ['director', 'director'],
    ['coordinador', 'coordinador'],
    ['entrenador', 'lider'],
    ['facilitador', 'lider'],
    ['lider', 'lider'],
    ['voluntario', 'voluntario'],
  ] as const)('classifies the production label %s as %s', (label, nivel) => {
    expect(nivelDesdeLabel(label)).toBe(nivel)
  })

  it('also classifies "Líder de grupo" as lider', () => {
    expect(nivelDesdeLabel('Líder de grupo')).toBe('lider')
  })

  it('ignores case, accents and surrounding spaces', () => {
    expect(nivelDesdeLabel('  DIRECTOR ')).toBe('director')
    expect(nivelDesdeLabel('Coordinador')).toBe('coordinador')
    expect(nivelDesdeLabel('Líder')).toBe('lider')
    expect(nivelDesdeLabel('LÍDER DE GRUPO')).toBe('lider')
  })

  it('leaves an unknown label at the lowest level', () => {
    expect(nivelDesdeLabel('Operador de cámara')).toBe('voluntario')
    expect(nivelDesdeLabel('Voluntario de Cámara')).toBe('voluntario')
    expect(nivelDesdeLabel('')).toBe('voluntario')
  })
})

describe('NIVELES_ROL', () => {
  it('lists the four levels highest first with their Spanish names', () => {
    expect(NIVELES_ROL).toEqual([
      { nivel: 'director', label: 'Director' },
      { nivel: 'coordinador', label: 'Coordinador' },
      { nivel: 'lider', label: 'Líder' },
      { nivel: 'voluntario', label: 'Voluntario' },
    ])
  })

  it('names each level', () => {
    expect(nivelRolLabel('lider')).toBe('Líder')
    expect(nivelRolLabel('voluntario')).toBe('Voluntario')
  })
})

describe('esNivelRol', () => {
  it('accepts only the four levels', () => {
    for (const { nivel } of NIVELES_ROL) expect(esNivelRol(nivel)).toBe(true)
    expect(esNivelRol('pastor')).toBe(false)
    expect(esNivelRol('Director')).toBe(false)
    expect(esNivelRol(undefined)).toBe(false)
    expect(esNivelRol(1)).toBe(false)
  })
})

describe('dream_team_nivel_desde_label in 20261015100000_dream_team_nivel_rol.sql', () => {
  // The body of the SQL function the backfill and the insert trigger both use.
  const cuerpo = /create or replace function public\.dream_team_nivel_desde_label\(p_label text\)[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(
    fs.readFileSync(MIGRATION, 'utf-8'),
  )?.[1] ?? ''
  // Every `when '<label>' then '<nivel>'` arm of its CASE.
  const arms = [...cuerpo.matchAll(/when '([^']+)' then '([^']+)'/g)].map(([, label, nivel]) => [label, nivel] as const)

  it('leaves any other label at voluntario, like nivelDesdeLabel', () => {
    expect(cuerpo).toMatch(/else 'voluntario'/)
  })

  it('maps each label exactly as nivelDesdeLabel does', () => {
    expect(arms.length).toBeGreaterThan(0)
    for (const [label, nivel] of arms) expect([label, nivelDesdeLabel(label)]).toEqual([label, nivel])
  })

  it('names every director and lead label of nivel-rol.ts', () => {
    const labels = arms.map(([label]) => label)
    for (const label of [...DIRECTOR_ROLE_LABELS, ...LEAD_ROLE_LABELS]) expect(labels).toContain(label)
  })
})
