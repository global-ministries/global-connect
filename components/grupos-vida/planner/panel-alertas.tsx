'use client'

/**
 * Planner — the alerts side panel (S6, S7, S21; artboard 03), opened from the
 * header's "N bloqueos · M avisos". "Bloquean la publicación" always lists
 * the four blockers (a 0 says "Todo en orden"), each with its groups or
 * people; "Avisos" groups the warnings by kind.
 *
 * Fixing from here (T6): "Ir al grupo" closes the panel and opens the group
 * panel (02); "Usar sugerida" applies the localidad suggestion of a group
 * without one as one edit step; "Revisar sugerencias de localidad" lists every
 * suggestion so each row is applied on its own (one step each, so each stays
 * undoable; nothing is applied in bulk); "Ubicar" opens the Ubicar dialog for
 * an unplaced person, over the panel. Only groups the actor edits offer
 * "Usar sugerida" (S10).
 */
import { useId, useState, type ReactElement } from 'react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { contar, type SugerenciaLocalidad } from '@/lib/platform/grupos-vida/planner'
import type { ResultadoAccion } from '@/lib/platform/grupos-vida/planner/acciones'

import type { ItemAlerta, SeccionAlerta } from './modelo'

const VISIBLES_POR_SECCION = 5

export interface AccionesAlertas {
  readonly onIrAlGrupo: (grupoId: string) => void
  /** Whether the actor edits the group (S10); without it no "Usar sugerida". */
  readonly puedeEditar: (grupoId: string) => boolean
  readonly onUsarSugerida?: (grupoId: string, sugerencia: SugerenciaLocalidad) => Promise<ResultadoAccion<unknown>>
  readonly onUbicar?: (item: ItemAlerta) => void
}

export interface PanelAlertasProps extends AccionesAlertas {
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  readonly temporada: string
  readonly bloqueos: readonly SeccionAlerta[]
  readonly avisos: readonly SeccionAlerta[]
  readonly totalBloqueos: number
  readonly totalAvisos: number
}

type EstadoAplicar = 'guardando' | 'aplicada'

/** Each group's "Usar sugerida" state, shared by its row and its row in "Revisar sugerencias". */
function useAplicar(onUsarSugerida: AccionesAlertas['onUsarSugerida']) {
  const [estados, setEstados] = useState<ReadonlyMap<string, EstadoAplicar>>(() => new Map())
  const aplicar = async (grupoId: string, sugerencia: SugerenciaLocalidad) => {
    if (!onUsarSugerida || estados.has(grupoId)) return
    setEstados((e) => new Map(e).set(grupoId, 'guardando'))
    const resultado = await onUsarSugerida(grupoId, sugerencia)
    setEstados((e) => {
      const siguiente = new Map(e)
      if (resultado.ok) siguiente.set(grupoId, 'aplicada')
      else siguiente.delete(grupoId)
      return siguiente
    })
  }
  return { estados, aplicar }
}

type Aplicar = ReturnType<typeof useAplicar>

interface PropsItem extends AccionesAlertas {
  readonly item: ItemAlerta
  readonly aplicar: Aplicar
}

function BotonSugerida({ item, aplicar, etiqueta, ariaLabel }: { readonly item: ItemAlerta; readonly aplicar: Aplicar; readonly etiqueta: string; readonly ariaLabel?: string }): ReactElement | null {
  const { grupoId, sugerencia } = item
  if (!grupoId || !sugerencia) return null
  const estado = aplicar.estados.get(grupoId)
  return (
    <BotonSistema
      type="button"
      variante="outline"
      tamaño="sm"
      cargando={estado === 'guardando'}
      disabled={estado !== undefined}
      aria-label={ariaLabel}
      onClick={() => void aplicar.aplicar(grupoId, sugerencia)}
    >
      {estado === 'aplicada' ? 'Aplicada' : etiqueta}
    </BotonSistema>
  )
}

function Item({ item, aplicar, onIrAlGrupo, puedeEditar, onUsarSugerida, onUbicar }: PropsItem): ReactElement {
  const usar = item.grupoId !== null && item.sugerencia && onUsarSugerida && puedeEditar(item.grupoId)
  const ubicar = item.grupoId === null && item.personaIds.length > 0 && onUbicar
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium text-foreground">{item.titulo}</p>
        {item.detalle && (
          <p title={item.detalle} className="truncate text-xs text-muted-foreground">
            {item.detalle}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {usar && <BotonSugerida item={item} aplicar={aplicar} etiqueta="Usar sugerida" />}
        {ubicar && (
          <BotonSistema type="button" variante="ghost" tamaño="sm" aria-label={`Ubicar a ${item.personas ?? 'esta persona'}`} onClick={() => onUbicar(item)}>
            Ubicar
          </BotonSistema>
        )}
        {item.grupoId && (
          <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => item.grupoId && onIrAlGrupo(item.grupoId)}>
            Ir al grupo
          </BotonSistema>
        )}
      </div>
    </li>
  )
}

