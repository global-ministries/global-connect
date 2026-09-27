"use client"

/**
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — "Crear
 * edición" rewritten as ONE question, driven by `taller.regimen`:
 *
 *   - régimen=temporada: "¿en qué temporada?" — a SelectSistema listing
 *     the temporadas the page already excluded (this taller's own
 *     non-cancelled ediciones' temporadas, computed by the page from
 *     `taller.ediciones`), or an empty-state notice with a link to
 *     Temporadas when there is none open.
 *   - régimen=cadencia: "¿cuándo es la primera clase?" — a date input,
 *     plus an optional "crear también las próximas N" (0..6, only when
 *     `intervaloEdicionesDias` is set).
 *
 * Everything else (tipo, vínculo, modalidad, nombre, fecha fin, cierre de
 * inscripción) is derived server-side by `talleres_crear_edicion` from the
 * taller's own configuration — this form sends only p_fecha_inicio /
 * p_temporada_id / p_adelantar (via the `crearEdicion` action).
 *
 * Preview line (before confirming): "Se crearán N grupos y M clases por
 * grupo; primera clase {fecha}; última {fecha}; inscripción cierra
 * {fecha}" — computed client-side from props the page already has
 * (gruposPlantillaActivos, clasesPorGrupo, cadenciaDias,
 * cierreInscripcionOffsetDias) plus whichever date the current selection
 * implies (the picked temporada's fecha_apertura, or the chosen fecha
 * inicio) — never a second round trip. Omitted-facilitadores preview is
 * unchanged from the previous feature.
 *
 * On success: exactly one edición created → redirect straight to it
 * (rutaEdicion); more than one (cadencia + adelantar) → redirect to the
 * taller page with `?creadas=N`, which shows a BadgeSistema notice.
 */

import { useMemo, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Send } from 'lucide-react'

