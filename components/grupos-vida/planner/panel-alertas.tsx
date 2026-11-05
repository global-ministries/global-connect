'use client'

/**
 * Planner — the alerts side panel (S6, S7, S21; artboard 03), opened from the
 * header's "N bloqueos · M avisos". "Bloquean la publicación" always lists
 * the four blockers (a 0 says "Todo en orden"), each with its groups or
 * people; "Avisos" groups the warnings by kind. Each item names its group or
 * person; "Ir al grupo" closes the panel and scrolls to the card. Fixing from
 * here ("Usar sugerida", "Ubicar") comes with the steps (T5b, T6).
 */
import { useState, type ReactElement } from 'react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { contar } from '@/lib/platform/grupos-vida/planner'

import type { ItemAlerta, SeccionAlerta } from './modelo'

const VISIBLES_POR_SECCION = 5

export interface PanelAlertasProps {
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  readonly temporada: string
  readonly bloqueos: readonly SeccionAlerta[]
  readonly avisos: readonly SeccionAlerta[]
  readonly totalBloqueos: number
  readonly totalAvisos: number
}

function Item({ item, onIr }: { readonly item: ItemAlerta; readonly onIr: (grupoId: string) => void }): ReactElement {
  return (
    <li className="flex min-w-0 items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{item.titulo}</p>
        {item.detalle && <p className="truncate text-xs text-muted-foreground">{item.detalle}</p>}
      </div>
      {item.grupoId && (
        <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => item.grupoId && onIr(item.grupoId)}>
          Ir al grupo
        </BotonSistema>
      )}
    </li>
  )
}

function Seccion({ seccion, tono, onIr }: { readonly seccion: SeccionAlerta; readonly tono: 'danger' | 'warning'; readonly onIr: (grupoId: string) => void }): ReactElement {
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
          <ul className="mt-1">
            {items.map((item) => (
              <Item key={item.clave} item={item} onIr={onIr} />
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

export function PanelAlertas({ abierto, onAbiertoChange, temporada, bloqueos, avisos, totalBloqueos, totalAvisos }: PanelAlertasProps): ReactElement {
  const irAlGrupo = (grupoId: string) => {
    onAbiertoChange(false)
    // After the panel closes, so the focus returns to the board and the card is in view.
    window.setTimeout(() => document.getElementById(`grupo-${grupoId}`)?.scrollIntoView?.({ block: 'center', inline: 'center' }), 0)
  }
  return (
    <PanelLateralSistema
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      tamaño="lg"
      titulo={`Alertas de ${temporada}`}
      descripcion={`${totalBloqueos} ${totalBloqueos === 1 ? 'bloquea' : 'bloquean'} la publicación · ${contar(totalAvisos, 'aviso', 'avisos')} que no ${totalAvisos === 1 ? 'bloquea' : 'bloquean'}`}
    >
      <div className="space-y-6">
        <section aria-labelledby="alertas-bloqueos" className="space-y-3">
          <div>
            <h3 id="alertas-bloqueos" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Bloquean la publicación · <span className="font-mono tabular-nums">{totalBloqueos}</span>
            </h3>
            <p className="text-xs text-muted-foreground">Deben quedar en 0 para publicar</p>
          </div>
          {bloqueos.map((seccion) => (
            <Seccion key={seccion.id} seccion={seccion} tono="danger" onIr={irAlGrupo} />
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
            avisos.map((seccion) => <Seccion key={seccion.id} seccion={seccion} tono="warning" onIr={irAlGrupo} />)
          )}
        </section>
      </div>
    </PanelLateralSistema>
  )
}
