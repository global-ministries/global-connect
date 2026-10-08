'use client'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type Props = {
  abierto: boolean
  titulo: string
  descripcion: string
  onCerrar: () => void
  children: React.ReactNode
}

/** The right side panel of the Niños screens (edit or complete a ficha, add a parent). */
export function PanelLateralNinos({ abierto, titulo, descripcion, onCerrar, children }: Props) {
  return (
    <Sheet open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <SheetContent side="right" className="h-dvh w-full max-w-none gap-0 p-0 sm:w-[560px] sm:max-w-[560px]">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription>{descripcion}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
