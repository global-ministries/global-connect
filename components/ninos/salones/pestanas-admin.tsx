/**
 * Niños › check-in administration — the tabs of the artboards
 * (design/ninos-checkin-pco/01–03, `.seg` nav): Eventos · Salones · Etiquetas,
 * links with `aria-current`, the look of the shared tabs. The campus travels
 * along. En vivo joins when its screen exists (T5).
 */
import Link from 'next/link'
import type { ReactElement } from 'react'

import { clasePestana, LISTA_PESTANAS } from '@/components/ninos/pestanas-sistema'

const PESTANAS = [
  { id: 'eventos', etiqueta: 'Eventos', href: '/ninos/eventos' },
  { id: 'salones', etiqueta: 'Salones', href: '/ninos/salones' },
  { id: 'etiquetas', etiqueta: 'Etiquetas', href: '/ninos/etiquetas' },
] as const

export type PestanaAdmin = (typeof PESTANAS)[number]['id']

export function PestanasAdmin({ actual, campusId }: { readonly actual: PestanaAdmin; readonly campusId: string | null }): ReactElement {
  const q = campusId ? `?campus=${encodeURIComponent(campusId)}` : ''
  return (
    <nav aria-label="Administración del check-in" className={LISTA_PESTANAS}>
      {PESTANAS.map((p) => (
        <Link key={p.id} href={`${p.href}${q}`} aria-current={p.id === actual ? 'page' : undefined} className={clasePestana(p.id === actual)}>
          {p.etiqueta}
        </Link>
      ))}
    </nav>
  )
}
