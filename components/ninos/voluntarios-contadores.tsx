import type { Contadores } from '@/lib/platform/ninos/voluntarios'

/** The counters of the selected area, sticky under the page header while scrolling. */
export function ContadoresVoluntarios({ contadores }: { contadores: Contadores }) {
  const cifras = [
    { id: 'esperados', etiqueta: 'Esperados', valor: contadores.esperados },
    { id: 'presentes', etiqueta: 'Presentes', valor: contadores.presentes },
    { id: 'avisos', etiqueta: 'Avisó', valor: contadores.avisos },
    { id: 'faltas', etiqueta: 'Faltó', valor: contadores.faltas },
    { id: 'sin-marcar', etiqueta: 'Sin marcar', valor: contadores.sinMarcar },
  ]
  return (
    <section
      aria-label="Resumen"
      className="sticky top-16 z-10 -mx-4 border-b border-[var(--glass-border)] bg-[var(--surface-primary)]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:top-14 lg:-mx-12 lg:px-12"
    >
      <dl className="grid grid-cols-5 gap-1 text-center">
        {cifras.map((c) => (
          <div key={c.id} data-testid={`contador-${c.id}`} className="min-w-0">
            <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c.etiqueta}</dt>
            <dd className="text-xl font-bold tabular-nums text-foreground">{c.valor}</dd>
          </div>
        ))}
      </dl>
      {contadores.extras > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Presentes incluye {contadores.extras} {contadores.extras === 1 ? 'voluntario' : 'voluntarios'} sin turno ese día.
        </p>
      )}
    </section>
  )
}
