/**
 * The dashboard data the home still reads (app/(auth)/dashboard/tablero.tsx;
 * odd/tasks/home-por-rol.md T4): obtener_datos_dashboard narrowed by the
 * campus cookie, «Visión general» for admin and pastor from its widgets, and
 * the «Contextos visibles» behind the platform flag. Ported from
 * tablero-anterior.test.tsx: the campus cookie and the contexts keep
 * working; the host-home queues are «Para responder» items now
 * (cargar-hechos).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

import type { PlatformSession } from '@/lib/platform/session/types'

const obtenerDatosDashboard = jest.fn()
const mockCampusCookie: { value: string | undefined } = { value: undefined }

jest.mock('@/lib/dashboard/obtenerDatosDashboard', () => ({ obtenerDatosDashboard: (...args: unknown[]) => obtenerDatosDashboard(...args) }))
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'gc_campus_activo' && mockCampusCookie.value !== undefined ? { name, value: mockCampusCookie.value } : undefined),
  }),
}))

import { cargarTablero, cargarVisionGeneral } from '@/app/(auth)/dashboard/tablero'

const originalEnabled = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
const originalKillSwitch = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

// dream_team_servicios: a head count for postulados, the persona_id rows (paged) for activos.
type Conteo = number | Error | Array<{ persona_id: string }>
function cliente(conteos: Record<string, Conteo>) {
  return {
    from: jest.fn(() => {
      let estado = ''
      let cabeza = false
      let desde = 0
      const q: Record<string, unknown> = {
        select: jest.fn((_columnas: string, opciones?: { head?: boolean }) => {
          cabeza = opciones?.head === true
          return q
        }),
        eq: jest.fn((columna: string, valor: string) => {
          if (columna === 'estado') estado = valor
          return q
        }),
        order: jest.fn(() => q),
        range: jest.fn((a: number) => {
          desde = a
          return q
        }),
        then: (ok: (r: unknown) => unknown, mal: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => {
              const c = conteos[estado]
              if (c instanceof Error) return { data: null, count: null, error: { message: c.message } }
              if (cabeza) return { count: typeof c === 'number' ? c : 0, error: null }
              return { data: Array.isArray(c) ? c.slice(desde, desde + 1000) : [], error: null }
            })
            .then(ok, mal),
      }
      return q
    }),
  }
}

const personas = (n: number, repetidas = 0) => [
  ...Array.from({ length: n }, (_, i) => ({ persona_id: `p-${i}` })),
  ...Array.from({ length: repetidas }, (_, i) => ({ persona_id: `p-${i % n}` })),
]

const WIDGETS_ADMIN = {
  kpis_globales: {
    total_miembros: { valor: 2340 },
    nuevos_miembros_mes: { valor: 64 },
    grupos_activos: { valor: 128 },
    asistencia_semanal: { valor: 77.6 },
  },
  tendencia_asistencia: [70, 71, 72, 73, 74, 76, 73, 77, 80, 78].map((p, i) => ({ semana_inicio: `2026-09-${10 + i}`, porcentaje: p })),
  grupos_en_riesgo: [{ id: 'g-1', nombre: 'Jóvenes · Patarata', porcentaje_asistencia: 38 }],
}

describe('cargarTablero', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCampusCookie.value = undefined
  })

  afterEach(() => {
    jest.restoreAllMocks()
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED', originalEnabled)
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH', originalKillSwitch)
  })

  it('usa el campus de la cookie solo si es un uuid', async () => {
    const campusId = '3f6c2a1e-8b7d-4c2e-9a1b-5d4e3f2a1b0c'
    mockCampusCookie.value = campusId
    obtenerDatosDashboard.mockResolvedValue({ rol: 'admin', widgets: {}, platformSession: null, campusId })

    await expect(cargarTablero()).resolves.toMatchObject({ rol: 'admin', campusId })
    expect(obtenerDatosDashboard).toHaveBeenCalledWith(campusId)

    mockCampusCookie.value = 'barquisimeto'
    await cargarTablero()
    expect(obtenerDatosDashboard).toHaveBeenLastCalledWith(null)
  })

  it('si el tablero falla devuelve null y lo registra', async () => {
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    obtenerDatosDashboard.mockRejectedValue(new Error('rpc caída'))

    await expect(cargarTablero()).resolves.toBeNull()
    expect(consola).toHaveBeenCalled()
  })

  it('muestra los contextos visibles detrás de la bandera de plataforma', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
    const platformSession: PlatformSession = {
      personaId: 'persona-1',
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [{ experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' }],
      capabilities: [{ key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' }],
    }
    obtenerDatosDashboard.mockResolvedValue({ rol: 'lider', widgets: {}, platformSession })

    const tablero = await cargarTablero()
    render(<>{tablero?.contextos}</>)

    expect(screen.getByRole('heading', { name: 'Contextos visibles' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir Grupos de Vida — Adultos' })).toHaveAttribute('href', '/grupos-vida')
  })

  it('sin la bandera no hay contextos', async () => {
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
    obtenerDatosDashboard.mockResolvedValue({ rol: 'lider', widgets: {}, platformSession: null })

    await expect(cargarTablero()).resolves.toMatchObject({ contextos: null })
  })
})

describe('cargarVisionGeneral', () => {
  it('admin o pastor: los números del campus, las últimas 8 semanas y Dream Team', async () => {
    const supabase = cliente({ activo: personas(412), postulado: 23 })

    const datos = await cargarVisionGeneral(supabase as never, { rol: 'pastor', widgets: WIDGETS_ADMIN }, 4)

    expect(datos).toEqual({
      personas: 2340,
      nuevos: 64,
      grupos: 128,
      asistencia: 78,
      dreamTeam: 412,
      tendencia: [72, 73, 74, 76, 73, 77, 80, 78],
      gruposEnRiesgo: [{ grupoId: 'g-1', nombre: 'Jóvenes · Patarata', asistencia: 38 }],
      gruposSinCasa: 4,
      postulados: 23,
    })
  })

  // S16 (1): «Servidores activos» are people; one person serving in two areas counts once.
  it('Dream Team cuenta personas distintas con un servicio activo, no servicios', async () => {
    const supabase = cliente({ activo: personas(1500, 700), postulado: 0 })

    const datos = await cargarVisionGeneral(supabase as never, { rol: 'admin', widgets: WIDGETS_ADMIN }, 0)

    expect(datos?.dreamTeam).toBe(1500)
  })

  it('un conteo de Dream Team que falla queda sin dato', async () => {
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const datos = await cargarVisionGeneral(cliente({ activo: new Error('permission denied'), postulado: 2 }) as never, { rol: 'admin', widgets: WIDGETS_ADMIN }, 0)

    expect(datos).toMatchObject({ dreamTeam: null, postulados: 2, personas: 2340 })
    consola.mockRestore()
  })

  it('el director general no recibe la visión del campus', async () => {
    await expect(cargarVisionGeneral(cliente({}) as never, { rol: 'director-general', widgets: WIDGETS_ADMIN }, 0)).resolves.toBeNull()
    await expect(cargarVisionGeneral(cliente({}) as never, null, 0)).resolves.toBeNull()
  })
})
