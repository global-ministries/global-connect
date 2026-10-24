/**
 * Niños — new families of /ninos/reportes (odd/tasks/ninos-checkin.md, N16),
 * split by whether they came back. A family is one first visit; it came back
 * when any of its new children did (decided by the server). "Primera visita
 * reciente" means the campus of that visit has held no service since.
 */
import type { ReactElement } from 'react'

import { BadgeSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import {
  familiasPorEstado,
  fechaCorta,
  unirNombres,
  type EstadoRetorno,
  type FamiliaNueva,
  type NinoNuevo,
} from '@/lib/platform/ninos/reportes'

const GRUPOS: { estado: EstadoRetorno; titulo: string; ayuda: string; variante: 'success' | 'warning' | 'default' }[] = [
  { estado: 'volvio', titulo: 'Volvieron', ayuda: 'Algún niño de la familia vino otro día.', variante: 'success' },
  { estado: 'no_volvio', titulo: 'No han vuelto', ayuda: 'Hubo servicios después y no regresaron.', variante: 'warning' },
  {
    estado: 'pendiente',
    titulo: 'Primera visita reciente',
    ayuda: 'Aún no ha habido otro servicio en su campus desde su primera visita.',
    variante: 'default',
  },
]

function Familia({ familia }: { familia: FamiliaNueva }): ReactElement {
  const salones = [...new Set(familia.ninos.map((n) => n.salon))]
  const regresaron = familia.ninos.filter((n) => n.visitas > 1)
  return (
    <li className="space-y-0.5 px-4 py-3">
      <p className="font-medium text-foreground">{unirNombres(familia.ninos.map((n) => n.nombre))}</p>
      <p className="text-sm text-muted-foreground">
        Primera visita el {fechaCorta(familia.fecha)} · {salones.join(', ')}
      </p>
      {regresaron.map((n) => (
        <p key={n.nino_id} className="text-sm text-muted-foreground">
          {n.nombre}: {n.visitas} visitas · la última el {fechaCorta(n.ultima_fecha)}
        </p>
      ))}
      <p className="text-sm text-muted-foreground">
        {familia.padres.length ? `Padres: ${familia.padres.join(', ')}` : 'Sin padres vinculados'}
      </p>
    </li>
  )
}

/** The three groups of new families, each with its count. */
export function FamiliasNuevas({ nuevos }: { nuevos: readonly NinoNuevo[] }): ReactElement {
  const grupos = familiasPorEstado(nuevos)
  return (
    <div className="space-y-5">
      {GRUPOS.map((g) => {
        const familias = grupos[g.estado]
        return (
          <section key={g.estado} aria-label={g.titulo} className="space-y-2">
            <TituloSistema nivel={4} className="flex items-center gap-2">
              {g.titulo}
              <BadgeSistema variante={g.variante} tamaño="sm" className="tabular-nums">
                {familias.length}
              </BadgeSistema>
            </TituloSistema>
            <p className="text-xs text-muted-foreground">{g.ayuda}</p>
            {familias.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguna en este rango.</p>
            ) : (
              <TarjetaSistema className="p-0">
                <ul className="divide-y divide-border">
                  {familias.map((f) => (
                    <Familia key={f.visita_id} familia={f} />
                  ))}
                </ul>
              </TarjetaSistema>
            )}
          </section>
        )
      })}
    </div>
  )
}
