'use client'

/**
 * The ficha's Asistencia tab (S13 of odd/tasks/sistema-diseno-v2.md, approved
 * as in docs/design-system/prototipos/usuarios/03-ficha-escritorio.html): the
 * PERSON's own attendance. A selector with only the kinds that have records
 * (Grupos de Vida · Estudiantes · Talleres), the Desde/Hasta range, KPIs, a
 * card per group ("Todos los grupos" when there are several), the leader
 * callout, the 4-week rolling curve with its week strip, and the historial.
 * Talleres show "N de M sesiones" cards (or the sesiones attended in the
 * period when the range cuts the taller) and no curve. Presente is yes/no.
 */
import { BarChart3, Lock } from 'lucide-react'
import { useState, type FormEvent, type ReactElement } from 'react'

import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import type { AsistenciaPersona, TipoAsistencia } from '@/lib/platform/usuarios/asistencia-persona'
import {
  ETIQUETA_TIPO,
  TODOS_LOS_GRUPOS,
  gruposDeSeleccion,
  gruposDeTipo,
  gruposQueLidera,
  historialAsistencia,
  kpisAsistencia,
  detalleSemanal,
  semanasHasta,
  serieDeDetalle,
  tendencia4,
  tiposConRegistros,
} from '@/lib/platform/usuarios/asistencia-vista'
import { fechaCorta } from '@/lib/platform/usuarios/fechas'

import { CurvaAsistencia } from './curva-asistencia'
import { ChipTendencia, Historial, Kpis, ListaTarjetas, LlamadaLider, TarjetaGrupo, TarjetaTaller, TarjetaTodos } from './partes-asistencia'
import { TarjetaFicha } from './partes-ficha'

const FILAS_HISTORIAL = 8
const MS_SEMANA = 7 * 86_400_000

/** Weeks the range spans (1–53), so the curve covers Desde → Hasta. */
function semanasDelRango(desde: string, hasta: string): number {
  const d = Date.parse(`${desde}T00:00:00Z`)
  const h = Date.parse(`${hasta}T00:00:00Z`)
  if (Number.isNaN(d) || Number.isNaN(h) || h < d) return 12
  return Math.min(53, Math.max(1, Math.ceil((h - d + 86_400_000) / MS_SEMANA)))
}

export interface PestanaAsistenciaProps {
  /** First name, for "Asistencia de Ana a …". */
  readonly nombre: string
  /** null: the viewer may not see this person's attendance. */
  readonly asistencia: AsistenciaPersona | null
  readonly onCambiarRango: (desde: string, hasta: string) => void
}

function Rango({ asistencia, onCambiarRango }: Omit<PestanaAsistenciaProps, 'nombre' | 'asistencia'> & { asistencia: AsistenciaPersona }): ReactElement {
  const [desde, setDesde] = useState(asistencia.desde)
  const [hasta, setHasta] = useState(asistencia.hasta)
  const aplicar = (e: FormEvent) => {
    e.preventDefault()
    onCambiarRango(desde, hasta)
  }
  return (
    <form onSubmit={aplicar} className="flex flex-wrap items-end gap-2.5">
      <div className="min-w-0 flex-[1_1_140px] md:flex-[0_1_200px]">
        <InputSistema label="Desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div className="min-w-0 flex-[1_1_140px] md:flex-[0_1_200px]">
        <InputSistema label="Hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <BotonSistema type="submit" variante="outline">Aplicar</BotonSistema>
    </form>
  )
}

