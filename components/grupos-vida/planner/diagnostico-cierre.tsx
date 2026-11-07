/**
 * Planner — the closing diagnosis (artboard 10 paso 3 and `#diagnostico`;
 * S18; T8b of odd/tasks/planner-gdv.md): how the season that closes ends.
 * Six numbers (groups, people, leaders, aprendices, couples who lead
 * together, people ready to lead, highlighted), the groups suggested for the
 * new season (current + one per two ready, a guide) and where the groups
 * meet and the people live. The same component in the assistant and in the
 * planner's "Diagnóstico de cierre" page. The numbers come from
 * lib/platform/grupos-vida/planner/diagnostico.ts. Server-safe.
 */
import type { ReactElement } from 'react'

import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import type { DiagnosticoCierre, Reparto } from '@/lib/platform/grupos-vida/planner/diagnostico'
import { cn } from '@/lib/utils'

import { formatearCantidad } from './modelo'

function Metrica({ titulo, valor, nota, destacada = false }: { readonly titulo: string; readonly valor: number; readonly nota?: string; readonly destacada?: boolean }): ReactElement {
  return (
    <div className={cn('grid min-w-0 content-start gap-1 rounded-2xl border px-4 py-3.5', destacada ? 'border-brand bg-brand-tint' : 'border-border bg-card')}>
      <dt className="text-[13px] text-muted-foreground">{titulo}</dt>
      <dd className="font-mono text-[26px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground">{formatearCantidad(valor)}</dd>
      {nota && <dd className="text-[13px] text-muted-foreground">{nota}</dd>}
    </div>
  )
}

function ListaReparto({ titulo, filas, unidad }: { readonly titulo: string; readonly filas: readonly Reparto[]; readonly unidad: readonly [string, string] }): ReactElement {
  const total = filas.reduce((suma, f) => suma + f.cantidad, 0)
  return (
    <section aria-label={titulo} className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{titulo}</h4>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos.</p>
      ) : (
        <ul className="grid gap-3">
          {filas.map((f) => (
            <li key={f.nombre} className="grid gap-1.5 text-sm">
              <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
                <span className="min-w-0 break-words text-foreground">{f.nombre}</span>
                <span className="whitespace-nowrap text-muted-foreground">
                  <span className="font-mono tabular-nums">{formatearCantidad(f.cantidad)}</span> {f.cantidad === 1 ? unidad[0] : unidad[1]}
                </span>
              </div>
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                <i className="block h-full rounded-full bg-chart-2" style={{ width: `${total ? Math.round((f.cantidad / total) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export interface DiagnosticoCierreVistaProps {
  readonly diagnostico: DiagnosticoCierre
  /** The season that closes ("2026-I"). */
  readonly origen: string
  /** The season being planned ("2027-I"). */
  readonly destino: string
}

export function DiagnosticoCierreVista({ diagnostico: d, origen, destino }: DiagnosticoCierreVistaProps): ReactElement {
  const extra = d.gruposSugeridos - d.grupos
  return (
    <div className="space-y-4">
      <dl aria-label={`Cómo termina ${origen}`} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metrica titulo="Grupos" valor={d.grupos} />
        <Metrica titulo="Integrantes" valor={d.integrantes} nota="cada persona una vez" />
        <Metrica titulo="Líderes" valor={d.lideres} />
        <Metrica titulo="Aprendices" valor={d.aprendices} />
        <Metrica titulo="Matrimonios que lideran juntos" valor={d.parejasQueLideran} />
        <Metrica titulo="Listos para liderar un grupo" valor={d.listosParaLiderar} nota="aprendices que todavía no lideran" destacada />
      </dl>
      <div className="grid gap-3 lg:grid-cols-2">
        <TarjetaSistema>
          <section aria-label={`Grupos sugeridos para ${destino}`} className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">Grupos sugeridos para {destino}</h3>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Grupos de {origen}</dt>
                <dd className="font-mono font-medium tabular-nums">{formatearCantidad(d.grupos)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Uno nuevo por cada dos listos para liderar</dt>
                <dd className="font-mono font-medium tabular-nums">+ {formatearCantidad(extra)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                <dt>Sugeridos</dt>
                <dd className="font-mono tabular-nums">{formatearCantidad(d.gruposSugeridos)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">Es una guía, no un límite: puedes crear los grupos que hagan falta.</p>
          </section>
        </TarjetaSistema>
        <TarjetaSistema>
          <section aria-label="Dónde están" className="space-y-4">
            <h3 className="text-base font-semibold text-foreground">Dónde están</h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <ListaReparto titulo="Grupos por localidad" filas={d.porLocalidad} unidad={['grupo', 'grupos']} />
              <ListaReparto titulo="Dónde viven las personas" filas={d.dondeViven} unidad={['persona', 'personas']} />
            </div>
          </section>
        </TarjetaSistema>
      </div>
    </div>
  )
}
