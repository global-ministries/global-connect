import Link from 'next/link'

import { cn } from '@/lib/utils'
import { urlPestanaReportes, type PestanaReportes } from '@/lib/platform/ninos/reportes-voluntarios'

const PESTANAS: { id: PestanaReportes; etiqueta: string }[] = [
  { id: 'ninos', etiqueta: 'Niños' },
  { id: 'voluntarios', etiqueta: 'Voluntarios' },
]

type Props = {
  actual: PestanaReportes
  filtros: { desde?: string; hasta?: string; campusId?: string; turnoId?: string }
}

/** Children's / volunteers' attendance tabs of /ninos/reportes; the shared filters travel along. */
export function PestanasReportes({ actual, filtros }: Props) {
  return (
    <nav aria-label="Tipo de reporte" className="flex gap-2">
      {PESTANAS.map((p) => (
        <Link
          key={p.id}
          href={urlPestanaReportes(p.id, filtros)}
          aria-current={p.id === actual ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium touch-manipulation transition-colors',
            p.id === actual
              ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white'
              : 'border-border text-foreground hover:bg-accent',
          )}
        >
          {p.etiqueta}
        </Link>
      ))}
    </nav>
  )
}
