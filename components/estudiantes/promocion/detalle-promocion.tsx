'use client'

/**
 * Estudiantes › Promover temporada — the read-only group panel (artboards
 * 13 / 14 of design/estudiantes-dps, C22): one `PanelAcoplado` (docked from
 * 1280px, overlay side panel from md, bottom sheet below). A pending 3er año group gets the warning and "Ir a la
 * decisión"; the new group of option (a) gets "Este grupo no tiene líder".
 * Then Hoy · Después · Integrantes · Egresan (or Llegan de), the "Queda como"
 * card, and the members and visitors (G6 rows) with their year change or
 * "Egresa".
 */
import type { ReactElement } from 'react'

import { BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import type { DetallePromocion as Detalle } from '@/lib/platform/estudiantes/promocion'

import { PanelAcoplado } from '../alcance/panel-acoplado'
import { FilaInset, ListaInset, TituloSeccion } from '../filas-inset'
import { AvatarIniciales } from '../vivo/franja-visitantes'
import { AvisoPromocion } from './partes-promocion'

export interface DetallePromocionProps {
  /** `null` keeps the drawer closed (the row left the plan). */
  readonly detalle: Detalle | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly onIrADecision: (grupoId: string) => void
}

function Personas({ id, titulo, personas }: { readonly id: string; readonly titulo: string; readonly personas: Detalle['integrantes'] }): ReactElement | null {
  if (personas.length === 0) return null
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <TituloSeccion id={id} texto={titulo} cantidad={personas.length} />
      <ListaInset etiqueta={titulo}>
        {personas.map((p) => (
          <FilaInset
            key={p.personaId}
            avatar={<AvatarIniciales nombre={p.nombre} />}
            titulo={p.nombre}
            subtitulo={p.detalle}
            accion={
              p.egresa ? (
                <BadgeSistema variante="default" tamaño="sm">
                  Egresa
                </BadgeSistema>
              ) : undefined
            }
          />
        ))}
      </ListaInset>
    </section>
  )
}

export function DetallePromocion({ detalle, abierto, onCambioAbierto, onIrADecision }: DetallePromocionProps): ReactElement | null {
  if (!detalle) return null
  return (
    <PanelAcoplado abierto={abierto} onCambioAbierto={onCambioAbierto} titulo={detalle.titulo} contexto={detalle.meta}>
      <div className="space-y-5">
        {detalle.pendiente && detalle.grupoDecision && (
          <AvisoPromocion tono="warning" titulo="Falta decidir qué pasa con este grupo">
            <p className="text-muted-foreground">Sus integrantes pasan a Inside Out de una de dos formas.</p>
            <BotonSistema type="button" variante="outline" tamaño="sm" className="mt-2" onClick={() => onIrADecision(detalle.grupoDecision!)}>
              Ir a la decisión
            </BotonSistema>
          </AvisoPromocion>
        )}
        {detalle.sinLider && (
          <AvisoPromocion tono="warning" titulo="Este grupo no tiene líder">
            <p className="text-muted-foreground">{`Se crea al promover. Asígnale uno de los voluntarios de ${detalle.subareaDestino} en Grupos.`}</p>
          </AvisoPromocion>
        )}

        <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-border @md:grid-cols-4">
          {detalle.datos.map((dato) => (
            <div key={dato.etiqueta} className="-mr-px -mb-px min-w-0 px-2.5 py-2 shadow-[inset_-1px_-1px_0_var(--border)]">
              <dt className="text-xs text-muted-foreground">{dato.etiqueta}</dt>
              <dd className={typeof dato.valor === 'number' ? 'mt-px font-mono text-sm font-semibold tabular-nums text-foreground' : 'mt-px truncate text-sm font-semibold text-foreground'}>
                {dato.valor}
              </dd>
            </div>
          ))}
        </dl>

        {detalle.quedaComo && (
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Queda como</p>
            <p className="mt-0.5 text-[15px] font-[650] text-foreground">{detalle.quedaComo.nombre}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{detalle.quedaComo.detalle}</p>
            <p className="mt-2 text-sm text-foreground">{detalle.quedaComo.nota}</p>
          </div>
        )}

        <Personas id="promocion-detalle-integrantes" titulo="Integrantes" personas={detalle.integrantes} />
        <Personas id="promocion-detalle-visitantes" titulo="Visitantes" personas={detalle.visitantes} />
      </div>
    </PanelAcoplado>
  )
}
