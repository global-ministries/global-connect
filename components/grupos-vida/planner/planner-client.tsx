'use client'

/**
 * Planner — client island of /grupos-vida/planificar (T5a of
 * odd/tasks/planner-gdv.md; artboards 01, 03 and 08 of design/planner-gdv;
 * S1, S4, S5, S7, S9–S11, S16, S17, S21, S24). Moving people, creating,
 * editing and deleting groups and applying a localidad suggestion add to the
 * session draft (S24, pasos-planner.tsx): the board, the bank, the alerts and
 * the blocker counts show the draft applied at once, and nothing is saved
 * until "Guardar" in the header's save bar (estado-guardado.tsx), which also
 * opens the pending list (panel-cambios.tsx), discards and undoes. Undoing a
 * saved step and "Terminé mi segmento" save at once.
 *
 * Top to bottom: the one-line season header (cabecera-temporada.tsx), one
 * toolbar row (view switch Tablero · Lado a lado, search over groups and
 * people, Agrupar por localidad | director in Tablero, Ocultar / Mostrar
 * banco), then the Tablero lanes (tablero-planner.tsx) or the Lado a lado
 * panes (lado-a-lado.tsx, T7) next to the people bank (banco-personas.tsx).
 * The view lives in the URL (`?vista=lado`, replaced in place, no reload);
 * entering Lado a lado reads the origin season's groups once
 * (cargarOrigenAction). In Lado a lado the bank sits above the panes below
 * 1280 px (artboard 07). The alerts live only in the header button, which
 * opens the side panel (panel-alertas.tsx). A group opens as its own side
 * panel (panel-grupo.tsx, T6) from its card, the alerts or the bank; the
 * alerts fix what they can from there. Warnings come from calcularAvisos
 * (T4) kept to the actor's scope (S10); blockers from planner_bloqueos, which
 * the database already scopes, recomputed over the draft while there are
 * pending changes (bloqueosConBorrador). The bank toggle is remembered per
 * user in localStorage. "Historial" in the header opens the saved steps
 * (panel-historial.tsx, T8a); `?alertas=1` (the publish review's links)
 * opens the alerts panel on load.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { botonPublicar, calcularAvisos, sugerirLocalidad, type PasoHistorial, type SugerenciaLocalidad } from '@/lib/platform/grupos-vida/planner'
import { bloqueosConBorrador } from '@/lib/platform/grupos-vida/planner/borrador'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import { cn } from '@/lib/utils'
import { cargarOrigenAction } from '@/app/(auth)/grupos-vida/planificar/actions'

import { BancoPersonas } from './banco-personas'
import { CabeceraTemporada } from './cabecera-temporada'
import { DialogoEliminarGrupo } from './dialogo-eliminar-grupo'
import { DialogoUbicar } from './dialogo-ubicar'
import { LadoALado, type EstadoOrigen } from './lado-a-lado'
import { BarraGuardado } from './estado-guardado'
import { MigasPlanner } from './migas-planner'
import { avisosDelAlcance, carriles, contarPersonas, modeloBanco, FILTROS_BANCO_INICIALES, seccionesAvisos, seccionesBloqueos, segmentosDelAlcance, type Agrupar } from './modelo'
import { PanelAlertas } from './panel-alertas'
import { DialogoDescartar, PanelCambios } from './panel-cambios'
import { PanelGrupo } from './panel-grupo'
import { PanelHistorial } from './panel-historial'
import { PanelNuevoGrupo } from './panel-nuevo-grupo'
import { PasosPlannerProvider, usePasosPlanner } from './pasos-planner'
import { TableroPlanner } from './tablero-planner'

export type Vista = 'tablero' | 'lado'

const ID_BANCO = 'banco-personas'

export const claveBanco = (usuarioId: string): string => `planner-gdv:banco-oculto:${usuarioId}`

export interface PlannerClientProps {
  readonly datos: DatosPlanner
  /** planner_historial (latest steps) for Deshacer; null when it could not be read. */
  readonly pasos?: readonly PasoHistorial[] | null
  /** `?vista=` of the URL. */
  readonly vistaInicial?: Vista
  /** `?alertas=1` of the URL: the alerts panel starts open. */
  readonly alertasIniciales?: boolean
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

