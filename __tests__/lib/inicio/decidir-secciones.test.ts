import { decidirSecciones, type SeccionInicio } from '@/lib/inicio/decidir-secciones'
import { HECHOS_VACIOS, type HechosInicio, type PendientesInicio } from '@/lib/inicio/hechos'

// odd/tasks/home-por-rol.md T2 (S1, S3, S6, S7, S8). The ten profiles are PERFILES of
// design/home-por-rol/_generar.mjs; their design keys map to section ids below.

const CLAVE: Record<string, SeccionInicio['id']> = {
  '1': 'para-responder',
  '2': 'mis-servicios',
  '3': 'mis-hijos',
  '4': 'a-cargo',
  '4b': 'grupo-miembro',
  '5': 'vision-general',
  '6': 'proximos-pasos',
  n: 'notas-lideres',
  c: 'cumpleanos',
  x: 'explorar',
}

type Ajustes = Omit<Partial<HechosInicio>, 'pendientes'> & { pendientes?: Partial<PendientesInicio> }

function hechos(ajustes: Ajustes = {}): HechosInicio {
  return {
    ...HECHOS_VACIOS,
    usuarioId: 'u-1',
    perfilCompleto: true,
    hizoProximoPaso: true,
    ...ajustes,
    pendientes: { ...HECHOS_VACIOS.pendientes, ...ajustes.pendientes },
  }
}

const ids = (h: HechosInicio) => decidirSecciones(h).map((s) => s.id)
const seccion = <I extends SeccionInicio['id']>(h: HechosInicio, id: I) =>
  decidirSecciones(h).find((s): s is Extract<SeccionInicio, { id: I }> => s.id === id)

const servicio = (nivel: string | null = 'voluntario', equipoId = 'eq-1') => ({ servicioId: `s-${equipoId}`, equipoId, nivel })

describe('decidirSecciones · para responder (S1)', () => {
  it('no aparece sin pendientes', () => {
    expect(ids(hechos())).not.toContain('para-responder')
  })

  it('aparece con un pendiente fuera de Mis servicios', () => {
    expect(seccion(hechos({ pendientes: { solicitudesGrupo: 2 } }), 'para-responder')).toEqual({
      id: 'para-responder',
      items: [{ tipo: 'solicitudes-grupo', cantidad: 2 }],
    })
  })

  it('no aparece si el único pendiente es un servicio por confirmar', () => {
    expect(ids(hechos({ serviciosActivos: [servicio()], serviciosPorConfirmar: 1 }))).toEqual(['mis-servicios', 'explorar'])
  })

  it('suma al final una fila que salta a Mis servicios cuando hay servicios por confirmar', () => {
    const h = hechos({ serviciosActivos: [servicio()], serviciosPorConfirmar: 1, pendientes: { reportesSinCargar: 1, ticketsAbiertos: 3 } })
    expect(seccion(h, 'para-responder')?.items).toEqual([
      { tipo: 'reportes-sin-cargar', cantidad: 1 },
      { tipo: 'tickets', cantidad: 3 },
      { tipo: 'servicios-por-confirmar', cantidad: 1 },
    ])
  })

  it('ordena los pendientes por urgencia', () => {
    const h = hechos({ pendientes: { ticketsAbiertos: 1, dreamTeam: 4, gruposSinCasa: 1, casasPorRevisar: 3, solicitudesGrupo: 5, reportesSinCargar: 2 } })
    expect(seccion(h, 'para-responder')?.items.map((i) => i.tipo)).toEqual([
      'reportes-sin-cargar', 'solicitudes-grupo', 'casas-por-revisar', 'grupos-sin-casa', 'dream-team', 'tickets',
    ])
  })
})

describe('decidirSecciones · pendientes de directores (S5, S7)', () => {
  it('suma líderes sin reporte y Próximo Paso por marcar después de los reportes propios', () => {
    const h = hechos({ pendientes: { reportesSinCargar: 1, lideresSinReporte: 4, marcarProximoPaso: 3 } })
    expect(seccion(h, 'para-responder')?.items.map((i) => i.tipo)).toEqual([
      'reportes-sin-cargar',
      'lideres-sin-reporte',
      'marcar-proximo-paso',
    ])
  })
})

