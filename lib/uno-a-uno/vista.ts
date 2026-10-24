/**
 * View helpers for "Mis 1 a 1" (odd/tasks/uno-a-uno.md, T4): typed rows from
 * mis_uno_a_uno(), the page's three sections, and the dirigido picker built
 * from mis_dirigidos(). Pure, so the page and the tests share them.
 */

export type EstadoUnoAUno = 'agendado' | 'realizado' | 'cancelado'
export type LadoUnoAUno = 'lider' | 'dirigido'

export interface PersonaUnoAUno {
  readonly id: string
  readonly nombre: string
  readonly apellido: string | null
}

export interface UnoAUno {
  readonly id: string
  readonly estado: EstadoUnoAUno
  readonly fechaHora: string
  readonly lugar: string | null
  readonly miLado: LadoUnoAUno
  readonly lideres: readonly PersonaUnoAUno[]
  readonly dirigidos: readonly PersonaUnoAUno[]
  /** Only on the leader side (mis_uno_a_uno nulls it for dirigidos). */
  readonly resumen: string | null
  readonly notaPrivada: string | null
  readonly motivoCancelacion: string | null
}

/** One mis_dirigidos() row. */
export interface DirigidoFila {
  readonly usuario_id: string
  readonly nombre: string
  readonly apellido: string | null
  readonly conyuge_id: string | null
  readonly contextos: readonly string[] | null
}

export interface OpcionDirigido {
  readonly valor: string
  readonly etiqueta: string
}

const ESTADOS: ReadonlySet<string> = new Set(['agendado', 'realizado', 'cancelado'])
const LADOS: ReadonlySet<string> = new Set(['lider', 'dirigido'])

function texto(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function personas(value: unknown): PersonaUnoAUno[] {
  if (!Array.isArray(value)) return []
  const result: PersonaUnoAUno[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { id, nombre, apellido } = item as Record<string, unknown>
    if (typeof id !== 'string' || typeof nombre !== 'string') continue
    result.push({ id, nombre, apellido: texto(apellido) })
  }
  return result
}

/** Typed 1:1s from mis_uno_a_uno(); rows with an unknown estado or lado are dropped. */
export function parsearUnoAUno(rows: readonly Record<string, unknown>[] | null | undefined): UnoAUno[] {
  const result: UnoAUno[] = []
  for (const row of rows ?? []) {
    const id = texto(row.id)
    const fechaHora = texto(row.fecha_hora)
    const estado = texto(row.estado)
    const miLado = texto(row.mi_lado)
    if (!id || !fechaHora || !estado || !ESTADOS.has(estado) || !miLado || !LADOS.has(miLado)) continue
    result.push({
      id,
      estado: estado as EstadoUnoAUno,
      fechaHora,
      lugar: texto(row.lugar),
      miLado: miLado as LadoUnoAUno,
      lideres: personas(row.lideres),
      dirigidos: personas(row.dirigidos),
      resumen: texto(row.resumen),
      notaPrivada: texto(row.nota_privada),
      motivoCancelacion: texto(row.motivo_cancelacion),
    })
  }
  return result
}

function porFecha(a: UnoAUno, b: UnoAUno): number {
  return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime()
}

/** Próximos (soonest first), realizados and cancelados (latest first). */
export function agruparUnoAUno(lista: readonly UnoAUno[]): {
  proximos: UnoAUno[]
  realizados: UnoAUno[]
  cancelados: UnoAUno[]
} {
  const proximos: UnoAUno[] = []
  const realizados: UnoAUno[] = []
  const cancelados: UnoAUno[] = []
  for (const u of lista) {
    if (u.estado === 'agendado') proximos.push(u)
    else if (u.estado === 'realizado') realizados.push(u)
    else cancelados.push(u)
  }
  proximos.sort(porFecha)
  realizados.sort((a, b) => porFecha(b, a))
  cancelados.sort((a, b) => porFecha(b, a))
  return { proximos, realizados, cancelados }
}

function nombreCompleto(nombre: string, apellido: string | null): string {
  return [nombre, apellido].filter((p) => p && p.trim()).join(' ')
}

/** "Ana Pérez y Luis Gómez". */
export function nombresDe(lista: readonly PersonaUnoAUno[]): string {
  const nombres = lista.map((p) => nombreCompleto(p.nombre, p.apellido))
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * The picker options. A couple the user leads shows once (scheduling with
 * either spouse adds the other), with both names and every context.
 */
export function opcionesDirigidos(dirigidos: readonly DirigidoFila[]): OpcionDirigido[] {
  const porId = new Map(dirigidos.map((d) => [d.usuario_id, d]))
  const vistos = new Set<string>()
  const opciones: OpcionDirigido[] = []
  for (const d of dirigidos) {
    if (vistos.has(d.usuario_id)) continue
    vistos.add(d.usuario_id)
    const conyuge = d.conyuge_id ? porId.get(d.conyuge_id) : undefined
    const pareja = conyuge ? [d, conyuge] : [d]
    if (conyuge) vistos.add(conyuge.usuario_id)
    const nombres = nombresDe(pareja.map((p) => ({ id: p.usuario_id, nombre: p.nombre, apellido: p.apellido })))
    const contextos = [...new Set(pareja.flatMap((p) => p.contextos ?? []))].sort((a, b) => a.localeCompare(b, 'es'))
    opciones.push({ valor: d.usuario_id, etiqueta: contextos.length ? `${nombres} — ${contextos.join(', ')}` : nombres })
  }
  return opciones
}
