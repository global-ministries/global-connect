"use client"

import * as React from "react"

import { HojaInferior } from "@/components/ui/hoja-inferior"
import { ANCHOS_PANEL, PanelLateralSistema } from "@/components/ui/panel-lateral-sistema"

/** The phone/desktop cut of the app (docs/design-system/migration.md, decision 8). */
const CONSULTA_ESCRITORIO = "(min-width: 768px)"

function suscribir(avisar: () => void) {
  if (typeof window.matchMedia !== "function") return () => {}
  const consulta = window.matchMedia(CONSULTA_ESCRITORIO)
  consulta.addEventListener("change", avisar)
  return () => consulta.removeEventListener("change", avisar)
}

// Without matchMedia (old browsers, some tests) fall back to the desktop panel.
const leerEscritorio = () =>
  typeof window.matchMedia !== "function" || window.matchMedia(CONSULTA_ESCRITORIO).matches

// Unknown on the server: render nothing there and during hydration, then the client value.
const leerEnServidor = () => null

interface DetalleResponsivoProps {
  abierto: boolean
  onCambioAbierto: (abierto: boolean) => void
  titulo: string
  descripcion?: React.ReactNode
  /** Footer actions (secondary first, primary last). */
  pie?: React.ReactNode
  /** Side panel width at md and up; the bottom sheet is always full width. */
  ancho?: keyof typeof ANCHOS_PANEL
  children: React.ReactNode
}

/**
 * One API for detail and filter overlays (docs/design-system/patterns.md#detail-drawer):
 * `PanelLateralSistema` from md (768px) up, `HojaInferior` below md. Only one
 * overlay is mounted at a time; crossing the breakpoint swaps them. It renders
 * nothing on the server, so the markup cannot mismatch on hydration.
 */
export function DetalleResponsivo({
  abierto,
  onCambioAbierto,
  titulo,
  descripcion,
  pie,
  ancho = "md",
  children,
}: DetalleResponsivoProps) {
  const escritorio = React.useSyncExternalStore(suscribir, leerEscritorio, leerEnServidor)

  if (escritorio === null) return null

  if (escritorio) {
    return (
      <PanelLateralSistema
        abierto={abierto}
        onAbiertoChange={onCambioAbierto}
        titulo={titulo}
        descripcion={descripcion}
        tamaño={ancho}
        pie={pie}
      >
        {children}
      </PanelLateralSistema>
    )
  }

  return (
    <HojaInferior
      abierta={abierto}
      onCambioAbierta={onCambioAbierto}
      titulo={titulo}
      descripcion={descripcion}
      pie={pie}
    >
      {children}
    </HojaInferior>
  )
}