/** The view in the URL, replaced in place (no navigation, no new data). */
function escribirVista(vista: Vista) {
  const url = new URL(window.location.href)
  if (vista === 'lado') url.searchParams.set('vista', 'lado')
  else url.searchParams.delete('vista')
  window.history.replaceState(window.history.state, '', url)
}

/**
 * The origin season's groups for Lado a lado, read once on demand. null until
 * requested (shown as loading); `pedir` sets nothing synchronously, so the
 * effect that requests it on a `?vista=lado` load stays a plain subscription.
 */
function useGruposOrigen(temporadaId: string, origenNombre: string | null) {
  const [estado, setEstado] = useState<EstadoOrigen | null>(null)
  const pidiendo = useRef(false)
  const pedir = useCallback(() => {
    if (pidiendo.current) return
    pidiendo.current = true
    cargarOrigenAction({ temporadaId })
      .then(
        (r): EstadoOrigen => (r.ok ? { tipo: 'listo', grupos: r.grupos } : { tipo: 'error', mensaje: r.mensaje }),
        (): EstadoOrigen => ({ tipo: 'error', mensaje: `No se pudieron leer los grupos de ${origenNombre ?? 'la temporada anterior'}. Revisa tu conexión.` }),
      )
      .then((siguiente) => {
        pidiendo.current = false
        setEstado(siguiente)
      })
  }, [temporadaId, origenNombre])
  const reintentar = useCallback(() => {
    setEstado({ tipo: 'cargando' })
    pedir()
  }, [pedir])
  return { estado, pedir, reintentar }
}