import {
  BotonSistema,
  EnlaceSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { crearEdicion } from '@/app/(auth)/talleres/[taller]/actions'
import { rutaEdicion, rutaTaller, rutaTemporadaCrear } from '@/lib/platform/talleres/rutas'
import type { TemporadaOption } from '@/lib/platform/talleres/temporadas'
import type { FacilitadorOmitidoPreview } from '@/lib/platform/talleres/plantilla'

const ADELANTAR_OPCIONES = [0, 1, 2, 3, 4, 5, 6]

interface Input {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly tallerNombre: string
  readonly regimen: 'temporada' | 'cadencia'
  /** Open temporadas of this taller's own dirección, MINUS the ones it already has a non-cancelled edición in (the page computes the exclusion from `taller.ediciones`). */
  readonly temporadasDisponibles: readonly TemporadaOption[]
  /** Only meaningful for régimen=cadencia: null hides "Crear también las próximas". */
  readonly intervaloEdicionesDias: number | null
  readonly cadenciaDias: number
  readonly cierreInscripcionOffsetDias: number
  /** Active plantilla clases count, or 1 when the taller has none yet (the same fallback talleres_instanciar_edicion applies). */
  readonly clasesPorGrupo: number
  readonly gruposPlantillaActivos: number
  readonly facilitadoresOmitidosPreview: readonly FacilitadorOmitidoPreview[]
}

/** Parses a `YYYY-MM-DD` (or an ISO timestamp's date part) as a UTC midnight Date, so day-math never shifts with the viewer's timezone. */
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function addDays(value: string, days: number): Date {
  return new Date(parseDateOnly(value).getTime() + days * 86_400_000)
}

function formatFechaCorta(date: Date): string {
  return date.toLocaleDateString('es', { timeZone: 'UTC' })
}

export function OpenEdicionForm({
  tallerId,
  tallerSlug,
  tallerNombre,
  regimen,
  temporadasDisponibles,
  intervaloEdicionesDias,
  cadenciaDias,
  cierreInscripcionOffsetDias,
  clasesPorGrupo,
  gruposPlantillaActivos,
  facilitadoresOmitidosPreview,
}: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [temporadaId, setTemporadaId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [adelantar, setAdelantar] = useState('0')

  const canSubmit =
    !pending && (regimen === 'temporada' ? temporadaId !== '' : fechaInicio !== '')

  function abrirDialogo(): void {
    setOpen(true)
    setError(null)
  }

  function cerrarDialogo(): void {
    setOpen(false)
    setError(null)
  }

  const fechaBaseInicio: string | null =
    regimen === 'temporada'
      ? temporadasDisponibles.find((t) => t.id === temporadaId)?.fecha_apertura ?? null
      : fechaInicio || null

  const preview = useMemo(() => {
    if (!fechaBaseInicio) return null
    const inicio = parseDateOnly(fechaBaseInicio)
    const fin = addDays(fechaBaseInicio, (clasesPorGrupo - 1) * cadenciaDias)
    const cierre = addDays(fechaBaseInicio, cierreInscripcionOffsetDias)
    return {
      inicio: formatFechaCorta(inicio),
      fin: formatFechaCorta(fin),
      cierre: formatFechaCorta(cierre),
    }
  }, [fechaBaseInicio, clasesPorGrupo, cadenciaDias, cierreInscripcionOffsetDias])

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await crearEdicion({
        tallerId,
        tallerSlug,
        fechaInicio: regimen === 'cadencia' ? fechaInicio : null,
        temporadaId: regimen === 'temporada' ? temporadaId : null,
        adelantar: regimen === 'cadencia' ? Number(adelantar) : 0,
      })
      if (result.ok) {
        setOpen(false)
        if (result.ediciones.length === 1) {
          router.push(rutaEdicion(tallerSlug, result.ediciones[0]!.edicionId))
        } else {
          router.push(`${rutaTaller(tallerSlug)}?creadas=${result.ediciones.length}`)
        }
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <BotonSistema type="button" variante="primario" tamaño="sm" icono={Plus} onClick={abrirDialogo}>
        Crear edición
      </BotonSistema>

      <Dialog open={open} onOpenChange={(next) => (next ? abrirDialogo() : cerrarDialogo())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear edición de {tallerNombre}</DialogTitle>
            <DialogDescription>
              La edición se crea en estado <strong>borrador</strong>; puedes abrirla (cambiar a{' '}
              <code>abierto</code>) después desde la página de la edición.
            </DialogDescription>
          </DialogHeader>

          {regimen === 'temporada' ? (
            temporadasDisponibles.length === 0 ? (
              // Never EstadoVacio here — it stays a server-page-only
              // primitive (per this feature's own house rule); a client
              // component builds its own inline empty state instead.
              <TarjetaSistema variante="outlined" className="p-4 text-center">
                <TextoSistema variante="sutil">
                  Tu dirección no tiene temporadas abiertas. Créala en Temporadas.
                </TextoSistema>
                <EnlaceSistema href={rutaTemporadaCrear()} variante="marca" className="mt-2 inline-block text-sm">
                  Ir a Temporadas
                </EnlaceSistema>
              </TarjetaSistema>
            ) : (
              <SelectSistema
                label="Temporada"
                value={temporadaId}
                onValueChange={setTemporadaId}
                placeholder="— Elige una temporada —"
                opciones={temporadasDisponibles.map((t) => ({ valor: t.id, etiqueta: t.nombre }))}
              />
            )
          ) : (
            <div className="grid gap-4">
              <InputSistema
                label="Primera clase"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
              {intervaloEdicionesDias !== null && (
                <div>
                  <SelectSistema
                    label="Crear también las próximas"
                    value={adelantar}
                    onValueChange={setAdelantar}
                    opciones={ADELANTAR_OPCIONES.map((n) => ({ valor: String(n), etiqueta: String(n) }))}
                  />
                  <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                    una cada {intervaloEdicionesDias} días
                  </TextoSistema>
                </div>
              )}
            </div>
          )}

          {preview && (
            <TarjetaSistema variante="outlined" className="p-3">
              <TextoSistema tamaño="sm">
                Se crearán {gruposPlantillaActivos} grupos y {clasesPorGrupo} clases por grupo; primera clase{' '}
                {preview.inicio}; última {preview.fin}; inscripción cierra {preview.cierre}.
              </TextoSistema>
              {facilitadoresOmitidosPreview.length > 0 && (
                <TextoSistema role="alert" tamaño="sm" className="mt-2 block text-warning">
                  No se asignarán porque ya no sirven en este equipo:{' '}
                  {facilitadoresOmitidosPreview.map((f) => `${f.nombre} (${f.plantillaGrupo})`).join(', ')}
                </TextoSistema>
              )}
            </TarjetaSistema>
          )}

          {error && (
            <TextoSistema role="alert" className="block text-destructive">
              {error}
            </TextoSistema>
          )}

          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={cerrarDialogo}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="button" variante="primario" icono={Send} onClick={submit} disabled={!canSubmit}>
              {pending ? 'Creando…' : 'Crear edición'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
