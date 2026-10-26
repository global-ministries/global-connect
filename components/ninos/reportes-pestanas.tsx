import Link from 'next/link'

import { urlPestanaReportes, type PestanaReportes } from '@/lib/platform/ninos/reportes-voluntarios'

import { clasePestana, LISTA_PESTANAS } from './pestanas-sistema'

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
    <nav aria-label="Tipo de reporte" className={LISTA_PESTANAS}>
      {PESTANAS.map((p) => (
        <Link
          key={p.id}
          href={urlPestanaReportes(p.id, filtros)}
          aria-current={p.id === actual ? 'page' : undefined}
          className={clasePestana(p.id === actual)}
        >
          {p.etiqueta}
        </Link>
      ))}
    </nav>
  )
}
