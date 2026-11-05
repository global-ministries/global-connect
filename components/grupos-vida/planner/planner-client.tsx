'use client'

/**
 * Planner — client island of /grupos-vida/planificar (T5a of
 * odd/tasks/planner-gdv.md; artboards 01, 03 and 08 of design/planner-gdv;
 * S1, S4, S5, S7, S9–S11, S16, S17, S21). Moving people, creating and
 * deleting groups, applying a localidad suggestion, undoing and "Terminé mi
 * segmento" are saved steps (T5b, pasos-planner.tsx): the board shows a move
 * at once and the header shows the save state and Deshacer.
 *
 * Top to bottom: the one-line season header (cabecera-temporada.tsx), one
 * toolbar row (view switch Tablero · Lado a lado, search over groups and
 * people, Agrupar por localidad | director, Ocultar / Mostrar banco), then the
 * Tablero lanes (tablero-planner.tsx) next to the people bank
 * (banco-personas.tsx). The alerts live only in the header button, which
 * opens the side panel (panel-alertas.tsx). A group opens as its own side
 * panel (panel-grupo.tsx, T6) from its card, the alerts or the bank; the
 * alerts fix what they can from there. Warnings come from calcularAvisos
 * (T4) kept to the actor's scope (S10); blockers from planner_bloqueos, which
 * the database already scopes. The bank toggle is remembered per user in
 * localStorage.
 */
import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { botonPublicar, calcularAvisos, sugerirLocalidad, type PasoHistorial, type SugerenciaLocalidad } from '@/lib/platform/grupos-vida/planner'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import { cn } from '@/lib/utils'

import { BancoPersonas } from './banco-personas'
import { CabeceraTemporada } from './cabecera-temporada'
import { DialogoEliminarGrupo } from './dialogo-eliminar-grupo'
import { DialogoUbicar } from './dialogo-ubicar'
import { EstadoGuardado } from './estado-guardado'
import { MigasPlanner } from './migas-planner'
import { avisosDelAlcance, carriles, contarPersonas, modeloBanco, FILTROS_BANCO_INICIALES, seccionesAvisos, seccionesBloqueos, segmentosDelAlcance, type Agrupar } from './modelo'
import { PanelAlertas } from './panel-alertas'
import { PanelGrupo } from './panel-grupo'
import { PanelNuevoGrupo } from './panel-nuevo-grupo'
import { PasosPlannerProvider, usePasosPlanner } from './pasos-planner'
import { TableroPlanner } from './tablero-planner'

type Vista = 'tablero' | 'lado'

const ID_BANCO = 'banco-personas'

export const claveBanco = (usuarioId: string): string => `planner-gdv:banco-oculto:${usuarioId}`

export interface PlannerClientProps {
  readonly datos: DatosPlanner
  /** planner_historial (latest steps) for Deshacer; null when it could not be read. */
  readonly pasos?: readonly PasoHistorial[] | null
}

const EVENTO_BANCO = 'planner-gdv:banco'

function suscribirBanco(aviso: () => void): () => void {
  window.addEventListener('storage', aviso)
  window.addEventListener(EVENTO_BANCO, aviso)
  return () => {
    window.removeEventListener('storage', aviso)
    window.removeEventListener(EVENTO_BANCO, aviso)
  }
}

/** This tab's choice, so the toggle works even when localStorage cannot be written. */
const ocultoEnPestana = new Map<string, boolean>()

function leerOculto(usuarioId: string): boolean {
  const enPestana = ocultoEnPestana.get(usuarioId)
  if (enPestana !== undefined) return enPestana
  try {
    return window.localStorage.getItem(claveBanco(usuarioId)) === '1'
  } catch {
    // Storage may be unavailable (private mode): the bank stays shown.
    return false
  }
}

/** The bank toggle (S17), remembered per user; shown on the server and until the stored choice is read. */
function useBancoVisible(usuarioId: string): [boolean, (visible: boolean) => void] {
  const oculto = useSyncExternalStore(suscribirBanco, () => leerOculto(usuarioId), () => false)
  const cambiar = (visible: boolean) => {
    ocultoEnPestana.set(usuarioId, !visible)
    try {
      if (visible) window.localStorage.removeItem(claveBanco(usuarioId))
      else window.localStorage.setItem(claveBanco(usuarioId), '1')
    } catch {
      // Same as above: the choice just is not remembered.
    }
    window.dispatchEvent(new Event(EVENTO_BANCO))
  }
  return [!oculto, cambiar]
}

