'use client'

/**
 * The "Supervisión" view of /mis-uno-a-uno (odd/tasks/uno-a-uno.md, T7/T8),
 * with two sub-tabs (S8.5):
 *
 *   - Líderes (S7.4, S8.1–S8.4): every leader of the user's chain with how
 *     many people they lead, realizados in the last 30 days, agendados and
 *     the last 1:1 — counters, filters and a sortable table;
 *   - 1 a 1 recientes (S7.2, S8.5): the chain's 1:1s of the last 90 days.
 *
 * Both datasets come already parsed from the server page, so switching
 * sub-tabs, filtering and sorting happen in the browser (S8.6). Read-only.
 */

import type { ReactElement } from 'react'

import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import type { LiderSupervisado, UnoAUnoSupervisado } from '@/lib/uno-a-uno/vista'

import { LideresSupervision } from './lideres-supervision'
import { RecientesSupervision } from './recientes-supervision'

interface Props {
  readonly lideres: readonly LiderSupervisado[]
  readonly recientes: readonly UnoAUnoSupervisado[]
}

export function SupervisionUnoAUno({ lideres, recientes }: Props): ReactElement {
  return (
    <TabsSistema defaultValue="lideres">
      <TabsList aria-label="Supervisión">
        <TabsTrigger value="lideres">Líderes</TabsTrigger>
        <TabsTrigger value="recientes">1 a 1 recientes</TabsTrigger>
      </TabsList>
      <TabsContent value="lideres">
        <LideresSupervision lideres={lideres} />
      </TabsContent>
      <TabsContent value="recientes">
        <RecientesSupervision recientes={recientes} />
      </TabsContent>
    </TabsSistema>
  )
}