export function PestanaAsistencia({ nombre, asistencia, onCambiarRango }: PestanaAsistenciaProps): ReactElement {
  const tipos = asistencia ? tiposConRegistros(asistencia) : []
  const [tipoElegido, setTipo] = useState<TipoAsistencia | null>(null)
  const [seleccion, setSeleccion] = useState<string>(TODOS_LOS_GRUPOS)

  if (!asistencia) {
    return (
      <TarjetaFicha titulo="Asistencia">
        <EstadoVacioSistema icono={Lock} titulo="No puedes ver esta asistencia" subtitulo="La ven la persona, sus líderes, su familia y los responsables de su campus." className="py-7" />
      </TarjetaFicha>
    )
  }
  const rango = <Rango key={`${asistencia.desde}-${asistencia.hasta}`} asistencia={asistencia} onCambiarRango={onCambiarRango} />
  if (tipos.length === 0) {
    return (
      <div className="grid gap-4">
        {rango}
        <TarjetaFicha titulo="Asistencia">
          <EstadoVacioSistema
            icono={BarChart3}
            titulo="Sin registros de asistencia"
            subtitulo="Aparecerán cuando participe en un Grupo de Vida, un grupo de Estudiantes o un taller."
            className="py-7"
          />
        </TarjetaFicha>
      </div>
    )
  }

  const tipo = tipoElegido && tipos.includes(tipoElegido) ? tipoElegido : tipos[0]
  const grupos = gruposDeTipo(asistencia, tipo)
  const cambiarTipo = (t: TipoAsistencia) => {
    setTipo(t)
    setSeleccion(TODOS_LOS_GRUPOS)
  }
  const selector =
    tipos.length > 1 ? (
      <ControlSegmentado
        etiqueta="Tipo de asistencia"
        opciones={tipos.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO[t] }))}
        valor={tipo}
        onCambio={cambiarTipo}
        className="justify-self-start"
      />
    ) : null

  if (tipo === 'talleres') {
    const k = kpisAsistencia(grupos)
    return (
      <div className="grid gap-4">
        {selector}
        {rango}
        <p className="text-[13px] text-muted-foreground">{`Asistencia de ${nombre} a las sesiones de sus talleres.`}</p>
        <Kpis
          items={[
            { etiqueta: 'Asistencia', valor: k.porcentaje === null ? '—' : `${k.porcentaje}%` },
            { etiqueta: 'Talleres', valor: String(k.grupos) },
            { etiqueta: 'Sesiones', valor: String(k.reuniones) },
            { etiqueta: 'Última sesión', valor: k.ultimaReunion ? fechaCorta(k.ultimaReunion) : '—', numero: false },
          ]}
        />
        <ListaTarjetas etiqueta="Asistencia por taller">
          {grupos.map((g) => (
            <TarjetaTaller key={g.id} taller={g} />
          ))}
        </ListaTarjetas>
        <TarjetaFicha titulo="Historial">
          {/* A finished taller is not a group the person left: no "· pasado". */}
          <Historial filas={historialAsistencia(grupos, FILAS_HISTORIAL).map((f) => ({ ...f, pasado: false }))} />
        </TarjetaFicha>
      </div>
    )
  }

  const elegidos = gruposDeSeleccion(grupos, seleccion)
  const seleccionado = elegidos.length === 1 && grupos.length > 1 ? elegidos[0] : null
  const semanas = semanasHasta(asistencia.hasta, semanasDelRango(asistencia.desde, asistencia.hasta))
  const detalle = detalleSemanal(elegidos, semanas)
  const serie = serieDeDetalle(detalle)
  const tendencia = tendencia4(serie)
  const k = kpisAsistencia(elegidos)
  const lidera = gruposQueLidera(grupos)
  const que = tipo === 'estudiantes' ? 'sus grupos de Estudiantes' : 'sus Grupos de Vida'
  const historial = historialAsistencia(elegidos, FILAS_HISTORIAL)

  return (
    <div className="grid gap-4">
      {selector}
      {rango}
      <p className="text-[13px] text-muted-foreground">
        {`Asistencia de ${nombre} a ${que}, actuales y pasados, en el período.${lidera.length ? ' Como líder, cuenta su propia presencia.' : ''}`}
      </p>
      <Kpis
        items={[
          { etiqueta: 'Asistencia', valor: k.porcentaje === null ? '—' : `${k.porcentaje}%` },
          { etiqueta: 'Grupos en el período', valor: String(grupos.length) },
          { etiqueta: 'Reuniones', valor: String(k.reuniones) },
          { etiqueta: 'Última asistencia', valor: k.ultimaAsistencia ? fechaCorta(k.ultimaAsistencia) : '—', numero: false },
        ]}
      />
      <ListaTarjetas etiqueta="Asistencia por grupo">
        {grupos.length > 1 && (
          <TarjetaTodos total={grupos.length} pulsada={seleccionado === null} onPulsar={() => setSeleccion(TODOS_LOS_GRUPOS)} />
        )}
        {grupos.map((g) => (
          <TarjetaGrupo
            key={g.id}
            grupo={g}
            pulsada={seleccionado?.id === g.id}
            onPulsar={() => setSeleccion(g.id)}
          />
        ))}
      </ListaTarjetas>
      {lidera.map((g) => (
        <LlamadaLider key={g.id} grupo={g} />
      ))}
      <TarjetaFicha
        titulo={seleccionado ? `Asistencia en ${seleccionado.nombre}` : 'Asistencia por semana'}
        accion={tendencia ? <ChipTendencia tendencia={tendencia} /> : undefined}
      >
        {serie.some((v) => v !== null) ? (
          <CurvaAsistencia detalle={detalle} semanas={semanas} />
        ) : (
          <EstadoVacioSistema icono={BarChart3} titulo="Sin reuniones en el período" subtitulo="Cambia el rango de fechas o el grupo." className="py-7" />
        )}
      </TarjetaFicha>
      <TarjetaFicha titulo="Historial">
        {historial.length ? (
          <Historial filas={historial} />
        ) : (
          <EstadoVacioSistema icono={BarChart3} titulo="Sin reuniones" subtitulo="No hay reuniones en el período." className="py-7" />
        )}
      </TarjetaFicha>
    </div>
  )
}
