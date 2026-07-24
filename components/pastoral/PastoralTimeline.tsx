"use client"

/**
 * W13 — PastoralTimeline component.
 *
 * Visual timeline for displaying pastoral journey:
 * - Validated steps (milestones)
 * - 1:1 sessions
 * - Triada events
 *
 * Mobile-first: vertical on mobile, can be horizontal on desktop.
 */

import React from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react'

interface TimelineItem {
  readonly id: string
  readonly type: 'step_validated' | 'one_on_one' | 'triada_created' | 'triada_disbanded'
  readonly title: string
  readonly subtitle?: string
  readonly isoDate: string
  readonly isSharedMilestone?: boolean
}

interface PastoralTimelineProps {
  readonly items: ReadonlyArray<TimelineItem>
  readonly className?: string
}

// ─── Icon per type ────────────────────────────────────────────────────────────

function ItemIcon({ type, isSharedMilestone }: { type: TimelineItem['type']; isSharedMilestone?: boolean }) {
  switch (type) {
    case 'step_validated':
      return isSharedMilestone
        ? <CheckCircle2 className="h-5 w-5 text-[var(--brand-primary)]" />
        : <CheckCircle2 className="h-5 w-5 text-green-600" />
    case 'one_on_one':
      return <Circle className="h-5 w-5 text-muted-foreground" />
    case 'triada_created':
      return <Circle className="h-5 w-5 text-[var(--brand-primary)]" />
    case 'triada_disbanded':
      return <AlertCircle className="h-5 w-5 text-yellow-600" />
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PastoralTimeline({ items, className }: PastoralTimelineProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Sin actividad registrada todavía.
      </p>
    )
  }

  return (
    <ol className={`relative border-l-2 border-border pl-6 space-y-6 ${className ?? ''}`}>
      {items.map((item) => (
        <li key={item.id} className="relative">
          {/* Icon */}
          <div className="absolute -left-3 top-0 bg-background p-0.5 rounded-full">
            <ItemIcon type={item.type} isSharedMilestone={item.isSharedMilestone} />
          </div>

          {/* Content */}
          <div className="ml-4">
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            {item.subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
            )}
            <time className="text-xs text-muted-foreground mt-1 block">
              {format(new Date(item.isoDate), "d 'de' MMM 'de' yyyy", { locale: es })}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}