/** "Revisar sugerencias de localidad": every group with a suggestion, each applied on its own. */
function RevisarSugerencias({ items, aplicar, puedeEditar }: { readonly items: readonly ItemAlerta[]; readonly aplicar: Aplicar; readonly puedeEditar: AccionesAlertas['puedeEditar'] }): ReactElement | null {
  const [abierta, setAbierta] = useState(false)
  const idLista = useId()
  const conSugerencia = items.filter((i) => i.grupoId !== null && i.sugerencia && puedeEditar(i.grupoId))
  const aMano = items.filter((i) => i.sugerencia === null).length
  if (conSugerencia.length === 0) return null
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-muted/50 p-3">
      <BotonSistema type="button" variante="outline" tamaño="sm" aria-expanded={abierta} aria-controls={idLista} onClick={() => setAbierta((a) => !a)}>
        Revisar sugerencias de localidad
      </BotonSistema>
      <p className="text-xs text-muted-foreground">
        {contar(conSugerencia.length, 'tiene', 'tienen')} sugerencia según dónde viven sus integrantes (los líderes primero). Nada se aplica sin que lo
        revises{aMano > 0 ? `; ${contar(aMano, 'necesita', 'necesitan')} que la elijas a mano` : ''}.
      </p>
      <ul id={idLista} hidden={!abierta} aria-label="Sugerencias de localidad">
        {conSugerencia.map((item) => (
          <li key={item.clave} className="flex min-w-0 items-center gap-3 border-b border-border py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground" title={item.titulo}>
                {item.titulo}
              </p>
              <p className="truncate text-xs text-muted-foreground">{item.sugerencia?.motivo}</p>
            </div>
            <BotonSugerida
              item={item}
              aplicar={aplicar}
              etiqueta={`Usar ${item.sugerencia?.nombre ?? ''}`}
              ariaLabel={`Usar ${item.sugerencia?.nombre ?? ''} en ${item.titulo}`}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Seccion({ seccion, tono, ...acciones }: { readonly seccion: SeccionAlerta; readonly tono: 'danger' | 'warning'; readonly aplicar: Aplicar } & AccionesAlertas): ReactElement {
  const [todas, setTodas] = useState(false)
  const items = todas ? seccion.items : seccion.items.slice(0, VISIBLES_POR_SECCION)
  const idTitulo = `alerta-${seccion.id}`
  return (
    <section id={seccion.id.replaceAll('_', '-')} aria-labelledby={idTitulo} className="rounded-2xl border border-border p-3">
      <h4 id={idTitulo} className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <PuntoEstado tono={seccion.cantidad === 0 ? 'success' : tono} />
        {seccion.titulo}
      </h4>
      {seccion.vacio ? (
        <p className="mt-1 text-sm text-muted-foreground">{seccion.vacio}</p>
      ) : (
        <>
          {seccion.id === 'sin_localidad' && acciones.onUsarSugerida && (
            <RevisarSugerencias items={seccion.items} aplicar={acciones.aplicar} puedeEditar={acciones.puedeEditar} />
          )}
          <ul className="mt-1">
            {items.map((item) => (
              <Item key={item.clave} item={item} {...acciones} />
            ))}
          </ul>
          {seccion.items.length > VISIBLES_POR_SECCION && (
            <BotonSistema type="button" variante="ghost" tamaño="sm" aria-expanded={todas} onClick={() => setTodas((t) => !t)}>
              {todas ? 'Ver menos' : `Ver los ${seccion.items.length}`}
            </BotonSistema>
          )}
        </>
      )}
    </section>
  )
}

/** The panel body; it unmounts when the panel closes, so "Aplicada" starts over each time. */
function Contenido({ bloqueos, avisos, totalBloqueos, totalAvisos, acciones }: Pick<PanelAlertasProps, 'bloqueos' | 'avisos' | 'totalBloqueos' | 'totalAvisos'> & { readonly acciones: AccionesAlertas }): ReactElement {
  const aplicar = useAplicar(acciones.onUsarSugerida)
  const propsSeccion = { ...acciones, aplicar }
  return (
    <div className="space-y-6">
      <section aria-labelledby="alertas-bloqueos" className="space-y-3">
        <div>
          <h3 id="alertas-bloqueos" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Bloquean la publicación · <span className="font-mono tabular-nums">{totalBloqueos}</span>
          </h3>
          <p className="text-xs text-muted-foreground">Deben quedar en 0 para publicar</p>
        </div>
        {bloqueos.map((seccion) => (
          <Seccion key={seccion.id} seccion={seccion} tono="danger" {...propsSeccion} />
        ))}
      </section>
      <section aria-labelledby="alertas-avisos" className="space-y-3">
        <div>
          <h3 id="alertas-avisos" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Avisos · <span className="font-mono tabular-nums">{totalAvisos}</span>
          </h3>
          <p className="text-xs text-muted-foreground">No bloquean: revísalos y decide</p>
        </div>
        {avisos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay avisos.</p>
        ) : (
          avisos.map((seccion) => <Seccion key={seccion.id} seccion={seccion} tono="warning" {...propsSeccion} />)
        )}
      </section>
    </div>
  )
}

export function PanelAlertas({ abierto, onAbiertoChange, temporada, bloqueos, avisos, totalBloqueos, totalAvisos, ...acciones }: PanelAlertasProps): ReactElement {
  const irAlGrupo = (grupoId: string) => {
    onAbiertoChange(false)
    acciones.onIrAlGrupo(grupoId)
  }
  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onAbiertoChange}
      ancho="lg"
      titulo={`Alertas de ${temporada}`}
      descripcion={`${totalBloqueos} ${totalBloqueos === 1 ? 'bloquea' : 'bloquean'} la publicación · ${contar(totalAvisos, 'aviso', 'avisos')} que no ${totalAvisos === 1 ? 'bloquea' : 'bloquean'}`}
    >
      <Contenido bloqueos={bloqueos} avisos={avisos} totalBloqueos={totalBloqueos} totalAvisos={totalAvisos} acciones={{ ...acciones, onIrAlGrupo: irAlGrupo }} />
    </DetalleResponsivo>
  )
}
