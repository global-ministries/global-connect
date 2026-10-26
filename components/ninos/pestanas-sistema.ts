/**
 * The look of the shared tabs (components/ui/TabsSistema) for Niños controls
 * that must stay links (`aria-current`) or toggle buttons (`aria-pressed`)
 * instead of stateful Radix tabs: the Reportes tabs and the "Por domingo /
 * Por mes" switch.
 */
import { cn } from '@/lib/utils'

/** The tab list: the TabsSistema `TabsList` surface. */
export const LISTA_PESTANAS =
  'inline-flex items-center gap-1 rounded-2xl border border-border/30 bg-card/60 p-1 shadow-sm backdrop-blur'

/** One tab: the TabsSistema `TabsTrigger`, 44px tall for touch. */
export function clasePestana(activa: boolean): string {
  return cn(
    'inline-flex min-h-[44px] items-center rounded-xl px-3.5 text-sm font-medium touch-manipulation transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    activa ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:bg-muted',
  )
}
