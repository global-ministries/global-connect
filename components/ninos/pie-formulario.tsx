/**
 * The sticky action footer of the Niños forms. It takes the page/sheet
 * background and a top border so it reads as separate from the scrolling
 * content, and keeps clear of the iOS home indicator.
 */
export function PieFormulario({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-border bg-background pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  )
}
