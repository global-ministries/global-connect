/**
 * «Próximos cumpleaños» (odd/tasks/home-por-rol.md T7, S12; T8, S14a): so the
 * leader, the directors and admin/pastor can celebrate the people in their
 * care, and members and colíderes the people of their group.
 * Up to MAX_CUMPLEANOS rows sorted by date: initials, name, context (the
 * group, when known) and the day («Hoy», «Mañana», «jue 12 nov»). No page
 * lists every birthday, so there is no «Ver todos». Hidden by the screen
 * when the list is empty.
 *
 * Server-safe: no hooks, no handlers.
 */
import type { ReactElement } from 'react'

import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import type { Cumpleanos } from '@/lib/inicio/cargar-cumpleanos'
import { cn } from '@/lib/utils'

import { CLASE_LINEA_FILA, CLASE_LISTA_INSET, EncabezadoSeccion } from './partes-inicio'
import { diaRelativo } from './textos-inicio'

const MAX_CUMPLEANOS = 5

type Props = {
  readonly cumpleanos: readonly Cumpleanos[]
  /** YYYY-MM-DD in Caracas. */
  readonly hoy: string
  readonly className?: string
}

export function SeccionCumpleanos({ cumpleanos, hoy, className }: Props): ReactElement {
  return (
    <section aria-labelledby="inicio-cumpleanos" className={className}>
      <EncabezadoSeccion id="inicio-cumpleanos" titulo="Próximos cumpleaños" />
      <ul aria-labelledby="inicio-cumpleanos" className={CLASE_LISTA_INSET}>
        {cumpleanos.slice(0, MAX_CUMPLEANOS).map((c) => {
          const dia = diaRelativo(c.fecha, hoy)
          return (
            <li key={c.id} className={cn(CLASE_LINEA_FILA, 'flex min-h-16 min-w-0 items-center gap-3 px-3.5 py-2.5')}>
              {/* 36px, as the row tiles, so the inset hairline lines up. */}
              <AvatarIniciales nombres={[c.nombre]} className="size-9 text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-foreground">{c.nombre}</span>
                {c.contexto && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{c.contexto}</span>}
              </span>
              <span className={cn('shrink-0 text-sm', dia === 'Hoy' ? 'font-semibold text-brand-text' : 'text-muted-foreground')}>{dia}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
