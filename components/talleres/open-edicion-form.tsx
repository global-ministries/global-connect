"use client"

/**
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — "Crear
 * edición" rewritten as ONE question, driven by `taller.regimen`:
 *
 *   - régimen=temporada: "¿en qué temporada?" — a SelectSistema listing
 *     the temporadas the page already excluded (this taller's own
 *     non-cancelled ediciones' temporadas, computed by the page from
 *     `taller.ediciones`), or a short notice when there is none open
 *     (R3l, odd/tasks/talleres-rediseno.md L11: Temporadas is hidden from
 *     Talleres, so the notice no longer links to it).
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
 *
 * Próximo Paso (odd/tasks/proximo-paso.md T1) — a taller anchored to the
 * first Sunday of each month (`anclaEdiciones`) asks for a first Sunday
 * (anything else is refused inline, before the RPC refuses it with
 * FECHA_NO_ES_PRIMER_DOMINGO), offers "crear también las próximas" without
 * an intervalo, and previews each edición's own first Sunday.
 *
 * T10 (odd/tasks/talleres-reserva-publica.md, S6) — optional «Lugar» and
 * «Indicaciones para los participantes» (CamposDatosPracticos), saved on
 * every edición created; they travel in the notices. If the ediciones are
 * created but those two could not be saved, a notice says so and the
 * redirect still happens (they can be added from the edición).
 *
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2) — «Abrir edición» of the v2
 * taller page (artboard design/talleres-interior/22 `#abrir`): the form now
 * lives in a DetalleResponsivo (side panel from md, bottom sheet on phones)
 * instead of a centered Dialog, with Cancelar / Crear edición in its footer.
 * Same fields, preview and write. It can be controlled (`abierto` /
 * `onCambioAbierto`, the page's header button opens it) or render its own
 * «Abrir edición» trigger when uncontrolled.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Send } from 'lucide-react'

import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'

import { crearEdicion } from '@/app/(auth)/talleres/[taller]/actions'
import { CamposDatosPracticos } from '@/components/talleres/campos-datos-practicos'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { rutaEdicion, rutaTaller } from '@/lib/platform/talleres/rutas'
import type { TemporadaOption } from '@/lib/platform/talleres/temporadas'
import type { FacilitadorOmitidoPreview } from '@/lib/platform/talleres/plantilla'
import {
  esPrimerDomingoDelMes,
  fechasEdicionesAncladas,
  type AnclaEdiciones,
} from '@/lib/platform/talleres/ancla-ediciones'

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
  /** Régimen=cadencia only: 'primer_domingo_mes' = one edición per month on its first Sunday (no intervalo needed). */
  readonly anclaEdiciones?: AnclaEdiciones | null
  readonly cadenciaDias: number
  readonly cierreInscripcionOffsetDias: number
  /** Active plantilla clases count, or 1 when the taller has none yet (the same fallback talleres_instanciar_edicion applies). */
  readonly clasesPorGrupo: number
  readonly gruposPlantillaActivos: number
  readonly facilitadoresOmitidosPreview: readonly FacilitadorOmitidoPreview[]
  /** Controlled open state; omit both to let the form render its own «Abrir edición» trigger. */
  readonly abierto?: boolean
  readonly onCambioAbierto?: (abierto: boolean) => void
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
  anclaEdiciones = null,
  cadenciaDias,
  cierreInscripcionOffsetDias,
  clasesPorGrupo,
  gruposPlantillaActivos,
  facilitadoresOmitidosPreview,
  abierto,
  onCambioAbierto,
}: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [abiertoPropio, setAbiertoPropio] = useState(false)
  const controlado = abierto !== undefined
  const open = controlado ? abierto : abiertoPropio
  const setOpen = (siguiente: boolean): void => {
    if (!controlado) setAbiertoPropio(siguiente)
    onCambioAbierto?.(siguiente)
  }

  const [temporadaId, setTemporadaId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [adelantar, setAdelantar] = useState('0')
  const [lugar, setLugar] = useState('')
  const [indicaciones, setIndicaciones] = useState('')
  const notificar = useNotificaciones()

  const anclado = regimen === 'cadencia' && anclaEdiciones === 'primer_domingo_mes'
  const fechaFueraDeAncla = anclado && fechaInicio !== '' && !esPrimerDomingoDelMes(fechaInicio)
  const puedeAdelantar = anclado || intervaloEdicionesDias !== null

  const canSubmit =
    !pending &&
    (regimen === 'temporada' ? temporadaId !== '' : fechaInicio !== '' && !fechaFueraDeAncla)

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
      : fechaFueraDeAncla
        ? null
        : fechaInicio || null

  const fechasAncladas =
    anclado && fechaBaseInicio && Number(adelantar) > 0
      ? fechasEdicionesAncladas(fechaBaseInicio, Number(adelantar))
      : null

  // Plain derivation: the React Compiler memoizes it.
  const preview = fechaBaseInicio
    ? {
        inicio: formatFechaCorta(parseDateOnly(fechaBaseInicio)),
        fin: formatFechaCorta(addDays(fechaBaseInicio, (clasesPorGrupo - 1) * cadenciaDias)),
        cierre: formatFechaCorta(addDays(fechaBaseInicio, cierreInscripcionOffsetDias)),
      }
    : null

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
        // Only when filled: an empty pair keeps the previous call shape.
        ...(lugar.trim() !== '' || indicaciones.trim() !== '' ? { lugar, indicaciones } : {}),
      })
      if (result.ok) {
        setOpen(false)
        if (result.advertencia) notificar.info(result.advertencia)
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

  const formulario = (
    <div className="grid gap-4">
      {regimen === 'temporada' ? (
        temporadasDisponibles.length === 0 ? (
          // Never EstadoVacio here — it stays a server-page-only
          // primitive (per this feature's own house rule); a client
          // component builds its own inline empty state instead.
          <TarjetaSistema variante="outlined" className="p-4 text-center">
            <TextoSistema variante="sutil">
              Este taller está en régimen por temporada y no tiene temporadas abiertas.
            </TextoSistema>
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
          <div>
            <InputSistema
              label="Primera clase"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
            {anclado && (
              <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                Elige el primer domingo del mes.
              </TextoSistema>
            )}
            {fechaFueraDeAncla && (
              <TextoSistema role="alert" tamaño="sm" className="mt-1 block text-danger-text">
                La primera clase debe ser el primer domingo del mes.
              </TextoSistema>
            )}
          </div>
          {puedeAdelantar && (
            <div>
              <SelectSistema
                label="Crear también las próximas"
                value={adelantar}
                onValueChange={setAdelantar}
                opciones={ADELANTAR_OPCIONES.map((n) => ({ valor: String(n), etiqueta: String(n) }))}
              />
              <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                {anclado ? 'una por mes, el primer domingo' : `una cada ${intervaloEdicionesDias} días`}
              </TextoSistema>
            </div>
          )}
        </div>
      )}

      {!(regimen === 'temporada' && temporadasDisponibles.length === 0) && (
        <CamposDatosPracticos
          lugar={lugar}
          indicaciones={indicaciones}
          onLugarChange={setLugar}
          onIndicacionesChange={setIndicaciones}
          disabled={pending}
        />
      )}

      {preview && (
        <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
          <TextoSistema tamaño="sm">
            Se crearán {gruposPlantillaActivos} grupos y {clasesPorGrupo} clases por grupo; primera clase{' '}
            {preview.inicio}; última {preview.fin}; inscripción cierra {preview.cierre}.
          </TextoSistema>
          {fechasAncladas && (
            <TextoSistema tamaño="sm" className="mt-2 block">
              {`Se crearán ${fechasAncladas.length} ediciones, una el primer domingo de cada mes: ${fechasAncladas
                .map((f) => formatFechaCorta(parseDateOnly(f)))
                .join(', ')}.`}
            </TextoSistema>
          )}
          {facilitadoresOmitidosPreview.length > 0 && (
            <TextoSistema role="alert" tamaño="sm" className="mt-2 block text-warning-text">
              No se asignarán porque ya no sirven en este equipo:{' '}
              {facilitadoresOmitidosPreview.map((f) => `${f.nombre} (${f.plantillaGrupo})`).join(', ')}
            </TextoSistema>
          )}
        </div>
      )}

      {error && (
        <TextoSistema role="alert" className="block text-danger-text">
          {error}
        </TextoSistema>
      )}
    </div>
  )

  return (
    <>
      {!controlado && (
        <BotonSistema type="button" variante="primario" tamaño="sm" icono={Plus} onClick={abrirDialogo} aria-haspopup="dialog">
          Abrir edición
        </BotonSistema>
      )}

      <DetalleResponsivo
        abierto={open}
        onCambioAbierto={(next) => (next ? abrirDialogo() : cerrarDialogo())}
        titulo="Abrir edición"
        descripcion={
          <>
            {tallerNombre} · se copian la plantilla de clases y los grupos. La edición se crea en{' '}
            <strong>borrador</strong>; puedes abrirla a inscripciones después desde su página.
          </>
        }
        pie={
          <>
            <BotonSistema type="button" variante="outline" onClick={cerrarDialogo}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="button" variante="primario" icono={Send} onClick={submit} disabled={!canSubmit}>
              {pending ? 'Creando…' : 'Crear edición'}
            </BotonSistema>
          </>
        }
      >
        {formulario}
      </DetalleResponsivo>
    </>
  )
}
