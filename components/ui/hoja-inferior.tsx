"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"

interface HojaInferiorProps {
  abierta: boolean
  onCambioAbierta: (abierta: boolean) => void
  /** Names the dialog. */
  titulo: string
  descripcion?: React.ReactNode
  /** Footer actions in a sticky equal-width grid ("Limpiar" | "Ver N personas"). */
  pie?: React.ReactNode
  /** Applied to the sheet itself. */
  className?: string
  children: React.ReactNode
}

/**
 * The phone bottom sheet of the design system (docs/design-system/mobile.md#bottom-sheets),
 * built on vaul (`ui/drawer`): grab handle, title, scrolling body, sticky footer and
 * safe-area bottom padding; up to 90% of the height with a 26px top radius. Escape,
 * the close button, the scrim and dragging down close it; vaul/Radix trap and
 * return focus. Use `DetalleResponsivo` to get the side panel on desktop.
 */
export function HojaInferior({
  abierta,
  onCambioAbierta,
  titulo,
  descripcion,
  pie,
  className,
  children,
}: HojaInferiorProps) {
  return (
    <Drawer open={abierta} onOpenChange={onCambioAbierta}>
      <DrawerContent
        className={cn(
          "gap-0 border-0 bg-card shadow-sheet",
          "data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[90vh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px] data-[vaul-drawer-direction=bottom]:border-t-0",
          // ui/drawer ships its own 100px handle as the first child; this sheet draws the 38x5 one.
          "[&>div:first-child]:hidden!",
          className
        )}
        // Without a description, tell Radix there is none instead of warning.
        {...(descripcion ? {} : { "aria-describedby": undefined })}
      >
        <div
          data-slot="hoja-agarre"
          aria-hidden="true"
          className="mx-auto mt-2 h-[5px] w-[38px] shrink-0 rounded-full bg-border"
        />
        <div className="relative grid gap-1 border-b border-border px-4.5 pt-3 pb-4 pr-14">
          <DrawerTitle className="text-lg tracking-tight">{titulo}</DrawerTitle>
          {descripcion && <DrawerDescription>{descripcion}</DrawerDescription>}
          <DrawerClose className="absolute top-1 right-2 inline-flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring touch-manipulation">
            <XIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">Cerrar</span>
          </DrawerClose>
        </div>
        <div
          data-slot="hoja-cuerpo"
          className={cn("@container min-h-0 flex-1 overflow-y-auto px-4.5 py-4", !pie && "safe-area-pb-md")}
        >
          {children}
        </div>
        {pie && (
          <div
            data-slot="hoja-pie"
            className="grid shrink-0 auto-cols-fr grid-flow-col gap-2.5 border-t border-border bg-card px-4.5 pt-3 safe-area-pb-md"
          >
            {pie}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