export function PlannerClient({ datos, pasos = null }: PlannerClientProps): ReactElement {
  const { capacidades, temporada, bloqueos, estado, localidades, faltantes } = datos
  const control = usePasosPlanner(datos, pasos)
  const { grupos, banco } = control.tablero
  // The groups "Ubicar" offers: those of the actor's segments (S10), by segment and name.
  const editables = useMemo(() => {
    const segmentos = new Set(capacidades.segmentos_editables)
    return grupos
      .filter((g) => segmentos.has(g.segmento_id))
      .sort((a, b) => a.segmento_nombre.localeCompare(b.segmento_nombre, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
  }, [grupos, capacidades.segmentos_editables])
  const notificar = useNotificaciones()
  const [alertasAbiertas, setAlertasAbiertas] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [agrupar, setAgrupar] = useState<Agrupar>('localidad')
  const [bancoVisible, setBancoVisible] = useBancoVisible(capacidades.usuario_id)

  const avisos = useMemo(
    () => avisosDelAlcance(calcularAvisos({ grupos, banco, localidades, segmentos: capacidades.segmentos }), grupos, banco, capacidades),
    [grupos, banco, localidades, capacidades],
  )
  const lanes = useMemo(() => carriles(grupos, capacidades, agrupar, busqueda), [grupos, capacidades, agrupar, busqueda])
  const sinUbicar = useMemo(() => modeloBanco(banco, FILTROS_BANCO_INICIALES, temporada).conteos.sinUbicar, [banco, temporada])
  // The localidad suggestion of each group without one, for "Usar sugerida" in the alerts (S3).
  const sugerencias = useMemo(() => {
    const mapa = new Map<string, SugerenciaLocalidad | null>()
    if (localidades.length > 0) grupos.forEach((g) => !g.localidad_id && mapa.set(g.grupo_id, sugerirLocalidad(g, banco, localidades)))
    return mapa
  }, [grupos, banco, localidades])
  const seccionesB = useMemo(() => seccionesBloqueos(bloqueos, grupos, temporada.nombre, sugerencias), [bloqueos, grupos, temporada.nombre, sugerencias])
  const seccionesA = useMemo(() => seccionesAvisos(avisos, grupos, temporada.origen_nombre, control.fichas), [avisos, grupos, temporada.origen_nombre, control.fichas])
  const grupoDe = (grupoId: string) => grupos.find((g) => g.grupo_id === grupoId) ?? null
  const grupoAbierto = control.grupoAbierto

  const publicar = capacidades.puede_publicar ? (estado ? botonPublicar(estado) : { texto: 'Publicar', listo: false }) : null

  const cambiarVista = (vista: Vista) => {
    if (vista === 'lado') notificar.info('La vista Lado a lado llega pronto.')
  }

  return (
    <PasosPlannerProvider value={control.contexto}>
      {/* No `titulo`: the season switcher is the page h1. */}
      <PaginaSistema breadcrumbs={<MigasPlanner actual={temporada.nombre} />}>
        <CabeceraTemporada
          temporada={temporada}
          temporadas={capacidades.temporadas}
          segmentosAlcance={segmentosDelAlcance(capacidades)}
          grupos={grupos.length}
          personas={contarPersonas(grupos)}
          bloqueos={bloqueos.length}
          avisos={avisos.length}
          onAbrirAlertas={() => setAlertasAbiertas(true)}
          alertasAbiertas={alertasAbiertas}
          publicar={publicar}
          puedeCrearTemporada={capacidades.puede_crear_temporada}
          guardado={<EstadoGuardado estado={control.guardado} deshacer={control.deshacer} />}
        />

        {faltantes.includes('localidades') && (
          <AvisoFormulario tono="info" role="note" className="py-3">
            No se pudieron leer las localidades: por ahora los grupos sin localidad no muestran sugerencia.
          </AvisoFormulario>
        )}

        <section aria-label="Vista, buscar y agrupar" className="flex flex-wrap items-center gap-2">
          <ControlSegmentado<Vista>
            etiqueta="Vista"
            opciones={[
              { valor: 'tablero', etiqueta: 'Tablero' },
              { valor: 'lado', etiqueta: 'Lado a lado · pronto' },
            ]}
            valor="tablero"
            onCambio={cambiarVista}
          />
          <div className="min-w-[14rem] flex-1">
            <InputSistema
              type="search"
              icono={Search}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar grupo o persona"
              aria-label="Buscar grupo, líder o persona"
              autoComplete="off"
            />
          </div>
          <div className="w-52">
            <SelectSistema
              aria-label="Agrupar por"
              opciones={[
                { valor: 'localidad', etiqueta: 'Agrupar: localidad' },
                { valor: 'director', etiqueta: 'Agrupar: director' },
              ]}
              value={agrupar}
              onValueChange={(valor) => setAgrupar(valor === 'director' ? 'director' : 'localidad')}
            />
          </div>
          <BotonSistema
            type="button"
            variante="outline"
            tamaño="sm"
            aria-expanded={bancoVisible}
            aria-controls={ID_BANCO}
            onClick={() => setBancoVisible(!bancoVisible)}
          >
            {bancoVisible ? (
              'Ocultar banco'
            ) : (
              <>
                Mostrar banco · <span className="font-mono tabular-nums">{sinUbicar}</span> sin ubicar
              </>
            )}
          </BotonSistema>
        </section>

        <div className={cn('grid items-start gap-6', bancoVisible && 'lg:grid-cols-[minmax(0,1fr)_20rem]')}>
          <TableroPlanner carriles={lanes} bloqueos={bloqueos} avisos={avisos} banco={banco} localidades={localidades} busqueda={busqueda} />
          <div hidden={!bancoVisible} className="min-w-0 lg:sticky lg:top-24">
            <BancoPersonas id={ID_BANCO} banco={banco} temporada={temporada} className="lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto" />
          </div>
        </div>

        <PanelAlertas
          abierto={alertasAbiertas}
          onAbiertoChange={setAlertasAbiertas}
          temporada={temporada.nombre}
          bloqueos={seccionesB}
          avisos={seccionesA}
          totalBloqueos={bloqueos.length}
          totalAvisos={avisos.length}
          onIrAlGrupo={(grupoId) => {
            // After the panel closes, so the card is in view behind the group panel.
            window.setTimeout(() => document.getElementById(`grupo-${grupoId}`)?.scrollIntoView?.({ block: 'center', inline: 'center' }), 0)
            control.abrirGrupo(grupoId)
          }}
          puedeEditar={(grupoId) => {
            const grupo = grupoDe(grupoId)
            return grupo !== null && control.contexto.editable(grupo.segmento_id)
          }}
          onUsarSugerida={(grupoId, sugerencia) => {
            const grupo = grupoDe(grupoId)
            return grupo ? control.usarLocalidad(grupo, sugerencia) : Promise.resolve({ ok: false, codigo: null, mensaje: 'El grupo ya no está en el tablero.' })
          }}
          onUbicar={(item) => item.personas && control.contexto.pedirUbicar({ ids: item.personaIds, nombre: item.personas, desdeGrupo: false })}
        />

        <PanelGrupo
          grupo={grupoAbierto}
          editable={grupoAbierto !== null && control.contexto.editable(grupoAbierto.segmento_id)}
          grupos={grupos}
          bloqueos={bloqueos}
          avisos={avisos}
          banco={banco}
          fichas={control.fichas}
          localidades={localidades}
          segmentos={capacidades.segmentos}
          onCerrar={control.cerrarGrupo}
          onEditar={control.editar}
          onMover={control.moverDesdePanel}
          onPedirUbicar={(carga, inicial) => control.contexto.pedirUbicar(carga, inicial)}
          onEliminar={(grupo) => {
            control.cerrarGrupo()
            control.contexto.pedirEliminar(grupo)
          }}
        />

        <DialogoUbicar
          peticion={control.ubicar}
          grupos={editables}
          fichas={control.fichas}
          onCerrar={control.cerrarUbicar}
          onConfirmar={control.confirmarUbicar}
        />
        <PanelNuevoGrupo
          segmento={control.nuevoGrupo}
          grupos={grupos}
          segmentos={capacidades.segmentos}
          fichas={control.fichas}
          localidades={localidades}
          onCerrar={control.cerrarNuevoGrupo}
          onCrear={control.crear}
        />
        <DialogoEliminarGrupo grupo={control.eliminar} onCerrar={control.cerrarEliminar} onConfirmar={control.confirmarEliminar} />
        <p role="status" aria-live="polite" aria-label="Cambios del planificador" className="sr-only">
          {control.anuncio}
        </p>
      </PaginaSistema>
    </PasosPlannerProvider>
  )
}
