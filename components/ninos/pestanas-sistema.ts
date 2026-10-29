/**
 * The look of the shared tabs (components/ui/TabsSistema) for Niños controls
 * that must stay links (`aria-current`) or toggle buttons (`aria-pressed`)
 * instead of stateful Radix tabs: the Reportes tabs and the "Por domingo /
 * Por mes" switch.
 */
import { cn } from '@/lib/utils'

/** The tab list: the TabsSistema `TabsList` surface. */
export const LISTA_PESTANAS = 'inline-flex items-center rounded-xl border border-border bg-card p-[3px]'

/** One tab: the TabsSistema `TabsTrigger`, 36px tall, 44px on touch. */
export function clasePestana(activa: boolean): string {
  return cn(
    'focus-ring inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium touch-manipulation transition-colors pointer-coarse:min-h-11',
    activa ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
  )
}
