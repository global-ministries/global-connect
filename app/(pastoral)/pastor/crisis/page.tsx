/**
 * W13 — Pastor crisis list page (pastoral.read.all).
 *
 * Shows all detected crises with detail.
 * Sensitivity-aware: shows category, not full content.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requirePastoralSession, hasPastoralReadAllCapability } from '@/lib/platform/pastoral/route-access'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { BadgeSistema, PaginaSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  duelo: 'Duelo',
  crisis_matrimonial: 'Crisis Matrimonial',
  ideacion_suicida: 'Ideación Suicida',
  violencia_intrafamiliar: 'Violencia Intrafamiliar',
  crisis_de_fe: 'Crisis de Fe',
}

const CATEGORY_VARIANT: Record<string, 'error' | 'warning'> = {
  duelo: 'warning',
  crisis_matrimonial: 'error',
  ideacion_suicida: 'error',
  violencia_intrafamiliar: 'error',
  crisis_de_fe: 'warning',
}

export default async function PastorCrisisPage() {
  if (!isPastoralEnabled()) redirect('/')
  const session = await requirePastoralSession()
  if (!session || !hasPastoralReadAllCapability(session)) redirect('/')

  const supabase = await createSupabaseServerClient()

  const { data: rows } = await supabase
    .from('pastoral_crisis_detection_log')
    .select(`
      one_on_one_id,
      categoria,
      keyword,
      detected_at,
      actor_persona_id
    `)
    .order('detected_at', { ascending: false })

  const alerts = (rows ?? []).map((row: {
    one_on_one_id: string
    categoria: string
    keyword: string
    detected_at: string
    actor_persona_id: string
  }) => ({
    id: row.one_on_one_id,
    categoria: row.categoria,
    keyword: row.keyword,
    detectedAtIso: row.detected_at,
    detectedByPersonaId: row.actor_persona_id,
    assistedPersonaId: '',
    oneOnOneEstado: 'unknown',
    oneOnOneScheduledAt: null,
  }))

  return (
    <PaginaSistema
      titulo="Alertas de Crisis"
      descripcion="Crisis detectados en sesiones 1:1"
    >
      {alerts.length === 0 ? (
        <TarjetaSistema>
          <div className="flex items-center gap-2 py-4" role="status">
            <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No hay alertas de crisis registradas.
            </p>
          </div>
        </TarjetaSistema>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <TarjetaSistema key={alert.id}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <BadgeSistema variante={CATEGORY_VARIANT[alert.categoria] ?? 'warning'} tamaño="sm">
                      {CATEGORY_LABELS[alert.categoria] ?? alert.categoria}
                    </BadgeSistema>
                    <BadgeSistema tamaño="sm">{alert.oneOnOneEstado}</BadgeSistema>
                  </div>
                  <p className="break-words text-sm font-medium">
                    Palabra clave: &quot;{alert.keyword}&quot;
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Detectado: {format(new Date(alert.detectedAtIso), "d 'de' MMM 'de' yyyy HH:mm", { locale: es })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sesión 1:1: {alert.oneOnOneScheduledAt
                      ? format(new Date(alert.oneOnOneScheduledAt), "d 'de' MMM", { locale: es })
                      : 'sin fecha'}
                  </p>
                </div>
              </div>
            </TarjetaSistema>
          ))}
        </div>
      )}
    </PaginaSistema>
  )
}