describe('decidirSecciones · mis servicios (S1, S2)', () => {
  it('aparece con un servicio activo de Dream Team', () => {
    expect(seccion(hechos({ serviciosActivos: [servicio()] }), 'mis-servicios')).toEqual({ id: 'mis-servicios', porConfirmar: 0 })
  })

  it('aparece si está convocado en un plan DPS', () => {
    expect(ids(hechos({ convocadoEnDps: true }))).toContain('mis-servicios')
  })

  it('no aparece si no sirve', () => {
    expect(ids(hechos())).not.toContain('mis-servicios')
  })
})

describe('decidirSecciones · mis hijos (S1)', () => {
  it('aparece con al menos un hijo', () => {
    expect(seccion(hechos({ hijos: 2 }), 'mis-hijos')).toEqual({ id: 'mis-hijos', cantidad: 2 })
  })

  it('no aparece sin hijos', () => {
    expect(ids(hechos({ hijos: 0 }))).not.toContain('mis-hijos')
  })
})

describe('decidirSecciones · a cargo (S6, S7, S8)', () => {
  it('el Líder de un grupo lo tiene a cargo', () => {
    expect(seccion(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Líder' }] }), 'a-cargo')?.cargos).toEqual([
      { tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36' },
    ])
  })

  it('el Colíder no tiene nada a cargo', () => {
    expect(ids(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Colíder' }] }))).not.toContain('a-cargo')
  })

  it('la directora de etapa tiene su etapa a cargo', () => {
    expect(seccion(hechos({ etapasDirigidas: ['sl-1'] }), 'a-cargo')?.cargos).toEqual([{ tipo: 'etapa', directorEtapaId: 'sl-1' }])
  })

  it('el director general tiene su segmento a cargo', () => {
    expect(seccion(hechos({ segmentosDirigidos: ['seg-1'] }), 'a-cargo')?.cargos).toEqual([{ tipo: 'segmento', segmentoId: 'seg-1' }])
  })

  it('el director de área lo es por el nivel de su servicio, no por un rol global', () => {
    const h = hechos({ serviciosActivos: [servicio('director', 'eq-ninos'), servicio('voluntario', 'eq-host')] })
    expect(seccion(h, 'a-cargo')?.cargos).toEqual([{ tipo: 'area-dream-team', equipoId: 'eq-ninos', servicioId: 's-eq-ninos' }])
  })

  it('el coordinador de área también tiene su área a cargo (S16.2)', () => {
    const h = hechos({ serviciosActivos: [servicio('coordinador', 'eq-host')] })
    expect(seccion(h, 'a-cargo')?.cargos).toEqual([{ tipo: 'area-dream-team', equipoId: 'eq-host', servicioId: 's-eq-host' }])
  })

  it('un servicio de nivel voluntario, líder o desconocido no tiene un área a cargo', () => {
    expect(ids(hechos({ serviciosActivos: [servicio('voluntario'), servicio('lider', 'eq-2'), servicio(null, 'eq-3')] }))).not.toContain('a-cargo')
  })

  it('junta varios cargos en una sola sección, en orden', () => {
    const h = hechos({
      grupos: [{ grupoId: 'g-1', nombre: 'A', rol: 'Líder' }],
      etapasDirigidas: ['sl-1'],
      segmentosDirigidos: ['seg-1'],
      serviciosActivos: [servicio('director')],
    })
    expect(seccion(h, 'a-cargo')?.cargos.map((c) => c.tipo)).toEqual(['grupo-lider', 'etapa', 'segmento', 'area-dream-team'])
    expect(ids(h).filter((id) => id === 'a-cargo')).toHaveLength(1)
  })
})

describe('decidirSecciones · grupo donde soy miembro (S6)', () => {
  it('el Miembro ve su grupo', () => {
    expect(seccion(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios', rol: 'Miembro' }] }), 'grupo-miembro')).toEqual({
      id: 'grupo-miembro', grupoId: 'g-1', nombre: 'Matrimonios', soloLectura: false,
    })
  })

  it('el Colíder lo ve como miembro, en solo lectura', () => {
    expect(seccion(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres', rol: 'Colíder' }] }), 'grupo-miembro')?.soloLectura).toBe(true)
  })

  it('un líder que es miembro de otro grupo ve las dos tarjetas', () => {
    const h = hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres', rol: 'Líder' }, { grupoId: 'g-2', nombre: 'Matrimonios', rol: 'Miembro' }] })
    expect(ids(h)).toEqual(['a-cargo', 'grupo-miembro', 'cumpleanos', 'explorar'])
    expect(seccion(h, 'grupo-miembro')?.grupoId).toBe('g-2')
  })

  it('da una sección por grupo', () => {
    const h = hechos({ grupos: [{ grupoId: 'g-1', nombre: 'A', rol: 'Miembro' }, { grupoId: 'g-2', nombre: 'B', rol: 'Colíder' }] })
    expect(decidirSecciones(h).filter((s) => s.id === 'grupo-miembro')).toEqual([
      { id: 'grupo-miembro', grupoId: 'g-1', nombre: 'A', soloLectura: false },
      { id: 'grupo-miembro', grupoId: 'g-2', nombre: 'B', soloLectura: true },
    ])
  })
})

describe('decidirSecciones · visión general (S7, S8)', () => {
  it('solo la ven admin y pastor', () => {
    expect(ids(hechos({ esAdminOPastor: true }))).toContain('vision-general')
  })

  it('el director general no la ve: ve su segmento', () => {
    const h = hechos({ segmentosDirigidos: ['seg-1'] })
    expect(ids(h)).not.toContain('vision-general')
    expect(ids(h)).toContain('a-cargo')
  })
})

describe('decidirSecciones · próximos pasos (S3)', () => {
  it('quien no hizo Próximo Paso lo ve primero y destacado, sin Dream Team', () => {
    const pasos = seccion(hechos({ hizoProximoPaso: false }), 'proximos-pasos')?.pasos
    expect(pasos?.[0]).toEqual({ id: 'proximo-paso', hecho: false, destacado: true })
    expect(pasos?.map((p) => p.id)).not.toContain('servir-dream-team')
  })

  it('no ofrece unirse a un grupo de vida', () => {
    const pasos = seccion(hechos({ hizoProximoPaso: false, perfilCompleto: false }), 'proximos-pasos')?.pasos ?? []
    expect(pasos.map((p) => p.id)).toEqual(['proximo-paso', 'completar-perfil', 'talleres'])
  })

  it('quien hizo Próximo Paso y no sirve no ve un paso de Dream Team (S13)', () => {
    expect(ids(hechos({ hizoProximoPaso: true }))).not.toContain('proximos-pasos')
    expect(seccion(hechos({ hizoProximoPaso: true, perfilCompleto: false }), 'proximos-pasos')?.pasos).toEqual([
      { id: 'completar-perfil', hecho: false },
      { id: 'proximo-paso', hecho: true },
    ])
  })

  it('pide completar el perfil si faltan datos', () => {
    const pasos = seccion(hechos({ perfilCompleto: false, serviciosActivos: [servicio()] }), 'proximos-pasos')?.pasos
    expect(pasos).toEqual([{ id: 'completar-perfil', hecho: false }, { id: 'proximo-paso', hecho: true }])
  })

  it('no aparece si no le falta nada', () => {
    expect(ids(hechos({ serviciosActivos: [servicio()] }))).not.toContain('proximos-pasos')
  })

  it('a quien ya tiene algo a cargo o es admin/pastor no le ofrece servir', () => {
    expect(ids(hechos({ etapasDirigidas: ['sl-1'] }))).not.toContain('proximos-pasos')
    expect(ids(hechos({ esAdminOPastor: true }))).not.toContain('proximos-pasos')
  })

  it('si no se pudo saber si hizo Próximo Paso, no lo pide ni ofrece servir', () => {
    expect(ids(hechos({ hizoProximoPaso: null }))).toEqual(['explorar'])
  })
})

describe('decidirSecciones · datos heredados sin el hito de Próximo Paso (L8)', () => {
  it('quien ya sirve no ve Próximo Paso destacado', () => {
    const h = hechos({ hizoProximoPaso: false, serviciosActivos: [servicio()] })
    expect(seccion(h, 'proximos-pasos')).toBeUndefined()
  })

  it('quien tiene algo a cargo o es admin/pastor tampoco lo ve', () => {
    const lider = hechos({ hizoProximoPaso: false, grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Líder' }] })
    const pastor = hechos({ hizoProximoPaso: false, esAdminOPastor: true })
    expect(seccion(lider, 'proximos-pasos')).toBeUndefined()
    expect(seccion(pastor, 'proximos-pasos')).toBeUndefined()
  })

  it('el miembro que no sirve ni tiene cargo sí lo ve destacado', () => {
    const h = hechos({ hizoProximoPaso: false, grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Miembro' }] })
    expect(seccion(h, 'proximos-pasos')?.pasos[0]).toEqual({ id: 'proximo-paso', hecho: false, destacado: true })
  })
})

describe('decidirSecciones · explorar (S15)', () => {
  it('siempre va al final', () => {
    const lista = ids(hechos({ esAdminOPastor: true, hijos: 1, pendientes: { ticketsAbiertos: 1 } }))
    expect(lista.at(-1)).toBe('explorar')
  })

  it('Talleres para todos; «Inscribir a mis hijos» al adulto sin hijos registrados', () => {
    expect(seccion(hechos({ hizoProximoPaso: false }), 'explorar')?.tiles).toEqual(['talleres', 'mis-hijos'])
    expect(seccion(hechos({ esMayorDeEdad: true, hijos: 0 }), 'explorar')?.tiles).toEqual(['talleres', 'mis-hijos'])
  })

  it('quien ya tiene hijos registrados no ve «Inscribir a mis hijos»: tiene la tarjeta Mis hijos', () => {
    expect(seccion(hechos({ hijos: 2 }), 'explorar')?.tiles).toEqual(['talleres'])
  })

  it('un menor no ve «Inscribir a mis hijos»', () => {
    expect(seccion(hechos({ esMayorDeEdad: false, hijos: 0 }), 'explorar')?.tiles).toEqual(['talleres'])
  })

  it('nunca ofrece Próximo Paso, Dream Team, Grupos de Vida ni Niños', () => {
    for (const h of [
      hechos({ hizoProximoPaso: false }),
      hechos({ hizoProximoPaso: null }),
      hechos({ serviciosActivos: [servicio('director')] }),
      hechos({ esAdminOPastor: true }),
      hechos({ convocadoEnDps: true }),
      hechos({ grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Miembro' }] }),
    ]) {
      for (const tile of ['proximo-paso', 'dream-team', 'grupos-vida', 'ninos']) {
        expect(seccion(h, 'explorar')?.tiles).not.toContain(tile)
      }
    }
  })
})

describe('decidirSecciones · Dream Team solo con servicio (S13)', () => {
  it('sin servicio nadie ve Dream Team en el inicio', () => {
    for (const h of [
      hechos({ hizoProximoPaso: true }),
      hechos({ hizoProximoPaso: null }),
      hechos({ hizoProximoPaso: true, grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Colíder' }] }),
      hechos({ hizoProximoPaso: true, grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Líder' }] }),
      hechos({ esAdminOPastor: true }),
    ]) {
      expect(JSON.stringify(decidirSecciones(h))).not.toMatch(/dream-team/)
    }
  })

  it('el servidor tiene Mis servicios en el inicio', () => {
    expect(ids(hechos({ serviciosActivos: [servicio()] }))).toContain('mis-servicios')
  })
})

describe('decidirSecciones · notas de líderes (S11)', () => {
  it('las ven la directora de etapa, el director general y admin/pastor', () => {
    expect(ids(hechos({ etapasDirigidas: ['sl-1'] }))).toContain('notas-lideres')
    expect(ids(hechos({ segmentosDirigidos: ['seg-1'] }))).toContain('notas-lideres')
    expect(ids(hechos({ esAdminOPastor: true }))).toContain('notas-lideres')
  })

  it('no las ven el líder, el colíder, el miembro ni el director de área', () => {
    expect(ids(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Líder' }] }))).not.toContain('notas-lideres')
    expect(ids(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Colíder' }] }))).not.toContain('notas-lideres')
    expect(ids(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Miembro' }] }))).not.toContain('notas-lideres')
    expect(ids(hechos({ serviciosActivos: [servicio('director')] }))).not.toContain('notas-lideres')
  })

  it('van justo después de «A tu cargo»', () => {
    const h = hechos({ segmentosDirigidos: ['seg-1'], grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Miembro' }] })
    expect(ids(h)).toEqual(['a-cargo', 'notas-lideres', 'grupo-miembro', 'cumpleanos', 'explorar'])
  })
})

describe('decidirSecciones · próximos cumpleaños (S12)', () => {
  it('los ven el líder, la directora de etapa, el director general y admin/pastor', () => {
    expect(ids(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Líder' }] }))).toContain('cumpleanos')
    expect(ids(hechos({ etapasDirigidas: ['sl-1'] }))).toContain('cumpleanos')
    expect(ids(hechos({ segmentosDirigidos: ['seg-1'] }))).toContain('cumpleanos')
    expect(ids(hechos({ esAdminOPastor: true }))).toContain('cumpleanos')
  })

  it('el miembro y el colíder ven los de su grupo (S14a)', () => {
    expect(ids(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Miembro' }] }))).toEqual(['grupo-miembro', 'cumpleanos', 'explorar'])
    expect(ids(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'G', rol: 'Colíder' }] }))).toEqual(['grupo-miembro', 'cumpleanos', 'explorar'])
  })

  it('una sola sección aunque la persona lidere un grupo y sea miembro de otros', () => {
    const h = hechos({ grupos: [{ grupoId: 'g-1', nombre: 'A', rol: 'Líder' }, { grupoId: 'g-2', nombre: 'B', rol: 'Miembro' }, { grupoId: 'g-3', nombre: 'C', rol: 'Colíder' }] })
    expect(ids(h).filter((id) => id === 'cumpleanos')).toHaveLength(1)
  })

  it('sin grupo ni cargo no los ve, tampoco el director de área', () => {
    expect(ids(hechos({}))).not.toContain('cumpleanos')
    expect(ids(hechos({ serviciosActivos: [servicio('director')] }))).not.toContain('cumpleanos')
  })

  it('van después de los grupos y antes de Visión general', () => {
    expect(ids(hechos({ esAdminOPastor: true }))).toEqual(['notas-lideres', 'cumpleanos', 'vision-general', 'explorar'])
    const lider = hechos({ grupos: [{ grupoId: 'g-1', nombre: 'A', rol: 'Líder' }, { grupoId: 'g-2', nombre: 'B', rol: 'Miembro' }] })
    expect(ids(lider)).toEqual(['a-cargo', 'grupo-miembro', 'cumpleanos', 'explorar'])
  })
})

// Facts of each design profile (design/home-por-rol/_generar.mjs, PERFILES).
const PERFILES: Array<[string, HechosInicio, string[], string[]]> = [
  ['01 Miembro nuevo', hechos({ hizoProximoPaso: false, perfilCompleto: false }), ['6', 'x'], ['talleres', 'mis-hijos']],
  ['02 Asiste pero no sirve', hechos({ hizoProximoPaso: false, grupos: [{ grupoId: 'g-mat', nombre: 'Matrimonios · Zona Este', rol: 'Miembro' }] }), ['4b', 'c', '6', 'x'], ['talleres', 'mis-hijos']],
  ['03 Padre o madre', hechos({ hizoProximoPaso: false, hijos: 2 }), ['3', '6', 'x'], ['talleres']],
  ['04 Servidor con servicio por confirmar', hechos({
    serviciosActivos: [servicio('voluntario', 'eq-prod')], serviciosPorConfirmar: 1,
    grupos: [{ grupoId: 'g-jp', nombre: 'Jóvenes profesionales · Centro', rol: 'Miembro' }],
  }), ['2', '4b', 'c', 'x'], ['talleres', 'mis-hijos']],
  ['05 Líder de grupo que además sirve', hechos({
    serviciosActivos: [servicio('voluntario', 'eq-bienvenida')], serviciosPorConfirmar: 1,
    grupos: [{ grupoId: 'g-h36', nombre: 'Hombres +36 · Cabudare Este', rol: 'Líder' }, { grupoId: 'g-mat', nombre: 'Matrimonios · Zona Este', rol: 'Miembro' }],
    pendientes: { reportesSinCargar: 1, solicitudesGrupo: 2 },
  }), ['1', '2', '4', '4b', 'c', 'x'], ['talleres', 'mis-hijos']],
  ['06 Directora de área', hechos({
    serviciosActivos: [servicio('director', 'eq-ninos')], hijos: 1, pendientes: { dreamTeam: 16 },
  }), ['1', '2', '3', '4', 'x'], ['talleres']],
  ['07 Admin o pastor', hechos({
    esAdminOPastor: true, pendientes: { casasPorRevisar: 3, solicitudesGrupo: 5, reportesSinCargar: 11, ticketsAbiertos: 2 },
  }), ['1', 'n', 'c', '5', 'x'], ['talleres', 'mis-hijos']],
  // Hizo Próximo Paso and has the profile complete: without «Servir en Dream Team» (S13) nothing is pending.
  ['08 Colíder de grupo', hechos({ grupos: [{ grupoId: 'g-h36', nombre: 'Hombres +36 · Cabudare Este', rol: 'Colíder' }] }), ['4b', 'c', 'x'], ['talleres', 'mis-hijos']],
  ['09 Directora de etapa', hechos({
    etapasDirigidas: ['sl-mujeres36'], pendientes: { reportesSinCargar: 4, solicitudesGrupo: 2, gruposSinCasa: 1 },
  }), ['1', '4', 'n', 'c', 'x'], ['talleres', 'mis-hijos']],
  ['10 Director general', hechos({
    segmentosDirigidos: ['seg-matrimonios'], grupos: [{ grupoId: 'g-ros', nombre: 'Matrimonios +36 · La Rosaleda', rol: 'Miembro' }],
    pendientes: { solicitudesGrupo: 5, casasPorRevisar: 2, reportesSinCargar: 7 },
  }), ['1', '4', 'n', '4b', 'c', 'x'], ['talleres', 'mis-hijos']],
]

describe('decidirSecciones · perfiles del diseño', () => {
  it.each(PERFILES)('%s', (_perfil, h, claves) => {
    expect(ids(h)).toEqual(claves.map((k) => CLAVE[k]))
  })

  // S15, S16 (4): Talleres for everyone, so the home is never empty.
  it.each(PERFILES)('%s · Explorar', (_perfil, h, _claves, tiles) => {
    expect(seccion(h, 'explorar')?.tiles).toEqual(tiles)
  })

  it('coordinadora de área (S16.2): su área a cargo y el pendiente de Próximo Paso, como una directora', () => {
    const coordinadora = hechos({ serviciosActivos: [servicio('coordinador', 'eq-ninos')], hijos: 1, pendientes: { marcarProximoPaso: 2 } })
    expect(ids(coordinadora)).toEqual(['para-responder', 'mis-servicios', 'mis-hijos', 'a-cargo', 'explorar'])
    expect(seccion(coordinadora, 'para-responder')?.items).toEqual([{ tipo: 'marcar-proximo-paso', cantidad: 2 }])
  })
})
