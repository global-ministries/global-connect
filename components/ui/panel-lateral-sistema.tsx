"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { PieAccionesSistema } from "@/components/ui/sistema-diseno"

/**
 * Side panel widths (docs/design-system.md): md 480px for short forms and
 * details, lg 640px for forms with repeated rows. Full width on mobile.
 */
export const ANCHOS_PANEL = {
  md: "sm:max-w-[480px]",
  lg: "sm:max-w-[640px]",
} as const

interface PanelLateralSistemaProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  descripcion?: React.ReactNode
  tamaño?: keyof typeof ANCHOS_PANEL
  /** Footer actions (secondary first, primary last). Omit for read-only panels. */
  pie?: React.ReactNode
  /** Applied to the panel itself. */
  className?: string
  children: React.ReactNode
}

/**
 * The side panel of the design system: a fixed header, a scrolling body that
 * is a `@container` (lay out fields with `@md:` / `@lg:` so they follow the
 * panel width, not the viewport) and the shared action footer with the
 * safe-area inset. Every panel uses the same padding.
 */
export function PanelLateralSistema({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  tamaño = "md",
  pie,
  className,
  children,
}: PanelLateralSistemaProps) {
  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent
        side="right"
        className={cn("w-full gap-0 p-0", ANCHOS_PANEL[tamaño], className)}
        // Without a description, tell Radix there is none instead of warning.
        {...(descripcion ? {} : { "aria-describedby": undefined })}
      >
        <SheetHeader className="gap-1 border-b border-border px-4 py-4 pr-14 sm:px-6 sm:pr-14">
          <SheetTitle className="text-lg">{titulo}</SheetTitle>
          {descripcion && <SheetDescription>{descripcion}</SheetDescription>}
        </SheetHeader>
        <div className="@container min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        {pie && (
          <PieAccionesSistema fijo={false} className="bg-background px-4 sm:px-6">
            {pie}
          </PieAccionesSistema>
        )}
      </SheetContent>
    </Sheet>
  )
}
