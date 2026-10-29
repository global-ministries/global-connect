'use client'

/**
 * Mi equipo — the "Personas" tab (prototype `#panel-personas`): the toolbar
 * (search by name or phone, Filtros with its count, Por persona / Por
 * servicio), the attention metrics that act as filters (S11 decisions 2 and
 * 4: "Por activar" replaces the pending strip), the scope cards of the next
 * level (hidden at a leaf), and the list with its active-filter chips and
 * footer. Every number follows the scope and the filters
 * (calcularVistaMiEquipo).
 */
import type { ReactElement, ReactNode } from 'react'

import { BarraHerramientas, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { MetricasAtencion, type MetricaAtencion } from '@/components/ui/metricas-atencion'
import {
  LIMPIAR_FILTROS_MI_EQUIPO,
  parcheAtencionMiEquipo,
  type FiltrosMiEquipo,
  type MetricaMiEquipoId,
  type TurnoMiEquipo,
  type VistaMiEquipo,
} from '@/lib/platform/dream-team/mi-equipo-filtros'

import { OPCIONES_VISTA_MI_EQUIPO } from './filtros-mi-equipo'
import { ListaMiEquipo } from './lista-mi-equipo'
import { TarjetasAlcance, etiquetaNivelMiEquipo } from './tarjetas-alcance'

/** The four attention metrics of the prototype, with its hints. */
export function metricasMiEquipo({ atencion }: VistaMiEquipo): MetricaAtencion[] {
  const porcentaje = atencion.total > 0 ? Math.round((atencion.sirviendo.personas / atencion.total) * 100) : 0
  const metrica = (id: MetricaMiEquipoId, etiqueta: string, tono: MetricaAtencion['tono'], pista: string): MetricaAtencion => ({
    id,
    etiqueta,
    valor: atencion[id].personas,
    total: atencion.total,
    pista,
    tono,
    activa: atencion[id].activo,
  })
  return [
    metrica('sirviendo', 'Sirviendo', 'success', `${porcentaje}% del equipo`),
    metrica('porActivar', 'Por activar', 'info', 'esperan que los actives'),
    metrica('sinCuenta', 'Sin cuenta', 'warning', 'invitalos a la plataforma'),
    metrica('sinTurno', 'Sin turno', 'danger', 'no saben cuándo sirven'),
  ]
}

const CLASE_SECCION = 'px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0'

export interface PersonasMiEquipoProps {
  readonly vista: VistaMiEquipo
  readonly turnos: readonly TurnoMiEquipo[]
  readonly hoy: string
  readonly onCambio: (parche: Partial<FiltrosMiEquipo>) => void
  readonly onAbrirFiltros: () => void
  readonly onAbrirPersona: (personaId: string) => void
  readonly vacio: ReactNode
}

export function PersonasMiEquipo({
  vista,
  turnos,
  hoy,
  onCambio,
  onAbrirFiltros,
  onAbrirPersona,
  vacio,
}: PersonasMiEquipoProps): ReactElement {
  const { filtros, tarjetas } = vista
  const nivel = etiquetaNivelMiEquipo(tarjetas)
  const hayPersonas = vista.visibles.length > 0

  return (
    <div className="space-y-6">
      <BarraHerramientas
        busqueda={{
          valor: filtros.q,
          onCambio: (q) => onCambio({ q }),
          placeholder: 'Buscar por nombre o teléfono',
          etiqueta: 'Buscar en tu equipo',
        }}
        filtrosActivos={vista.filtrosActivos}
        onAbrirFiltros={onAbrirFiltros}
        vista={
          <ControlSegmentado
            etiqueta="Vista"
            opciones={OPCIONES_VISTA_MI_EQUIPO}
            valor={filtros.vista}
            onCambio={(valor) => onCambio({ vista: valor })}
          />
        }
      />

      <MetricasAtencion
        etiqueta="Necesitan atención"
        metricas={metricasMiEquipo(vista)}
        onAlternar={(id) => onCambio(parcheAtencionMiEquipo(filtros, id as MetricaMiEquipoId))}
      />

      {tarjetas.length > 0 && (
        <section aria-labelledby="mi-equipo-alcance" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="mi-equipo-alcance" className={CLASE_SECCION}>
              {nivel}
            </h2>
            <span className="hidden text-xs text-muted-foreground md:inline">
              {nivel === 'Equipos' ? 'Tocá un equipo para ver su gente' : 'Tocá para entrar'}
            </span>
          </div>
          <TarjetasAlcance vista={vista} onEntrar={(id) => onCambio({ nivel: id })} />
        </section>
      )}

      <section aria-labelledby="mi-equipo-lista" className="space-y-3">
        <h2 id="mi-equipo-lista" className={CLASE_SECCION}>
          {filtros.vista === 'persona' ? 'Personas' : 'Servicios'}
        </h2>
        <ChipsFiltrosActivos
          chips={vista.pastillas.map((pastilla) => ({ id: pastilla.clave, etiqueta: pastilla.etiqueta }))}
          onQuitar={(clave) => {
            const pastilla = vista.pastillas.find((p) => p.clave === clave)
            if (pastilla) onCambio(pastilla.parche)
          }}
          onLimpiarTodo={() => onCambio(LIMPIAR_FILTROS_MI_EQUIPO)}
        />
        <ListaMiEquipo vista={vista} turnos={turnos} hoy={hoy} onAbrir={onAbrirPersona} vacio={vacio} />
        {hayPersonas && (
          <p role="status" className="px-1 font-mono text-sm tabular-nums text-muted-foreground">
            {vista.pie}
          </p>
        )}
      </section>
    </div>
  )
}
