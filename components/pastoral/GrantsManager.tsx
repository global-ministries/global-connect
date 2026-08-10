"use client"

/**
 * W17 — DT-006 — Reusable GrantsManager component.
 *
 * Shows a grid of pastoral.* capabilities with toggle (grant/revoke) for a specific usuario.
 * Props:
 *   - usuarioId: the persona_id to manage grants for
 *   - capabilitiesIniciales: current capabilities for this usuario
 *   - onSave: callback when saves complete
 */
import React, { useState, useCallback } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type CapabilityEntry = {
  readonly capability_key: string
  readonly granted_at: string | null
  readonly revoked_at: string | null
}

interface GrantsManagerProps {
  readonly usuarioId: string
  readonly usuarioNombre: string
  readonly capabilitiesIniciales: CapabilityEntry[]
  readonly onSave?: (results: Array<{ capability_key: string; action: 'grant' | 'revoke'; success: boolean }>) => void
}

// List of all pastoral.* capabilities that can be managed
const PASTORAL_CAPABILITIES = [
  'pastoral.admin.manage',
  'pastoral.read.all',
  'pastoral.metrics.read',
  'pastoral.mentor.cascade.resolve',
  'pastoral.crisis.detect',
  'pastoral.one_on_one.create',
  'pastoral.one_on_one.read',
  'pastoral.one_on_one.write_notes',
  'pastoral.one_on_one.validate_step',
  'pastoral.one_on_one.complete',
  'pastoral.triada.create',
  'pastoral.triada.read',
  'pastoral.triada.write_notes',
  'pastoral.triada.disband',
]

function getCapabilityLabel(key: string): string {
  // Parse capability key for display
  const parts = key.split('.')
  if (parts.length >= 3) {
    const [, domain, action] = parts
    return `${domain.replace(/_/g, ' ')} / ${action.replace(/_/g, ' ')}`
  }
  return key.replace(/_/g, ' ')
}

function isCapabilityActive(cap: CapabilityEntry): boolean {
  return cap.granted_at !== null && cap.revoked_at === null
}

export function GrantsManager({ usuarioId, usuarioNombre, capabilitiesIniciales, onSave }: GrantsManagerProps) {
  // Baseline: capabilities as received from the server. Immutable — never
  // mutated after mount. Used to compute hasChanges and which capabilities
  // changed during a save.
  const [baseline, setBaseline] = useState<Map<string, boolean>>(() => {
    const initial = new Map<string, boolean>()
    for (const cap of capabilitiesIniciales) {
      initial.set(cap.capability_key, isCapabilityActive(cap))
    }
    return initial
  })

  // Editable state: toggled by the user, diffed against baseline on save.
  const [enabled, setEnabled] = useState<Map<string, boolean>>(() => new Map(baseline))
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<Array<{ capability_key: string; action: 'grant' | 'revoke'; success: boolean }> | null>(null)

  const handleToggle = useCallback((key: string, checked: boolean) => {
    setEnabled((prev) => {
      const next = new Map(prev)
      next.set(key, checked)
      return next
    })
    setSaveResult(null)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveResult(null)

    const results: Array<{ capability_key: string; action: 'grant' | 'revoke'; success: boolean }> = []

    // Find changed capabilities
    for (const key of PASTORAL_CAPABILITIES) {
      const initialActive = baseline.get(key) ?? false
      const currentActive = enabled.get(key) ?? false

      if (initialActive !== currentActive) {
        const action = currentActive ? 'grant' : 'revoke'
        try {
          const res = await fetch('/api/pastoral/admin/grants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              usuario_id: usuarioId,
              capability_key: key,
              action,
            }),
          })

          results.push({
            capability_key: key,
            action,
            success: res.ok,
          })
        } catch {
          results.push({
            capability_key: key,
            action,
            success: false,
          })
        }
      }
    }

    setSaving(false)
    setSaveResult(results)

    if (results.length === 0) {
      // No changes
    }

    // Update baseline to reflect saved changes (immutably via setState)
    const successful = results.filter((r) => r.success)
    if (successful.length > 0) {
      setBaseline((prev) => {
        const next = new Map(prev)
        for (const r of successful) {
          next.set(r.capability_key, r.action === 'grant')
        }
        return next
      })
    }

    onSave?.(results)
  }, [enabled, usuarioId, baseline, onSave])

  const hasChanges = Array.from(enabled.entries()).some(([key, val]) => {
    const initial = baseline.get(key) ?? false
    return initial !== val
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Capabilities de {usuarioNombre}</h2>
          <p className="text-sm text-muted-foreground">
            Activa o desactiva las capabilities pastoral para este usuario.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || saving} variant="default">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar cambios
            </>
          )}
        </Button>
      </div>

      {saveResult && saveResult.length > 0 && (
        <div className="p-4 rounded-lg bg-muted/50">
          <h3 className="font-medium mb-2">Resultado:</h3>
          <ul className="space-y-1">
            {saveResult.map((r) => (
              <li key={r.capability_key} className={cn('text-sm', r.success ? 'text-green-600' : 'text-red-600')}>
                {r.action === 'grant' ? 'Otorgado' : 'Revocado'}: {r.capability_key} — {r.success ? 'OK' : 'Error'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PASTORAL_CAPABILITIES.map((key) => {
          const isActive = enabled.get(key) ?? false
          return (
            <Card key={key} className={cn(isActive && 'border-green-500/50')}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{getCapabilityLabel(key)}</CardTitle>
                  <Switch checked={isActive} onCheckedChange={(checked) => handleToggle(key, checked)} />
                </div>
                <CardDescription className="text-xs">{key}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant={isActive ? 'default' : 'secondary'}>
                  {isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
