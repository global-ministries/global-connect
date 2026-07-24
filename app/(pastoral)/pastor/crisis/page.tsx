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
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  duelo: 'Duelo',
  crisis_matrimonial: 'Crisis Matrimonial',
  ideacion_suicida: 'Ideación Suicida',
  violencia_intrafamiliar: 'Violencia Intrafamiliar',
  crisis_de_fe: 'Crisis de Fe',
}

const CATEGORY_VARIANT: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  duelo: 'warning',
  crisis_matrimonial: 'destructive',
  ideacion_suicida: 'destructive',
  violencia_intrafamiliar: 'destructive',
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
      created_at,
      actor_persona_id,
      pastoral_one_on_one (
        estado,
        scheduled_at,
        participantes_persona_ids
      )
    `)
    .order('created_at', { ascending: false })

  const alerts = (rows ?? []).map((row: {
    one_on_one_id: string
    categoria: string
    keyword: string
    created_at: string
    actor_persona_id: string
    pastoral_one_on_one?: {
      estado: string
      scheduled_at: string | null
      participantes_persona_ids: string[]
    }
  }) => ({
    id: row.one_on_one_id,
    categoria: row.categoria,
    keyword: row.keyword,
    detectedAtIso: row.created_at,
    detectedByPersonaId: row.actor_persona_id,
    assistedPersonaId: row.pastoral_one_on_one?.participantes_persona_ids?.[0] ?? '',
    oneOnOneEstado: row.pastoral_one_on_one?.estado ?? 'unknown',
    oneOnOneScheduledAt: row.pastoral_one_on_one?.scheduled_at ?? null,
  }))

  return (
    <ContenedorDashboard
      titulo="Alertas de Crisis"
      descripcion="Crisis detectados en sesiones 1:1"
    >
      {alerts.length === 0 ? (
        <TarjetaSistema>
          <div className="flex items-center gap-2 py-4">
            <AlertTriangle className="h-5 w-5 text-green-600" />
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
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={CATEGORY_VARIANT[alert.categoria] ?? 'secondary'}>
                      {CATEGORY_LABELS[alert.categoria] ?? alert.categoria}
                    </Badge>
                    <Badge variant="outline">{alert.oneOnOneEstado}</Badge>
                  </div>
                  <p className="text-sm font-medium">
                    Palabra clave: "{alert.keyword}"
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
    </ContenedorDashboard>
  )
}
