/**
 * Grupos de Vida — pure view model of /grupos-vida/directores.
 *
 * Turns plain rows (segments, groups, stage directors, the general directors
 * and their scope per segment) into the three lists of the screen: the general
 * directors, the stage directors and the "Por ordenar" strip. No I/O and no
 * React: the server loader (directores-datos.ts) reads the rows and the client
 * island only renders what this returns.
 *
 * Rules mirrored from the database (gdv_dg_ve_grupo, T1):
 * - A general director reaches a group when they hold a row for the group's
 *   segment and either the scope is `segmento`, or the scope is `directores`
 *   and the group is linked to a stage director of that same segment that is
 *   marked for them.
 * - "Active group" is what the group list treats as an active approved group:
 *   `activo`, `estado_aprobacion = 'aprobado'` and not deleted.
 * - Visible groups are computed from the real set of group ids, so a group
 *   with two directors counts once.
 */

export type Alcance = 'segmento' | 'directores'

export interface SegmentoEntrada {
  readonly id: string
  readonly nombre: string
}

export interface GrupoEntrada {
  readonly id: string
  readonly segmentoId: string | null
  readonly activo: boolean
  readonly eliminado: boolean | null
  readonly estadoAprobacion: string | null
}

/** A `segmento_lideres` row with `tipo_lider = 'director_etapa'`. */
export interface DirectorEtapaEntrada {
  /** `segmento_lideres.id` — what `director_etapa_grupos` and the marks point to. */
  readonly id: string
  readonly usuarioId: string
  readonly segmentoId: string
  readonly nombre: string
  readonly ciudad: string | null
  readonly tieneCuenta: boolean
}

export interface EnlaceDirectorGrupo {
  /** `segmento_lideres.id` of the stage director. */
  readonly directorId: string
  readonly grupoId: string
}

export interface DirectorGeneralEntrada {
  readonly usuarioId: string
  readonly nombre: string
  /** Every system role of the person (`roles_sistema.nombre_interno`). */
  readonly roles: readonly string[]
}

export interface AlcanceEntrada {
  readonly usuarioId: string
  readonly segmentoId: string
  readonly alcance: string
}

export interface MarcaEntrada {
  readonly usuarioId: string
  /** `segmento_lideres.id` of the marked stage director. */
  readonly directorId: string
}

export interface PersonaEntrada {
  readonly id: string
  readonly nombre: string
}

export interface EntradaVistaDirectores {
  readonly segmentos: readonly SegmentoEntrada[]
  readonly grupos: readonly GrupoEntrada[]
  readonly directoresEtapa: readonly DirectorEtapaEntrada[]
  readonly enlaces: readonly EnlaceDirectorGrupo[]
  readonly generales: readonly DirectorGeneralEntrada[]
  readonly alcances: readonly AlcanceEntrada[]
  readonly marcas: readonly MarcaEntrada[]
  /** People holding the `director-etapa` role. */
  readonly personasConRolDirectorEtapa: readonly PersonaEntrada[]
  /** `usuario_id` of every `segmento_lideres` row, of any type. */
  readonly usuariosConSegmentoLider: readonly string[]
  readonly soloLectura: boolean
}

export interface DirectorDeSegmento {
  readonly segmentoLiderId: string
  readonly usuarioId: string
  readonly nombre: string
  readonly ciudad: string | null
  readonly grupos: number
  readonly marcado: boolean
  readonly detalle: string
}

export interface SegmentoDeGeneral {
  readonly segmentoId: string
  readonly nombre: string
  readonly alcance: Alcance
  readonly directoresDeEtapa: number
  readonly gruposActivos: number
  readonly gruposVisibles: number
  readonly conteo: string
  readonly visibles: string
  readonly directores: readonly DirectorDeSegmento[]
}

