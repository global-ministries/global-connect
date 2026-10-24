'use client'

import { Link2, Users } from 'lucide-react'

import { BadgeSistema, BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { HijoForm } from '@/lib/platform/ninos/familia'
import type { CoincidenciaHijo } from '@/lib/platform/ninos/preregistro'

type Props = {
  /** The children of the request, in payload order. */
  hijos: readonly HijoForm[]
  coincidencias: readonly CoincidenciaHijo[]
  /** Child position → the chosen existing person. */
  elegidos: Readonly<Record<number, string>>
  /** id null: "it is another child" (create it). */
  onElegir: (indice: number, id: string | null) => void
}

/**
 * A request made from an account waits because each child looks like a person
 * already registered (M6a). The team decides per child: link that person to
 * the requester, or create a new child.
 */
export function CoincidenciasCuenta({ hijos, coincidencias, elegidos, onElegir }: Props) {
  const indices = [...new Set(coincidencias.map((c) => c.indice))].sort((a, b) => a - b)
  return (
    <section aria-label="Posibles duplicados" className="space-y-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
      <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
        Estos niños se parecen a personas ya registradas. Si es el mismo niño, vincúlalo en lugar de crearlo otra vez.
      </p>
      {indices.map((indice) => {
        const hijo = hijos[indice]
        return (
          <div key={indice} className="space-y-2">
            <TextoSistema tamaño="sm" className="font-medium text-foreground">
              {hijo ? `${hijo.nombre} ${hijo.apellido}` : `Niño ${indice + 1}`}
            </TextoSistema>
            <ul className="space-y-2">
              {coincidencias
                .filter((c) => c.indice === indice)
                .map((c) => {
                  const elegido = elegidos[indice] === c.id
                  return (
                    <li key={c.id} className="space-y-2 rounded-xl border border-border bg-card p-3 text-foreground">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">
                          {c.nombre} {c.apellido}
                        </span>
                        {c.fechaNacimiento && <span className="text-muted-foreground">· {c.fechaNacimiento}</span>}
                        {!c.tieneFicha && (
                          <BadgeSistema variante="info" tamaño="sm">
                            Sin ficha de niños
                          </BadgeSistema>
                        )}
                      </p>
                      {c.padres.length > 0 && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          Familia de {c.padres.join(', ')}
                        </p>
                      )}
                      {elegido ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <BadgeSistema variante="success" tamaño="sm">
                            Se vinculará a esta cuenta
                          </BadgeSistema>
                          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => onElegir(indice, null)}>
                            Es otro niño
                          </BotonSistema>
                        </div>
                      ) : (
                        <BotonSistema type="button" variante="outline" tamaño="sm" icono={Link2} onClick={() => onElegir(indice, c.id)}>
                          Es este niño: vincular
                        </BotonSistema>
                      )}
                    </li>
                  )
                })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
