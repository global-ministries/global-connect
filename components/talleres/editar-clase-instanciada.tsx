'use client'

/**
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — the grupo screen's
 * clase-in-place edit: tema and fecha_programada, calling
 * talleres_editar_clase through the server action. The page decides
 * whether to render this control at all (permisos.editarEdicion AND
 * clase.estado !== 'cerrada' — hidden, never disabled, same house rule as
 * CerrarClase/EnviarReporte); this component never re-derives either
 * check, it only surfaces whatever error the action already translated
 * (e.g. CLASE_CERRADA via errores-api.ts).
 *
 * T10 (design audit) — the edit affordance's aria-label used to be the
 * generic "Editar clase"; `numero` lets it name the exact clase ("Editar
 * clase 3"), plus a `title`, matching the icon-only action convention T10
 * gave every other icon-only control in this feature.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, X } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { editarClaseInstanciada } from '@/app/(auth)/talleres/[taller]/[edicion]/[grupo]/actions'

interface Props {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly grupoId: string
  readonly sesionId: string
  readonly numero: number
  readonly tema: string | null
  readonly fechaProgramada: string
}

export function EditarClaseInstanciada({
  tallerSlug,
  edicionId,
  grupoId,
  sesionId,
  numero,
  tema,
  fechaProgramada,
}: Props): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [temaEditado, setTemaEditado] = useState(tema ?? '')
  const [fechaEditada, setFechaEditada] = useState(fechaProgramada)
  const [error, setError] = useState<string | null>(null)

  function abrir(): void {
    setTemaEditado(tema ?? '')
    setFechaEditada(fechaProgramada)
    setError(null)
    setEditando(true)
  }

  function guardar(): void {
    setError(null)
    startTransition(async () => {
      const result = await editarClaseInstanciada({
        tallerSlug,
        edicionId,
        grupoId,
        sesionId,
        tema: temaEditado,
        fechaProgramada: fechaEditada,
      })
      if (result.ok) {
        setEditando(false)
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  if (!editando) {
    return (
      <BotonSistema
        type="button"
        variante="ghost"
        soloIcono
        icono={Pencil}
        aria-label={`Editar clase ${numero}`}
        title="Editar clase"
        onClick={abrir}
      />
    )
  }

  return (
    <div className="mt-2 flex w-full flex-wrap items-center gap-2">
      <input
        aria-label="Tema de la clase"
        value={temaEditado}
        onChange={(e) => setTemaEditado(e.target.value)}
        placeholder="Ej. Intimidad con Dios"
        className="h-11 min-w-[10rem] flex-1 rounded-xl border border-border bg-card/50 px-3 py-2 text-foreground focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        autoFocus
      />
      <input
        type="date"
        aria-label="Fecha programada"
        value={fechaEditada}
        onChange={(e) => setFechaEditada(e.target.value)}
        className="h-11 rounded-xl border border-border bg-card/50 px-3 py-2 text-foreground focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
      />
      <BotonSistema
        type="button"
        variante="ghost"
        soloIcono
        icono={Check}
        aria-label="Guardar clase"
        title="Guardar clase"
        onClick={guardar}
      />
      <BotonSistema
        type="button"
        variante="ghost"
        soloIcono
        icono={X}
        aria-label="Cancelar edición de la clase"
        title="Cancelar"
        onClick={() => setEditando(false)}
      />
      {error && (
        <span role="alert" className="block w-full text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