export interface TarjetaGeneral {
  readonly usuarioId: string
  readonly nombre: string
  readonly iniciales: string
  readonly otroRol: 'Administrador' | 'Pastor' | null
  readonly todos: boolean
  readonly resumen: string
  readonly segmentos: readonly SegmentoDeGeneral[]
  readonly segmentosDisponibles: readonly SegmentoEntrada[]
  readonly editable: boolean
}

export interface RespondeA {
  readonly usuarioId: string
  readonly nombre: string
  readonly iniciales: string
}

export interface FilaEtapa {
  readonly segmentoLiderId: string
  readonly usuarioId: string
  readonly nombre: string
  readonly iniciales: string
  readonly segmentoId: string
  readonly segmentoNombre: string
  readonly ciudad: string | null
  readonly gruposActivos: number
  readonly sinGrupos: boolean
  readonly respondeA: readonly RespondeA[]
  readonly tieneCuenta: boolean
  readonly hrefGrupos: string
}

export type TipoPorOrdenar = 'grupos-activos-sin-director' | 'grupos-pendientes-sin-director' | 'personas-sin-segmento'

export interface ItemPorOrdenar {
  readonly tipo: TipoPorOrdenar
  readonly cantidad: number
  readonly titulo: string
  readonly detalle: string
  readonly accion: string
  readonly href: string
}

export interface VistaDirectores {
  readonly soloLectura: boolean
  readonly generales: readonly TarjetaGeneral[]
  readonly etapa: readonly FilaEtapa[]
  readonly segmentos: readonly SegmentoEntrada[]
  readonly porOrdenar: readonly ItemPorOrdenar[]
  readonly totales: { readonly generales: number; readonly etapa: number }
}

export interface FiltroEtapa {
  readonly q: string
  /** `null` = every segment. */
  readonly segmentoId: string | null
}

export interface ChipSegmento {
  readonly id: string | null
  readonly label: string
  readonly cantidad: number
  readonly activo: boolean
}

export interface ResultadoFiltroEtapa {
  readonly filas: readonly FilaEtapa[]
  readonly chips: readonly ChipSegmento[]
  readonly pie: string
}

const RUTA_SEGMENTOS = '/grupos-vida/segmentos'
const RUTA_SOLICITUDES = '/grupos-vida/solicitudes'
const MAX_NOMBRES_EN_DETALLE = 3

const comparar = (a: string, b: string): number => a.localeCompare(b, 'es', { sensitivity: 'base' })

