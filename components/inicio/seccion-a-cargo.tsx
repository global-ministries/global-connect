/**
 * «A tu cargo» (design/home-por-rol section 4; odd/tasks/home-por-rol.md T4,
 * S5–S7): one section per cargo, in the order decidirSecciones returns them.
 * Each one: a card with the name, one line of counts and its actions, the
 * metrics, then its lists (phone: inset lists one under the other; from lg
 * side by side). A cargo whose data did not load is not shown.
 *
 * - Líder: «Grupo que lidero», «Pasar asistencia», Miembros · Asistencia ·
 *   Ausentes · Nuevos and «Atención» (absent 3+ weeks). Birthdays have their
 *   own section (seccion-cumpleanos).
 * - Directora de etapa / director general: their etapa or segmento only,
 *   Grupos · Asistencia · En riesgo · Sin reporte, and the groups that need
 *   attention or the etapas of the segmento (S7: never the campus).
 * - Director de área: Activos · Postulados · En orientación · Sin turno and
 *   «Próximo Paso de tus voluntarios» (S5).
 *
 * Server-safe; only the Próximo Paso list is a client component.
 */
import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, ClipboardList, Users } from 'lucide-react'

import type { TonoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { semanaAnterior, UMBRAL_RIESGO, type DatosArea, type DatosCargo, type DatosEtapa, type DatosGrupoLider, type DatosSegmento, type GrupoAlcance, type ResumenGrupos } from '@/lib/inicio/cargar-a-cargo'
import { cn } from '@/lib/utils'

import { ListaFilas, type FilaInicio } from './lista-filas'
import { ListaProximoPaso } from './lista-proximo-paso'
import { MetricasInicio, type MetricaInicio } from './metricas-inicio'
import { EncabezadoSeccion, EnlaceSeccion, Numero } from './partes-inicio'
import {
  fechaCorta,
  hora12,
  ID_PROXIMO_PASO_VOLUNTARIOS,
  listaNombres,
  RUTA_MI_EQUIPO,
  RUTA_REPORTE_SEMANAL,
  RUTA_TABLERO_GRUPOS,
  rutaAsistenciaGrupo,
  rutaGrupo,
  rutaSaludGrupo,
} from './textos-inicio'

const MAX_FILAS = 5
const MAX_NOMBRES = 3

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** «Ana, Luis y Rosa» or «Ana, Luis, Rosa y 2 más». */
function algunosNombres(nombres: string[]): string {
  if (nombres.length <= MAX_NOMBRES) return listaNombres(nombres)
  return `${nombres.slice(0, MAX_NOMBRES).join(', ')} y ${nombres.length - MAX_NOMBRES} más`
}

const tonoAsistencia = (pct: number | null): TonoEstado => (pct === null ? 'muted' : pct < UMBRAL_RIESGO ? 'danger' : pct < 70 ? 'warning' : 'success')

/** The counts line under the card's name, numbers in mono. */
function Conteos({ partes }: { readonly partes: [number, string, string][] }): ReactElement {
  return (
    <p className="mt-0.5 text-sm text-muted-foreground">
      {partes.map(([n, uno, varios], i) => (
        <span key={uno}>
          {i > 0 && ' · '}
          <Numero>{n}</Numero> {n === 1 ? uno : varios}
        </span>
      ))}
    </p>
  )
}

type Accion = { texto: string; href: string }

function Bloque({
  id,
  titulo,
  enlace,
  nombre,
  linea,
  acciones = [],
  metricas,
  listas,
  className,
}: {
  readonly id: string
  readonly titulo: string
  readonly enlace: Accion
  readonly nombre: string
  readonly linea: ReactNode
  readonly acciones?: Accion[]
  readonly metricas: MetricaInicio[]
  readonly listas: ReactNode[]
  readonly className?: string
}): ReactElement {
  const conListas = listas.filter(Boolean)
  return (
    <section aria-labelledby={id} className={className}>
      <EncabezadoSeccion id={id} titulo={titulo}>
        <EnlaceSeccion href={enlace.href}>{enlace.texto}</EnlaceSeccion>
      </EncabezadoSeccion>
      <div className="grid gap-2.5 md:gap-3">
        <TarjetaSistema className="p-4 md:p-5">
          <h3 className="text-[17px] font-semibold leading-tight tracking-[-0.01em] text-foreground">{nombre}</h3>
          {linea}
          {acciones.length > 0 && (
            <div className={cn('mt-3.5 grid gap-2.5 sm:flex', acciones.length > 1 && 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
              {acciones.map((a, i) => (
                <BotonSistema key={a.href} asChild variante={i === 0 ? 'primario' : 'outline'}>
                  <Link href={a.href}>{a.texto}</Link>
                </BotonSistema>
              ))}
            </div>
          )}
        </TarjetaSistema>
        <MetricasInicio metricas={metricas} etiqueta={`Métricas de ${nombre}`} />
      </div>
      {conListas.length > 0 && <div className={cn('mt-3.5 grid gap-3.5', conListas.length > 1 && 'lg:grid-cols-2')}>{conListas}</div>}
    </section>
  )
}

function BloqueGrupoLider({ d, className }: { readonly d: DatosGrupoLider; readonly className?: string }): ReactElement {
  const nombre = d.nombre ?? 'Tu grupo'
  const r = d.proximaReunion
  const atencion: FilaInicio[] =
    d.ausentes && d.ausentes.length > 0
      ? [{ clave: 'ausentes', titulo: `${plural(d.ausentes.length, 'falta', 'faltan')} hace 3 semanas o más`, detalle: algunosNombres(d.ausentes), icono: AlertTriangle, tono: 'danger', href: rutaSaludGrupo(d.grupoId) }]
      : []
  const miembros = d.miembros ?? undefined
  return (
    <Bloque
      id={`inicio-cargo-grupo-${d.grupoId}`}
      titulo="Grupo que lidero"
      enlace={{ texto: 'Ver grupo', href: rutaGrupo(d.grupoId) }}
      nombre={nombre}
      linea={
        r && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            Próxima reunión: {fechaCorta(r.fecha)}
            {r.hora && (
              <>
                {' · '}
                <Numero>{hora12(r.hora)}</Numero>
              </>
            )}
            {d.lugar && ` · ${d.lugar}`}
          </p>
        )
      }
      acciones={[{ texto: 'Pasar asistencia', href: rutaAsistenciaGrupo(d.grupoId) }]}
      metricas={[
        { id: 'miembros', etiqueta: 'Miembros', valor: d.miembros, tono: 'muted' },
        {
          id: 'asistencia',
          etiqueta: 'Asistencia',
          valor: d.ultimaReunion?.asistencia ?? null,
          sufijo: '%',
          total: 100,
          tono: tonoAsistencia(d.ultimaReunion?.asistencia ?? null),
          pista: d.ultimaReunion ? fechaCorta(d.ultimaReunion.fecha) : undefined,
        },
        { id: 'ausentes', etiqueta: 'Ausentes', valor: d.ausentes?.length ?? null, total: miembros, tono: d.ausentes?.length ? 'danger' : 'success', pista: '3 semanas o más' },
        { id: 'nuevos', etiqueta: 'Nuevos', valor: d.nuevos, total: miembros, tono: 'info', pista: 'Últimos 30 días' },
      ]}
      listas={[atencion.length > 0 && <ListaFilas key="atencion" id={`inicio-cargo-grupo-${d.grupoId}-atencion`} titulo="Atención" filas={atencion} />]}
      className={className}
    />
  )
}

function metricasAlcance(r: ResumenGrupos, semana: string): MetricaInicio[] {
  const reportaron = r.grupos.length - r.sinReporte
  return [
    { id: 'grupos', etiqueta: 'Grupos', valor: r.grupos.length, total: r.grupos.length, tono: 'success', pista: `${reportaron} ${reportaron === 1 ? 'reportó' : 'reportaron'}` },
    { id: 'asistencia', etiqueta: 'Asistencia', valor: r.asistencia, sufijo: '%', total: 100, tono: tonoAsistencia(r.asistencia), pista: semana },
    { id: 'en-riesgo', etiqueta: 'En riesgo', valor: r.enRiesgo, total: r.grupos.length, tono: r.enRiesgo > 0 ? 'danger' : 'success', pista: `Bajo ${UMBRAL_RIESGO}% la semana pasada` },
    { id: 'sin-reporte', etiqueta: 'Sin reporte', valor: r.sinReporte, total: r.grupos.length, tono: r.sinReporte > 0 ? 'danger' : 'success', pista: 'La semana pasada' },
  ]
}

/** En riesgo first (lowest attendance first), then those without report. */
function gruposConAtencion(grupos: GrupoAlcance[]): FilaInicio[] {
  const enRiesgo = grupos.filter((g) => g.asistencia !== null && g.asistencia < UMBRAL_RIESGO).sort((a, b) => (a.asistencia as number) - (b.asistencia as number))
  const sinReporte = grupos.filter((g) => !g.reporto)
  return [...enRiesgo, ...sinReporte].slice(0, MAX_FILAS).map((g) => {
    const riesgo = g.reporto
    return {
      clave: g.grupoId,
      titulo: g.nombre ?? 'Grupo sin nombre',
      detalle: g.lideres.length > 0 ? `${g.lideres.length === 1 ? 'Líder' : 'Líderes'}: ${listaNombres(g.lideres)}` : 'Sin líder asignado',
      icono: riesgo ? AlertTriangle : ClipboardList,
      tono: riesgo ? 'danger' : 'warning',
      estado: riesgo ? { etiqueta: 'En riesgo', tono: 'danger' } : { etiqueta: 'Sin reporte', tono: 'warning' },
      porcentaje: g.asistencia,
      href: rutaGrupo(g.grupoId),
    }
  })
}

function BloqueEtapa({ d, semana, className }: { readonly d: DatosEtapa; readonly semana: string; readonly className?: string }): ReactElement {
  const nombre = d.nombre ?? 'Tu etapa'
  const filas = gruposConAtencion(d.grupos)
  return (
    <Bloque
      id={`inicio-cargo-etapa-${d.directorEtapaId}`}
      titulo={d.nombre ? `Mi etapa · ${d.nombre}` : 'Mi etapa'}
      enlace={{ texto: 'Ver etapa', href: '/grupos-vida' }}
      nombre={nombre}
      linea={<Conteos partes={[[d.grupos.length, 'grupo', 'grupos'], ...(d.personas !== null ? [[d.personas, 'persona', 'personas'] as [number, string, string]] : [])]} />}
      acciones={[
        { texto: 'Abrir tablero de la etapa', href: RUTA_TABLERO_GRUPOS },
        { texto: 'Reportes', href: RUTA_REPORTE_SEMANAL },
      ]}
      metricas={metricasAlcance(d, semana)}
      listas={[
        filas.length > 0 && (
          <ListaFilas key="atencion" id={`inicio-cargo-etapa-${d.directorEtapaId}-atencion`} titulo="Grupos que necesitan atención" filas={filas} enlace={{ texto: 'Ver todos', href: '/grupos-vida' }} />
        ),
      ]}
      className={className}
    />
  )
}

function estadoEtapa(e: ResumenGrupos): { etiqueta: string; tono: TonoEstado } {
  if (e.enRiesgo > 0) return { etiqueta: `${e.enRiesgo} en riesgo`, tono: 'danger' }
  if (e.sinReporte > 0) return { etiqueta: `${e.sinReporte} sin reporte`, tono: 'warning' }
  return { etiqueta: 'Al día', tono: 'success' }
}

function BloqueSegmento({ d, semana, className }: { readonly d: DatosSegmento; readonly semana: string; readonly className?: string }): ReactElement {
  const nombre = d.nombre ?? 'Tu segmento'
  const etapas: FilaInicio[] = d.etapas.map((e) => ({
    clave: e.directorEtapaId,
    titulo: e.directores.length > 0 ? listaNombres(e.directores) : 'Etapa sin director',
    detalle: plural(e.grupos.length, 'grupo', 'grupos'),
    icono: Users,
    estado: estadoEtapa(e),
    porcentaje: e.asistencia,
  }))
  return (
    <Bloque
      id={`inicio-cargo-segmento-${d.segmentoId}`}
      titulo={d.nombre ? `Mi segmento · ${d.nombre}` : 'Mi segmento'}
      enlace={{ texto: 'Ver segmento', href: '/grupos-vida' }}
      nombre={nombre}
      linea={
        <Conteos
          partes={[
            [d.etapas.length, 'etapa', 'etapas'],
            [d.grupos.length, 'grupo', 'grupos'],
            ...(d.personas !== null ? [[d.personas, 'persona', 'personas'] as [number, string, string]] : []),
          ]}
        />
      }
      acciones={[
        { texto: 'Abrir tablero del segmento', href: RUTA_TABLERO_GRUPOS },
        { texto: 'Reportes', href: RUTA_REPORTE_SEMANAL },
      ]}
      metricas={metricasAlcance(d, semana)}
      listas={[etapas.length > 0 && <ListaFilas key="etapas" id={`inicio-cargo-segmento-${d.segmentoId}-etapas`} titulo="Etapas" filas={etapas} />]}
      className={className}
    />
  )
}

function BloqueArea({ d, primera, className }: { readonly d: DatosArea; readonly primera: boolean; readonly className?: string }): ReactElement {
  const nombre = d.nombre ?? 'Tu área'
  const metricas: MetricaInicio[] = [
    { id: 'activos', etiqueta: 'Activos', valor: d.activos, tono: 'success' },
    { id: 'postulados', etiqueta: 'Postulados', valor: d.postulados, tono: d.postulados > 0 ? 'warning' : 'muted', pista: 'Por orientar' },
    { id: 'orientacion', etiqueta: 'En orientación', valor: d.enOrientacion, tono: 'info' },
    ...(d.sinTurno !== null ? [{ id: 'sin-turno', etiqueta: 'Sin turno', valor: d.sinTurno, tono: d.sinTurno > 0 ? 'danger' : 'success', pista: 'Activos sin turno' } as MetricaInicio] : []),
  ]
  return (
    <Bloque
      id={`inicio-cargo-area-${d.equipoId}`}
      titulo={`Mi equipo · ${nombre}`}
      enlace={{ texto: 'Mi equipo', href: RUTA_MI_EQUIPO }}
      nombre={nombre}
      linea={<Conteos partes={[[d.activos, 'servidor activo', 'servidores activos']]} />}
      metricas={metricas}
      listas={[
        d.sinProximoPaso.length > 0 && (
          <ListaProximoPaso
            key="proximo-paso"
            id={`inicio-cargo-area-${d.equipoId}-proximo-paso`}
            ancla={primera ? ID_PROXIMO_PASO_VOLUNTARIOS : undefined}
            voluntarios={d.sinProximoPaso}
          />
        ),
      ]}
      className={className}
    />
  )
}

/** «Semana del 2 nov»: the week the etapa and segmento numbers read. */
function etiquetaSemana(hoy: string): string {
  return `Semana del ${fechaCorta(semanaAnterior(hoy).desde).split(' ').slice(1).join(' ')}`
}

export function SeccionesACargo({ datos, hoy, className }: { readonly datos: readonly (DatosCargo | null)[]; readonly hoy: string; readonly className?: string }): ReactElement {
  const semana = etiquetaSemana(hoy)
  const primeraArea = datos.find((d) => d?.tipo === 'area-dream-team' && d.sinProximoPaso.length > 0)
  return (
    <>
      {datos.map((d) => {
        if (!d) return null
        switch (d.tipo) {
          case 'grupo-lider':
            return <BloqueGrupoLider key={`grupo-${d.grupoId}`} d={d} className={className} />
          case 'etapa':
            return <BloqueEtapa key={`etapa-${d.directorEtapaId}`} d={d} semana={semana} className={className} />
          case 'segmento':
            return <BloqueSegmento key={`segmento-${d.segmentoId}`} d={d} semana={semana} className={className} />
          case 'area-dream-team':
            return <BloqueArea key={`area-${d.equipoId}`} d={d} primera={d === primeraArea} className={className} />
        }
      })}
    </>
  )
}