export function PlannerClient({ datos, pasos = null, vistaInicial = 'tablero', alertasIniciales = false }: PlannerClientProps): ReactElement {
  const { capacidades, temporada, estado, localidades, faltantes } = datos
  const control = usePasosPlanner(datos, pasos)
  const { grupos, banco } = control.tablero
  const { borrador } = control
  // The blockers as they will be once the draft is saved.
  const bloqueos = useMemo(() => bloqueosConBorrador(datos.bloqueos, control.tablero, borrador.cambios), [datos.bloqueos, control.tablero, borrador.cambios])
  const [descartando, setDescartando] = useState(false)
  // The groups "Ubicar" offers: those of the actor's segments (S10), by segment and name.
  const editables = useMemo(() => {
    const segmentos = new Set(capacidades.segmentos_editables)
    return grupos
      .filter((g) => segmentos.has(g.segmento_id))
      .sort((a, b) => a.segmento_nombre.localeCompare(b.segmento_nombre, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
  }, [grupos, capacidades.segmentos_editables])
  const [alertasAbiertas, setAlertasAbiertas] = useState(alertasIniciales)
  const [historialAbierto, setHistorialAbierto] = useState(false)
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

  const [vista, setVista] = useState<Vista>(vistaInicial)
  const conOrigen = temporada.origen_id !== null
  const origen = useGruposOrigen(temporada.id, temporada.origen_nombre)
  const necesitaOrigen = vista === 'lado' && conOrigen && origen.estado === null
  const { pedir } = origen
  useEffect(() => {
    if (necesitaOrigen) pedir()
  }, [necesitaOrigen, pedir])
  const estadoOrigen: EstadoOrigen = !conOrigen ? { tipo: 'listo', grupos: [] } : (origen.estado ?? { tipo: 'cargando' })
  const lado = vista === 'lado'

  const cambiarVista = (siguiente: Vista) => {
    setVista(siguiente)
    escribirVista(siguiente)
  }

  return (
    <PasosPlannerProvider value={control.contexto}>
      {/* No `titulo`: the season switcher is the page h1. `relative` contains
          the absolute descendants (the sr-only live region): the shell's
          <main> is not positioned, so without it their containing block is
          the viewport and, placed at the end of the long board, they make
          the document scroll past the shell into an empty area. */}
      <PaginaSistema breadcrumbs={<MigasPlanner actual={temporada.nombre} />} className="relative">
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
          onAbrirHistorial={() => setHistorialAbierto(true)}
          historialAbierto={historialAbierto}
          publicar={publicar}
          puedeCrearTemporada={capacidades.puede_crear_temporada}
          cambiosSinGuardar={borrador.cambios.length}
          guardado={
            <BarraGuardado
              cambios={borrador.cambios.length}
              guardando={borrador.guardando}
              conError={borrador.error !== null}
              deshacer={control.deshacer}
              onAbrirLista={borrador.abrirLista}
              onDescartar={() => setDescartando(true)}
              onGuardar={borrador.guardar}
            />
          }
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
              { valor: 'lado', etiqueta: 'Lado a lado' },
            ]}
            valor={vista}
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
          <div className="w-52" hidden={lado}>
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

        {/* Lado a lado: the two panes need 1280 px next to the bank; below it the bank sits above them (07). */}
        <div className={cn('grid items-start gap-6', bancoVisible && (lado ? 'xl:grid-cols-[minmax(0,1fr)_20rem]' : 'lg:grid-cols-[minmax(0,1fr)_20rem]'))}>
          {lado ? (
            <LadoALado
              temporada={temporada}
              capacidades={capacidades}
              grupos={grupos}
              fichas={control.fichas}
              origen={estadoOrigen}
              onReintentar={origen.reintentar}
              busqueda={busqueda}
              acciones={{ pasar: control.pasar, pasarVarios: control.pasarVarios, crearCopia: control.crearCopia }}
            />
          ) : (
            <TableroPlanner carriles={lanes} bloqueos={bloqueos} avisos={avisos} banco={banco} localidades={localidades} busqueda={busqueda} />
          )}
          <div hidden={!bancoVisible} className={cn('min-w-0', lado ? 'order-first xl:order-none xl:sticky xl:top-24' : 'lg:sticky lg:top-24')}>
            <BancoPersonas
              id={ID_BANCO}
              banco={banco}
              temporada={temporada}
              className={lado ? 'max-h-[380px] overflow-y-auto xl:max-h-[calc(100dvh-7rem)]' : 'lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto'}
            />
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

        <PanelHistorial
          abierto={historialAbierto}
          onAbiertoChange={setHistorialAbierto}
          temporada={temporada}
          usuarioId={capacidades.usuario_id}
          veTodo={capacidades.ve_todos_los_segmentos}
          segmentos={capacidades.segmentos}
          pasos={pasos}
          cambiosSinGuardar={borrador.cambios.length}
          guardando={borrador.guardando}
          onGuardar={borrador.guardar}
          onDescartar={() => setDescartando(true)}
          onDeshacer={control.deshacerGuardado}
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
        <PanelCambios
          abierto={borrador.listaAbierta}
          onCerrar={borrador.cerrarLista}
          cambios={borrador.cambios}
          error={borrador.error}
          guardando={borrador.guardando}
          motivoQuitar={borrador.motivoQuitar}
          onQuitar={borrador.quitar}
          onDescartar={() => setDescartando(true)}
          onGuardar={borrador.guardar}
        />
        <DialogoDescartar
          abierto={descartando && borrador.cambios.length > 0}
          cambios={borrador.cambios.length}
          onCerrar={() => setDescartando(false)}
          onConfirmar={() => {
            setDescartando(false)
            borrador.descartar()
          }}
        />
        <p role="status" aria-live="polite" aria-label="Cambios del planificador" className="sr-only">
          {control.anuncio}
        </p>
      </PaginaSistema>
    </PasosPlannerProvider>
  )
}
