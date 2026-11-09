'use client'

/**
 * Estudiantes › Reportes — the Grupos and Personas lists. Desktop (artboard
 * 15 of design/estudiantes-dps, C29–C31): `TablaGruposReporte` and
 * `TablaPersonasReporte`, dense tables with the name frozen, the columns of
 * «Columnas» and the sorts in their headers; in The Living Room the Grupo
 * stays under the name (D8) so the three connection columns fit without
 * scrolling sideways. Phones (artboards 12 / 16, C36): the `ListaResponsiva`
 * rows below. Every row opens its read-only panel.
 *
 * The phone lists (artboards 11 / 12 of design/estudiantes-asistencia):
 * one `ListaResponsiva` each; every row opens its read-only drawer.
 * - Grupos: Grupo (+ leaders or "Sin líder") · Miembros · Reuniones (+ "N sin
 *   marcar", from lg) · Promedio (from lg) · Asistencia (GR4) · Visitantes
 *   (from lg) · Tendencia (GR2). Sortable: Grupo (año), Miembros, Asistencia,
 *   Tendencia.
 * - Personas: Nombre (+ año or "Entró el …") · Grupo (+ leaders or "Antes en
 *   …") · Asistencia · Presentes ("5 de 8" + "N sin marcar") · Faltas seguidas
 *   (from lg) · Última vez (from lg). Sortable: Nombre, Grupo, Asistencia,
 *   Faltas seguidas, Última vez.
 * - Personas of The Living Room (S21, A37–A40): Nombre (+ group) · Asistencia
 *   (+ "7 de 8") · 1:1 (count in the range, «Sin 1:1» when disconnected, L55)
 *   · Servicio (+ "3 de 4", "No sirve", "Sin fechas") · Talleres · Faltas
 *   seguidas and Última vez (from lg). Phone rows add "3 · 1:1", "Sirve 75%"
 *   and "2 talleres". Without the connections it is the list above.
 */
import type { ReactElement, ReactNode } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { ListaResponsiva, type ColumnaLista, type OrdenLista } from '@/components/ui/lista-responsiva'
import {
  fechaDia,
  haceCuanto,
  textoPorcentaje,
  type FilaGrupoReporte,
  type FilaPersonaReporte,
  type OrdenGruposReporte,
  type OrdenPersonasReporte,
} from '@/lib/platform/estudiantes/reportes'

import { TablaDensa, type ColumnaDensa, type Densidad, type OrdenColumna } from '../alcance/tabla-densa'
import { BarraPorcentaje, CeldaPorcentaje, IndicadorTendencia } from './partes-reportes'