/** Lowercase text without accents, for searching. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ''
  const primera = palabras[0][0] ?? ''
  const ultima = palabras.length > 1 ? (palabras[palabras.length - 1][0] ?? '') : ''
  return `${primera}${ultima}`.toUpperCase()
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

const esGrupoActivo = (g: GrupoEntrada): boolean => g.activo && g.estadoAprobacion === 'aprobado' && g.eliminado !== true
const esGrupoPendiente = (g: GrupoEntrada): boolean => g.estadoAprobacion === 'pendiente' && g.eliminado !== true

const leerAlcance = (valor: string): Alcance => (valor === 'directores' ? 'directores' : 'segmento')

function otroRolDe(roles: readonly string[]): TarjetaGeneral['otroRol'] {
  if (roles.includes('admin')) return 'Administrador'
  if (roles.includes('pastor')) return 'Pastor'
  return null
}

function agruparPorSegmento(
  grupos: readonly GrupoEntrada[],
  segmentos: readonly SegmentoEntrada[],
): { readonly segmentoId: string; readonly nombre: string; readonly cantidad: number }[] {
  const nombrePorId = new Map(segmentos.map((s) => [s.id, s.nombre]))
  const conteo = new Map<string, number>()
  for (const g of grupos) {
    if (!g.segmentoId) continue
    conteo.set(g.segmentoId, (conteo.get(g.segmentoId) ?? 0) + 1)
  }
  return [...conteo.entries()]
    .map(([segmentoId, cantidad]) => ({ segmentoId, nombre: nombrePorId.get(segmentoId) ?? 'Segmento sin nombre', cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || comparar(a.nombre, b.nombre))
}

function detallePorSegmento(porSegmento: readonly { nombre: string; cantidad: number }[]): string {
  if (porSegmento.length === 1) return `Todos en ${porSegmento[0].nombre}`
  return porSegmento.map((s) => `${s.cantidad} en ${s.nombre}`).join(' · ')
}

function construirPorOrdenar(
  entrada: EntradaVistaDirectores,
  gruposConDirector: ReadonlySet<string>,
): readonly ItemPorOrdenar[] {
  const items: ItemPorOrdenar[] = []

  const activosSinDirector = entrada.grupos.filter((g) => esGrupoActivo(g) && !gruposConDirector.has(g.id))
  if (activosSinDirector.length > 0) {
    const porSegmento = agruparPorSegmento(activosSinDirector, entrada.segmentos)
    items.push({
      tipo: 'grupos-activos-sin-director',
      cantidad: activosSinDirector.length,
      titulo: `${plural(activosSinDirector.length, 'grupo activo', 'grupos activos')} sin director de etapa`,
      detalle: detallePorSegmento(porSegmento),
      accion: 'Asignar director',
      href: porSegmento.length === 1 ? `${RUTA_SEGMENTOS}/${porSegmento[0].segmentoId}/directores` : RUTA_SEGMENTOS,
    })
  }

  const pendientesSinDirector = entrada.grupos.filter((g) => esGrupoPendiente(g) && !gruposConDirector.has(g.id))
  if (pendientesSinDirector.length > 0) {
    items.push({
      tipo: 'grupos-pendientes-sin-director',
      cantidad: pendientesSinDirector.length,
      titulo: `${plural(pendientesSinDirector.length, 'grupo pendiente', 'grupos pendientes')} de aprobación sin director de etapa`,
      detalle: detallePorSegmento(agruparPorSegmento(pendientesSinDirector, entrada.segmentos)),
      accion: 'Revisar solicitudes',
      href: RUTA_SOLICITUDES,
    })
  }

  const conSegmento = new Set(entrada.usuariosConSegmentoLider)
  const sinSegmento = entrada.personasConRolDirectorEtapa.filter((p) => !conSegmento.has(p.id))
  if (sinSegmento.length > 0) {
    const nombres = sinSegmento.map((p) => p.nombre)
    const visibles = nombres.slice(0, MAX_NOMBRES_EN_DETALLE)
    const resto = nombres.length - visibles.length
    items.push({
      tipo: 'personas-sin-segmento',
      cantidad: sinSegmento.length,
      titulo: `${plural(sinSegmento.length, 'persona', 'personas')} con rol de director de etapa y sin segmento`,
      detalle: resto > 0 ? `${visibles.join(', ')} y ${resto} más` : visibles.join(', '),
      accion: 'Asignar segmento',
      href: RUTA_SEGMENTOS,
    })
  }

  return items
}

export function construirVistaDirectores(entrada: EntradaVistaDirectores): VistaDirectores {
  const segmentosOrdenados = [...entrada.segmentos].sort((a, b) => comparar(a.nombre, b.nombre))
  const nombreSegmento = new Map(entrada.segmentos.map((s) => [s.id, s.nombre]))
  const directorPorId = new Map(entrada.directoresEtapa.map((d) => [d.id, d]))
  const grupoPorId = new Map(entrada.grupos.map((g) => [g.id, g]))

  // Group ids linked to each stage director. A link only counts when the group
  // belongs to the director's own segment — the database rule ignores the rest.
  const gruposDeDirector = new Map<string, Set<string>>()
  const gruposConDirector = new Set<string>()
  for (const enlace of entrada.enlaces) {
    const director = directorPorId.get(enlace.directorId)
    const grupo = grupoPorId.get(enlace.grupoId)
    if (!director || !grupo || grupo.segmentoId !== director.segmentoId) continue
    gruposConDirector.add(grupo.id)
    const ids = gruposDeDirector.get(director.id) ?? new Set<string>()
    ids.add(grupo.id)
    gruposDeDirector.set(director.id, ids)
  }
  const activosDeDirector = (directorId: string): Set<string> => {
    const ids = new Set<string>()
    for (const id of gruposDeDirector.get(directorId) ?? []) {
      const grupo = grupoPorId.get(id)
      if (grupo && esGrupoActivo(grupo)) ids.add(id)
    }
    return ids
  }

  const gruposActivosPorSegmento = new Map<string, number>()
  for (const g of entrada.grupos) {
    if (!g.segmentoId || !esGrupoActivo(g)) continue
    gruposActivosPorSegmento.set(g.segmentoId, (gruposActivosPorSegmento.get(g.segmentoId) ?? 0) + 1)
  }

  const directoresPorSegmento = new Map<string, DirectorEtapaEntrada[]>()
  for (const d of entrada.directoresEtapa) {
    const lista = directoresPorSegmento.get(d.segmentoId) ?? []
    lista.push(d)
    directoresPorSegmento.set(d.segmentoId, lista)
  }
  for (const lista of directoresPorSegmento.values()) lista.sort((a, b) => comparar(a.nombre, b.nombre))

  const marcasPorPersona = new Map<string, Set<string>>()
  for (const m of entrada.marcas) {
    const set = marcasPorPersona.get(m.usuarioId) ?? new Set<string>()
    set.add(m.directorId)
    marcasPorPersona.set(m.usuarioId, set)
  }

  const alcancePorPersona = new Map<string, Map<string, Alcance>>()
  for (const a of entrada.alcances) {
    const mapa = alcancePorPersona.get(a.usuarioId) ?? new Map<string, Alcance>()
    mapa.set(a.segmentoId, leerAlcance(a.alcance))
    alcancePorPersona.set(a.usuarioId, mapa)
  }

  const generales: TarjetaGeneral[] = [...entrada.generales]
    .sort((a, b) => comparar(a.nombre, b.nombre))
    .map((general) => {
      const alcances = alcancePorPersona.get(general.usuarioId) ?? new Map<string, Alcance>()
      const marcas = marcasPorPersona.get(general.usuarioId) ?? new Set<string>()

      const segmentos: SegmentoDeGeneral[] = segmentosOrdenados
        .filter((s) => alcances.has(s.id))
        .map((s) => {
          const alcance = alcances.get(s.id) ?? 'segmento'
          const directores = directoresPorSegmento.get(s.id) ?? []
          const gruposActivos = gruposActivosPorSegmento.get(s.id) ?? 0

          let gruposVisibles = gruposActivos
          if (alcance === 'directores') {
            const union = new Set<string>()
            for (const d of directores) {
              if (!marcas.has(d.id)) continue
              for (const id of activosDeDirector(d.id)) union.add(id)
            }
            gruposVisibles = union.size
          }

          return {
            segmentoId: s.id,
            nombre: s.nombre,
            alcance,
            directoresDeEtapa: directores.length,
            gruposActivos,
            gruposVisibles,
            conteo: `${plural(directores.length, 'director de etapa', 'directores de etapa')} · ${plural(gruposActivos, 'grupo activo', 'grupos activos')}`,
            visibles: plural(gruposVisibles, 'grupo visible', 'grupos visibles'),
            directores: directores.map((d) => {
              const grupos = activosDeDirector(d.id).size
              return {
                segmentoLiderId: d.id,
                usuarioId: d.usuarioId,
                nombre: d.nombre,
                ciudad: d.ciudad,
                grupos,
                marcado: marcas.has(d.id),
                detalle: `${d.ciudad ?? 'Sin ciudad'} · ${plural(grupos, 'grupo', 'grupos')}`,
              }
            }),
          }
        })

      const todos = segmentosOrdenados.length > 0 && segmentosOrdenados.every((s) => alcances.get(s.id) === 'segmento')
      const totalDirectores = segmentos.reduce((suma, s) => suma + s.directoresDeEtapa, 0)
      const totalGrupos = segmentos.reduce((suma, s) => suma + s.gruposVisibles, 0)

      return {
        usuarioId: general.usuarioId,
        nombre: general.nombre,
        iniciales: iniciales(general.nombre),
        otroRol: otroRolDe(general.roles),
        todos,
        resumen:
          segmentos.length === 0
            ? 'Sin segmentos asignados'
            : `${plural(segmentos.length, 'segmento', 'segmentos')} · ${plural(totalDirectores, 'director de etapa', 'directores de etapa')} · ${plural(totalGrupos, 'grupo', 'grupos')}`,
        segmentos,
        segmentosDisponibles: segmentosOrdenados.filter((s) => !alcances.has(s.id)),
        editable: !entrada.soloLectura,
      }
    })

  // Who each stage director answers to: the general directors whose scope
  // reaches them (a row for the segment and scope segmento, or marked).
  const etapa: FilaEtapa[] = [...entrada.directoresEtapa]
    .sort((a, b) => {
      const porSegmento = comparar(nombreSegmento.get(a.segmentoId) ?? '', nombreSegmento.get(b.segmentoId) ?? '')
      return porSegmento !== 0 ? porSegmento : comparar(a.nombre, b.nombre)
    })
    .map((director) => {
      const respondeA = [...entrada.generales]
        .filter((general) => {
          const alcance = alcancePorPersona.get(general.usuarioId)?.get(director.segmentoId)
          if (!alcance) return false
          return alcance === 'segmento' || (marcasPorPersona.get(general.usuarioId)?.has(director.id) ?? false)
        })
        .sort((a, b) => comparar(a.nombre, b.nombre))
        .map((general) => ({ usuarioId: general.usuarioId, nombre: general.nombre, iniciales: iniciales(general.nombre) }))
      const gruposActivos = activosDeDirector(director.id).size
      return {
        segmentoLiderId: director.id,
        usuarioId: director.usuarioId,
        nombre: director.nombre,
        iniciales: iniciales(director.nombre),
        segmentoId: director.segmentoId,
        segmentoNombre: nombreSegmento.get(director.segmentoId) ?? 'Segmento sin nombre',
        ciudad: director.ciudad,
        gruposActivos,
        sinGrupos: gruposActivos === 0,
        respondeA,
        tieneCuenta: director.tieneCuenta,
        hrefGrupos: `${RUTA_SEGMENTOS}/${director.segmentoId}/directores`,
      }
    })

  return {
    soloLectura: entrada.soloLectura,
    generales,
    etapa,
    segmentos: segmentosOrdenados,
    // The strip is a to-do list for whoever manages directors: a read-only
    // viewer (a general director) does not get it.
    porOrdenar: entrada.soloLectura ? [] : construirPorOrdenar(entrada, gruposConDirector),
    totales: { generales: generales.length, etapa: etapa.length },
  }
}

/** Search by name (accents and case ignored) and segment filter over the stage directors. */
export function filtrarDirectoresEtapa(
  filas: readonly FilaEtapa[],
  segmentos: readonly SegmentoEntrada[],
  filtro: FiltroEtapa,
): ResultadoFiltroEtapa {
  const texto = normalizarTexto(filtro.q)
  const porBusqueda = texto === '' ? filas : filas.filter((f) => normalizarTexto(f.nombre).includes(texto))
  const visibles = filtro.segmentoId === null ? porBusqueda : porBusqueda.filter((f) => f.segmentoId === filtro.segmentoId)

  const chips: ChipSegmento[] = [
    { id: null, label: 'Todos', cantidad: porBusqueda.length, activo: filtro.segmentoId === null },
    ...segmentos.map((s) => ({
      id: s.id,
      label: s.nombre,
      cantidad: porBusqueda.filter((f) => f.segmentoId === s.id).length,
      activo: filtro.segmentoId === s.id,
    })),
  ]

  return {
    filas: visibles,
    chips,
    pie: `Mostrando ${visibles.length} de ${filas.length} directores de etapa`,
  }
}
