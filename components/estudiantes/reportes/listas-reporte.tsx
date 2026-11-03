'use client'

/**
 * Estudiantes › Reportes — the Grupos and Personas lists (artboards 11 / 12):
 * one `ListaResponsiva` each, table from md, inset rows on phones; every row
 * opens its read-only drawer.
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

import { CeldaPorcentaje, IndicadorTendencia } from './partes-reportes'

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