const decimal = (valor: number): string => valor.toLocaleString('es-VE', { maximumFractionDigits: 1 })
const unirY = (partes: readonly string[]): string => (partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`)
const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

function Celda({ titulo, detalle, peso = 'semibold' }: { readonly titulo: ReactNode; readonly detalle?: ReactNode; readonly peso?: 'semibold' | 'medium' }): ReactElement {
  return (
    <div className="min-w-0">
      <p className={peso === 'semibold' ? 'truncate text-[15px] font-semibold text-foreground' : 'truncate text-[15px] font-medium text-foreground'}>{titulo}</p>
      {detalle && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{detalle}</p>}
    </div>
  )
}

const Cifra = ({ children }: { readonly children: ReactNode }): ReactElement => <span className="font-mono text-[15px] tabular-nums text-foreground">{children}</span>
const Nada = ({ texto = '—' }: { readonly texto?: string }): ReactElement => <span className="text-[13px] text-muted-foreground">{texto}</span>

// ── Grupos ───────────────────────────────────────────────────────────

const COLUMNAS_GRUPOS: readonly ColumnaLista[] = [
  { id: 'anio', titulo: 'Grupo', ordenable: true, ancho: 'minmax(0,1.5fr)' },
  { id: 'miembros', titulo: 'Miembros', ordenable: true, ancho: 'minmax(72px,0.6fr)' },
  { id: 'reuniones', titulo: 'Reuniones', ancho: 'minmax(84px,0.7fr)', ocultarEnTablet: true },
  { id: 'promedio', titulo: 'Promedio', ancho: 'minmax(84px,0.7fr)', ocultarEnTablet: true },
  { id: 'asistencia', titulo: 'Asistencia', ordenable: true, ancho: 'minmax(96px,0.9fr)' },
  { id: 'visitantes', titulo: 'Visitantes', ancho: 'minmax(72px,0.6fr)', ocultarEnTablet: true },
  { id: 'tendencia', titulo: 'Tendencia', ordenable: true, ancho: 'minmax(104px,0.8fr)' },
]

const DESCENDENTES = new Set<string>(['miembros', 'seguidas'])
const ordenLista = (columna: string): OrdenLista => ({ columna, sentido: DESCENDENTES.has(columna) ? 'desc' : 'asc' })

function InsigniasGrupo({ fila }: { readonly fila: FilaGrupoReporte }): ReactElement | null {
  const insignias: string[] = []
  if (fila.baja) insignias.push('Asistencia baja')
  if (fila.sinMarcar) insignias.push(plural(fila.sinMarcar, 'reunión sin marcar', 'reuniones sin marcar'))
  if (fila.lideres.length === 0) insignias.push('Sin líder')
  if (insignias.length === 0) return null
  return (
    <>
      {insignias.map((texto) => (
        <BadgeSistema key={texto} variante="warning" tamaño="sm">
          {texto}
        </BadgeSistema>
      ))}
    </>
  )
}

export interface ListaGruposReporteProps {
  readonly filas: readonly FilaGrupoReporte[]
  readonly orden: OrdenGruposReporte
  readonly onOrdenar: (orden: OrdenGruposReporte) => void
  readonly onAbrir: (grupoId: string) => void
  readonly vacio: ReactNode
}

export function ListaGruposReporte({ filas, orden, onOrdenar, onAbrir, vacio }: ListaGruposReporteProps): ReactElement {
  return (
    <ListaResponsiva
      etiqueta="Asistencia por grupo"
      columnas={COLUMNAS_GRUPOS}
      filas={filas}
      claveFila={(fila) => fila.grupoId}
      orden={ordenLista(orden)}
      onOrdenar={(columna) => onOrdenar(columna as OrdenGruposReporte)}
      onAbrirFila={(fila) => onAbrir(fila.grupoId)}
      etiquetaFila={(fila) => `Abrir ${fila.nombre}`}
      vacio={vacio}
      renderCelda={(fila, columna) => {
        switch (columna) {
          case 'anio':
            return (
              <Celda
                titulo={fila.nombre}
                detalle={fila.lideres.length ? unirY(fila.lideres) : <span className="font-medium text-warning-text">Sin líder</span>}
              />
            )
          case 'miembros':
            return <Cifra>{fila.miembros}</Cifra>
          case 'reuniones':
            return (
              <div className="min-w-0">
                <Cifra>{fila.reuniones}</Cifra>
                {fila.sinMarcar > 0 && <p className="mt-0.5 truncate text-[13px] text-warning-text">{fila.sinMarcar} sin marcar</p>}
              </div>
            )
          case 'promedio':
            return fila.promedioPresentes === null ? (
              <Nada />
            ) : (
              <Cifra>
                {decimal(fila.promedioPresentes)} <small className="text-[13px] text-muted-foreground">de {fila.miembros}</small>
              </Cifra>
            )
          case 'asistencia':
            return <CeldaPorcentaje porcentaje={fila.porcentaje} />
          case 'visitantes':
            return fila.visitantes ? <Cifra>{fila.visitantes}</Cifra> : <Nada />
          default:
            return <IndicadorTendencia tendencia={fila.tendencia} />
        }
      }}
      renderFilaMovil={(fila) => ({
        titulo: fila.nombre,
        subtitulo: `${fila.lideres.length ? unirY(fila.lideres) : 'Sin líder'} · ${plural(fila.reuniones, 'reunión', 'reuniones')}`,
        insignias: <InsigniasGrupo fila={fila} />,
        meta: (
          <span className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-sm tabular-nums text-foreground">{textoPorcentaje(fila.porcentaje)}</span>
            <IndicadorTendencia tendencia={fila.tendencia} compacto />
          </span>
        ),
      })}
    />
  )
}

// ── Personas ─────────────────────────────────────────────────────────

const COLUMNAS_PERSONAS: readonly ColumnaLista[] = [
  { id: 'nombre', titulo: 'Nombre', ordenable: true, ancho: 'minmax(0,1.4fr)' },
  { id: 'grupo', titulo: 'Grupo', ordenable: true, ancho: 'minmax(0,1.3fr)' },
  { id: 'asistencia', titulo: 'Asistencia', ordenable: true, ancho: 'minmax(96px,0.9fr)' },
  { id: 'presentes', titulo: 'Presentes', ancho: 'minmax(84px,0.8fr)' },
  { id: 'seguidas', titulo: 'Faltas seguidas', ordenable: true, ancho: 'minmax(96px,0.8fr)', ocultarEnTablet: true },
  { id: 'ultima', titulo: 'Última vez', ordenable: true, ancho: 'minmax(104px,0.9fr)', ocultarEnTablet: true },
]

const COLUMNAS_CONEXIONES: readonly ColumnaLista[] = [
  { id: 'nombre', titulo: 'Nombre', ordenable: true, ancho: 'minmax(0,1.4fr)' },
  { id: 'asistencia', titulo: 'Asistencia', ordenable: true, ancho: 'minmax(104px,0.9fr)' },
  { id: 'unos', titulo: '1:1', ordenable: true, ancho: 'minmax(80px,0.6fr)' },
  { id: 'servicio', titulo: 'Servicio', ordenable: true, ancho: 'minmax(104px,0.9fr)' },
  { id: 'talleres', titulo: 'Talleres', ordenable: true, ancho: 'minmax(80px,0.6fr)' },
  { id: 'seguidas', titulo: 'Faltas seguidas', ordenable: true, ancho: 'minmax(96px,0.8fr)', ocultarEnTablet: true },
  { id: 'ultima', titulo: 'Última vez', ordenable: true, ancho: 'minmax(104px,0.9fr)', ocultarEnTablet: true },
]

function CeldaUnos({ fila }: { readonly fila: FilaPersonaReporte }): ReactElement {
  const c = fila.conexion
  if (!c) return <Nada />
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {(c.unos > 0 || !c.desconectado) && <Cifra>{c.unos}</Cifra>}
      {c.desconectado && (
        <BadgeSistema variante="warning" tamaño="sm">
          Sin 1:1
        </BadgeSistema>
      )}
    </div>
  )
}

function CeldaServicio({ fila }: { readonly fila: FilaPersonaReporte }): ReactElement {
  const servicio = fila.conexion?.servicio
  if (!fila.conexion) return <Nada />
  if (!servicio) return <Nada texto="No sirve" />
  return <CeldaPorcentaje porcentaje={servicio.porcentaje} vacio="Sin fechas" detalle={`${servicio.presentes} de ${servicio.esperadas}`} />
}

function InsigniasPersona({ fila }: { readonly fila: FilaPersonaReporte }): ReactElement | null {
  const insignias: { texto: string; variante: 'info' | 'warning' | 'default' }[] = []
  // The Living Room (A40): the connections first, then the attention tags.
  const c = fila.conexion
  if (c) {
    if (c.unos > 0) insignias.push({ texto: `${c.unos} · 1:1`, variante: 'default' })
    if (c.desconectado) insignias.push({ texto: 'Sin 1:1', variante: 'warning' })
    if (c.servicio) insignias.push({ texto: c.servicio.porcentaje === null ? 'Sirve' : `Sirve ${textoPorcentaje(c.servicio.porcentaje)}`, variante: 'default' })
    if (c.talleres > 0) insignias.push({ texto: plural(c.talleres, 'taller', 'talleres'), variante: 'default' })
  }
  if (fila.antesEn) insignias.push({ texto: `Antes en ${fila.antesEn}`, variante: 'info' })
  if (fila.seguidas) insignias.push({ texto: `Faltó ${fila.ausenciasSeguidas} seguidas`, variante: 'warning' })
  if (fila.baja) insignias.push({ texto: 'Asistencia baja', variante: 'warning' })
  if (fila.sinMarcar) insignias.push({ texto: `${fila.sinMarcar} sin marcar`, variante: 'default' })
  if (insignias.length === 0) return null
  return (
    <>
      {insignias.map((i) => (
        <BadgeSistema key={i.texto} variante={i.variante} tamaño="sm">
          {i.texto}
        </BadgeSistema>
      ))}
    </>
  )
}

export interface ListaPersonasReporteProps {
  readonly filas: readonly FilaPersonaReporte[]
  readonly orden: OrdenPersonasReporte
  readonly hoy: string
  readonly onOrdenar: (orden: OrdenPersonasReporte) => void
  readonly onAbrir: (personaId: string) => void
  readonly vacio: ReactNode
  /** The Living Room with its connections loaded (S21). */
  readonly conConexiones?: boolean
}

export function ListaPersonasReporte({ filas, orden, hoy, onOrdenar, onAbrir, vacio, conConexiones = false }: ListaPersonasReporteProps): ReactElement {
  return (
    <ListaResponsiva
      etiqueta="Asistencia por persona"
      columnas={conConexiones ? COLUMNAS_CONEXIONES : COLUMNAS_PERSONAS}
      filas={filas}
      claveFila={(fila) => fila.personaId}
      orden={ordenLista(orden)}
      onOrdenar={(columna) => onOrdenar(columna as OrdenPersonasReporte)}
      onAbrirFila={(fila) => onAbrir(fila.personaId)}
      etiquetaFila={(fila) => `${conConexiones ? 'Ver las conexiones de' : 'Ver la asistencia de'} ${fila.nombre}`}
      vacio={vacio}
      renderCelda={(fila, columna) => {
        if (conConexiones) {
          switch (columna) {
            case 'nombre': {
              // The Grupo column moves under the name so the three new columns fit (A37).
              const nota = fila.antesEn ? `antes en ${fila.antesEn}` : fila.entro ? fila.entro.replace(/^Entró/, 'entró') : null
              return <Celda titulo={fila.nombre} detalle={[fila.grupo ?? 'Sin grupo', nota].filter(Boolean).join(' · ')} />
            }
            case 'asistencia':
              return <CeldaPorcentaje porcentaje={fila.porcentaje} detalle={`${fila.presentes} de ${fila.reuniones}`} />
            case 'unos':
              return <CeldaUnos fila={fila} />
            case 'servicio':
              return <CeldaServicio fila={fila} />
            case 'talleres':
              return !fila.conexion ? <Nada /> : fila.conexion.talleres ? <Cifra>{fila.conexion.talleres}</Cifra> : <Nada texto="Ninguno" />
          }
        }
        switch (columna) {
          case 'nombre':
            return <Celda titulo={fila.nombre} detalle={fila.entro ?? fila.anioEtiqueta} />
          case 'grupo':
            return (
              <Celda
                peso="medium"
                titulo={fila.grupo ?? 'Sin grupo'}
                detalle={fila.antesEn ? `Antes en ${fila.antesEn}` : fila.lideres.length ? unirY(fila.lideres) : fila.grupo ? 'Sin líder' : null}
              />
            )
          case 'asistencia':
            return <CeldaPorcentaje porcentaje={fila.porcentaje} />
          case 'presentes':
            return (
              <div className="min-w-0">
                <Cifra>
                  {fila.presentes} <small className="text-[13px] text-muted-foreground">de {fila.reuniones}</small>
                </Cifra>
                {fila.sinMarcar > 0 && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{fila.sinMarcar} sin marcar</p>}
              </div>
            )
          case 'seguidas':
            return fila.seguidas ? (
              <BadgeSistema variante="warning" tamaño="sm">
                {fila.ausenciasSeguidas} seguidas
              </BadgeSistema>
            ) : fila.ausenciasSeguidas ? (
              <Cifra>{fila.ausenciasSeguidas}</Cifra>
            ) : (
              <Nada />
            )
          default:
            return fila.ultimaPresente ? <Celda peso="medium" titulo={fechaDia(fila.ultimaPresente)} detalle={haceCuanto(fila.ultimaPresente, hoy)} /> : <Nada texto="Todavía no vino" />
        }
      }}
      renderFilaMovil={(fila) => ({
        titulo: fila.nombre,
        subtitulo: `${fila.grupo ?? 'Sin grupo'} · ${fila.presentes} de ${fila.reuniones}`,
        insignias: <InsigniasPersona fila={fila} />,
        meta: <span className="font-mono text-sm tabular-nums text-foreground">{textoPorcentaje(fila.porcentaje)}</span>,
      })}
    />
  )
}

// ── Desktop: dense tables ─────────────────────────────────────────────

/** The columns «Columnas» can hide, per tab (the name is always on). */
export const COLUMNAS_TABLA_GRUPOS = [
  { id: 'lideres', etiqueta: 'Líderes' },
  { id: 'miembros', etiqueta: 'Miembros' },
  { id: 'reuniones', etiqueta: 'Reuniones' },
  { id: 'promedio', etiqueta: 'Promedio' },
  { id: 'asistencia', etiqueta: 'Asistencia' },
  { id: 'visitantes', etiqueta: 'Visitantes' },
  { id: 'tendencia', etiqueta: 'Tendencia' },
] as const

export const COLUMNAS_TABLA_PERSONAS = [
  { id: 'grupo', etiqueta: 'Grupo' },
  { id: 'asistencia', etiqueta: 'Asistencia' },
  { id: 'presentes', etiqueta: 'Presentes' },
  { id: 'seguidas', etiqueta: 'Faltas seguidas' },
  { id: 'ultima', etiqueta: 'Última vez' },
] as const

export const COLUMNAS_TABLA_CONEXIONES = [
  { id: 'asistencia', etiqueta: 'Asistencia' },
  { id: 'unos', etiqueta: '1:1' },
  { id: 'servicio', etiqueta: 'Servicio' },
  { id: 'talleres', etiqueta: 'Talleres' },
  { id: 'seguidas', etiqueta: 'Faltas seguidas' },
  { id: 'ultima', etiqueta: 'Última vez' },
] as const

const Num = ({ children }: { readonly children: ReactNode }): ReactElement => <span className="font-mono tabular-nums">{children}</span>
const Apagado = ({ children = '—' }: { readonly children?: ReactNode }): ReactElement => <span className="text-muted-foreground">{children}</span>

/** The GR4 cell of a dense row: value, 56px bar and an optional "7 de 8". */
function PorcentajeDenso({ porcentaje, vacio = 'Sin reuniones', detalle }: { readonly porcentaje: number | null; readonly vacio?: string; readonly detalle?: string }): ReactElement {
  if (porcentaje === null) return <Apagado>{vacio}</Apagado>
  const valor = Math.min(100, Math.max(0, Math.round(porcentaje)))
  return (
    <span className="inline-flex items-center gap-2">
      <Num>{valor}%</Num>
      <BarraPorcentaje porcentaje={porcentaje} className="w-14 shrink-0" />
      {detalle && <small className="text-xs text-muted-foreground">{detalle}</small>}
    </span>
  )
}

export interface TablaReporteProps<O extends string> {
  readonly orden: O
  readonly onOrdenar: (orden: O) => void
  readonly onAbrir: (id: string) => void
  readonly seleccionada: string | null
  readonly ocultas: ReadonlySet<string>
  readonly densidad: Densidad
}

function ordenDe<O extends string>(actual: O, id: O, onOrdenar: (orden: O) => void): OrdenColumna {
  return { activo: actual === id, sentido: DESCENDENTES.has(id) ? 'desc' : 'asc', onOrdenar: () => onOrdenar(id) }
}

export function TablaGruposReporte({ filas, orden, onOrdenar, onAbrir, seleccionada, ocultas, densidad }: TablaReporteProps<OrdenGruposReporte> & { readonly filas: readonly FilaGrupoReporte[] }): ReactElement {
  const columnas: readonly ColumnaDensa<FilaGrupoReporte>[] = [
    { id: 'lideres', titulo: 'Líderes', celda: (f) => (f.lideres.length ? unirY(f.lideres) : <span className="font-semibold text-warning-text">Sin líder</span>) },
    { id: 'miembros', titulo: 'Miembros', derecha: true, orden: ordenDe(orden, 'miembros', onOrdenar), celda: (f) => <Num>{f.miembros}</Num> },
    {
      id: 'reuniones',
      titulo: 'Reuniones',
      derecha: true,
      celda: (f) => (
        <>
          <Num>{f.reuniones}</Num>
          {f.sinMarcar > 0 && (
            <BadgeSistema variante="warning" tamaño="sm" className="ml-1.5">
              {`${f.sinMarcar} sin marcar`}
            </BadgeSistema>
          )}
        </>
      ),
    },
    {
      id: 'promedio',
      titulo: 'Promedio',
      derecha: true,
      celda: (f) =>
        f.promedioPresentes === null ? (
          <Apagado />
        ) : (
          <Num>
            {decimal(f.promedioPresentes)} <span className="text-muted-foreground">de {f.miembros}</span>
          </Num>
        ),
    },
    { id: 'asistencia', titulo: 'Asistencia', orden: ordenDe(orden, 'asistencia', onOrdenar), celda: (f) => <PorcentajeDenso porcentaje={f.porcentaje} /> },
    { id: 'visitantes', titulo: 'Visitantes', derecha: true, celda: (f) => (f.visitantes ? <Num>{f.visitantes}</Num> : <Apagado />) },
    { id: 'tendencia', titulo: 'Tendencia', orden: ordenDe(orden, 'tendencia', onOrdenar), celda: (f) => <IndicadorTendencia tendencia={f.tendencia} /> },
  ]
  return (
    <TablaDensa
      etiqueta="Asistencia por grupo"
      describidaPor="reportes-pie"
      primera={{ titulo: 'Grupo', orden: ordenDe(orden, 'anio', onOrdenar), nombre: (f) => f.nombre }}
      columnas={columnas.filter((c) => !ocultas.has(c.id))}
      secciones={[{ id: 'grupos', titulo: '', filas }]}
      claveFila={(f) => f.grupoId}
      onAbrir={(f) => onAbrir(f.grupoId)}
      etiquetaFila={(f) => `Abrir ${f.nombre}`}
      seleccionada={seleccionada}
      densidad={densidad}
    />
  )
}

export function TablaPersonasReporte({
  filas,
  orden,
  hoy,
  onOrdenar,
  onAbrir,
  seleccionada,
  ocultas,
  densidad,
  conConexiones = false,
}: TablaReporteProps<OrdenPersonasReporte> & { readonly filas: readonly FilaPersonaReporte[]; readonly hoy: string; readonly conConexiones?: boolean }): ReactElement {
  const o = (id: OrdenPersonasReporte): OrdenColumna => ordenDe(orden, id, onOrdenar)
  const ultima: ColumnaDensa<FilaPersonaReporte> = {
    id: 'ultima',
    titulo: 'Última vez',
    orden: o('ultima'),
    celda: (f) =>
      f.ultimaPresente ? (
        <>
          <Num>{fechaDia(f.ultimaPresente)}</Num> <small className="text-xs text-muted-foreground">· {haceCuanto(f.ultimaPresente, hoy)}</small>
        </>
      ) : (
        <Apagado>Todavía no vino</Apagado>
      ),
  }
  const seguidas: ColumnaDensa<FilaPersonaReporte> = {
    id: 'seguidas',
    titulo: 'Faltas seguidas',
    derecha: true,
    orden: o('seguidas'),
    celda: (f) =>
      f.seguidas ? (
        <BadgeSistema variante="warning" tamaño="sm">
          {`${f.ausenciasSeguidas} seguidas`}
        </BadgeSistema>
      ) : (
        <Num>{f.ausenciasSeguidas}</Num>
      ),
  }
  const columnas: readonly ColumnaDensa<FilaPersonaReporte>[] = conConexiones
    ? [
        { id: 'asistencia', titulo: 'Asistencia', orden: o('asistencia'), celda: (f) => <PorcentajeDenso porcentaje={f.porcentaje} detalle={`${f.presentes} de ${f.reuniones}`} /> },
        {
          id: 'unos',
          titulo: '1:1',
          derecha: true,
          orden: o('unos'),
          celda: (f) =>
            !f.conexion ? (
              <Apagado />
            ) : f.conexion.desconectado && f.conexion.unos === 0 ? (
              <BadgeSistema variante="warning" tamaño="sm">
                Sin 1:1
              </BadgeSistema>
            ) : (
              <>
                <Num>{f.conexion.unos}</Num>
                {f.conexion.desconectado && (
                  <BadgeSistema variante="warning" tamaño="sm" className="ml-1.5">
                    Sin 1:1
                  </BadgeSistema>
                )}
              </>
            ),
        },
        {
          id: 'servicio',
          titulo: 'Servicio',
          orden: o('servicio'),
          celda: (f) =>
            !f.conexion ? (
              <Apagado />
            ) : !f.conexion.servicio ? (
              <Apagado>No sirve</Apagado>
            ) : (
              <PorcentajeDenso porcentaje={f.conexion.servicio.porcentaje} vacio="Sin fechas" detalle={`${f.conexion.servicio.presentes} de ${f.conexion.servicio.esperadas}`} />
            ),
        },
        {
          id: 'talleres',
          titulo: 'Talleres',
          derecha: true,
          orden: o('talleres'),
          celda: (f) => (!f.conexion ? <Apagado /> : f.conexion.talleres ? <Num>{f.conexion.talleres}</Num> : <Apagado>Ninguno</Apagado>),
        },
        seguidas,
        ultima,
      ]
    : [
        {
          id: 'grupo',
          titulo: 'Grupo',
          orden: o('grupo'),
          celda: (f) => (
            <>
              {f.grupo ?? 'Sin grupo'}
              {(f.antesEn || f.grupo) && <span className="text-muted-foreground"> · </span>}
              {f.antesEn ? (
                <span className="text-muted-foreground">{`Antes en ${f.antesEn}`}</span>
              ) : f.grupo ? (
                <span className={f.lideres.length ? 'text-muted-foreground' : 'text-warning-text'}>{f.lideres.length ? unirY(f.lideres) : 'Sin líder'}</span>
              ) : null}
            </>
          ),
        },
        { id: 'asistencia', titulo: 'Asistencia', orden: o('asistencia'), celda: (f) => (f.reuniones ? <PorcentajeDenso porcentaje={f.porcentaje} /> : <Apagado>Todavía no vino</Apagado>) },
        {
          id: 'presentes',
          titulo: 'Presentes',
          derecha: true,
          celda: (f) => (
            <>
              <Num>
                {f.presentes} de {f.reuniones}
              </Num>
              {f.sinMarcar > 0 && <small className="text-xs text-muted-foreground"> · {f.sinMarcar} sin marcar</small>}
            </>
          ),
        },
        seguidas,
        ultima,
      ]
  return (
    <TablaDensa
      etiqueta="Asistencia por persona"
      describidaPor="reportes-pie"
      primera={{
        titulo: 'Nombre',
        orden: o('nombre'),
        nombre: (f) => f.nombre,
        ancho: 'min-w-[210px]',
        // The Living Room: the group under the name (D8); elsewhere, when they joined, after it.
        debajo: conConexiones ? (f) => [f.grupo ?? 'Sin grupo', f.antesEn ? `antes en ${f.antesEn}` : f.entro?.replace(/^Entró/, 'entró')].filter(Boolean).join(' · ') : undefined,
        despues: conConexiones ? undefined : (f) => (f.entro ? `· ${f.entro.replace(/^Entró/, 'entró')}` : null),
      }}
      columnas={columnas.filter((c) => !ocultas.has(c.id))}
      secciones={[{ id: 'personas', titulo: '', filas }]}
      claveFila={(f) => f.personaId}
      onAbrir={(f) => onAbrir(f.personaId)}
      etiquetaFila={(f) => `${conConexiones ? 'Ver las conexiones de' : 'Ver la asistencia de'} ${f.nombre}`}
      seleccionada={seleccionada}
      densidad={densidad}
      filaAlta={conConexiones}
    />
  )
}
