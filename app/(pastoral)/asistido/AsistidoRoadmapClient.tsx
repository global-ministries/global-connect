"use client"

/**
 * W13 — Public roadmap client component (P6).
 *
 * Shows the assisted person's roadmap:
 * - Next 1:1
 * - Validated milestones
 * - Suggested next step
 *
 * No private notes — field-projected by the loader.
 */

import React from 'react'
import { PublicRoadmap } from '@/components/pastoral/PublicRoadmap'
import type { PublicRoadmap as PublicRoadmapType } from '@/lib/platform/pastoral/public-roadmap/types'

interface AsistidoRoadmapClientProps {
  readonly roadmap: PublicRoadmapType | null
  readonly isLoading?: boolean
}

export default function AsistidoRoadmapClient({
  roadmap,
  isLoading = false,
}: AsistidoRoadmapClientProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-xl animate-pulse bg-muted" />
        <div className="h-32 rounded-xl animate-pulse bg-muted" />
      </div>
    )
  }

  if (!roadmap) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No pudimos cargar tu roadmap. Intenta más tarde.
        </p>
      </div>
    )
  }

  return <PublicRoadmap roadmap={roadmap} />
}
