"use client"

/**
 * PR21 — Wizard client component for /admin/talleres/nuevo.
 *
 * 3-step state machine:
 *   step 1 — datos del taller (nombre, edicion, tipo, link_type, sesiones,
 *            duracion, fecha_inicio_periodo, fecha_fin_periodo)
 *   step 2 — firmantes (agregar/quitar N firmantes)
 *   step 3 — cohorte (equipo existente o crear nuevo) + submit
 *
 * On submit, calls the server action `createTaller` and either
 * redirects to /admin/talleres/[id] on success or shows the error
 * inline. Validation is per-step (next button disabled until valid).
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Trash2, Send } from 'lucide-react'

import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  createTaller,
  type CreateTallerInput,
  type FirmanteInput,
} from './actions'

interface Equipo {
  id: string
  label: string
}

interface Input {
  equiposDisponibles: readonly Equipo[]
}

const STEPS = ['Datos del taller', 'Firmantes', 'Cohorte'] as const

export function CrearTallerWizard({ equiposDisponibles }: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // ─── Step 1 state ────────────────────────────────────────────────
  const [nombre, setNombre] = useState('')
  const [edicion, setEdicion] = useState('')
  const [tipo, setTipo] = useState<'individual' | 'pareja'>('individual')
  const [linkType, setLinkType] = useState<'matrimonio' | 'novios' | ''>('')
  const [sesiones, setSesiones] = useState<number>(1)
  const [duracion, setDuracion] = useState<number>(60)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  // ─── Step 2 state ────────────────────────────────────────────────
  const [firmantes, setFirmantes] = useState<FirmanteInput[]>([])

  // ─── Step 3 state ────────────────────────────────────────────────
  const [equipoModo, setEquipoModo] = useState<'existente' | 'nuevo'>('existente')
  const [equipoId, setEquipoId] = useState<string>('')
  const [equipoLabel, setEquipoLabel] = useState('')
  const [cohorteLabel, setCohorteLabel] = useState('')
  const [cohorteStartedAt, setCohorteStartedAt] = useState('')
  const [cohorteEndedAt, setCohorteEndedAt] = useState('')

  // ─── Validation per step ────────────────────────────────────────
  const step1Valid =
    nombre.trim().length > 0 &&
    edicion.trim().length > 0 &&
    (tipo === 'individual' || linkType !== '') &&
    sesiones > 0 &&
    duracion > 0 &&
    fechaInicio.length > 0 &&
    (fechaFin === '' || fechaFin > fechaInicio)

  const step2Valid = true // firmantes is optional (default [])

  const step3Valid =
    cohorteLabel.trim().length > 0 &&
    (equipoModo === 'existente' ? equipoId !== '' : equipoLabel.trim().length > 0) &&
    (cohorteStartedAt === '' || cohorteEndedAt === '' || cohorteEndedAt > cohorteStartedAt)

  function next(): void {
    setError(null)
    if (step === 0 && !step1Valid) return
    if (step === 1 && !step2Valid) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  function back(): void {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  function addFirmante(): void {
    setFirmantes((arr) => [...arr, { nombre: '', rol: '' }])
  }
  function updateFirmante(idx: number, patch: Partial<FirmanteInput>): void {
    setFirmantes((arr) => arr.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }
  function removeFirmante(idx: number): void {
    setFirmantes((arr) => arr.filter((_, i) => i !== idx))
  }

  function submit(): void {
    if (!step3Valid) return
    setError(null)
    const input: CreateTallerInput = {
      nombre,
      edicion,
      tipo,
      link_type: tipo === 'pareja' ? (linkType as 'matrimonio' | 'novios') : null,
      sesiones_estimadas: sesiones,
      duracion_estimada_minutos: duracion,
      fecha_inicio_periodo: new Date(fechaInicio).toISOString(),
      fecha_fin_periodo: fechaFin ? new Date(fechaFin).toISOString() : null,
      firmantes,
      cohorte_edicion_label: cohorteLabel,
      cohorte_started_at: cohorteStartedAt ? new Date(cohorteStartedAt).toISOString() : null,
      cohorte_ended_at: cohorteEndedAt ? new Date(cohorteEndedAt).toISOString() : null,
      equipo_id: equipoModo === 'existente' ? equipoId : null,
      equipo_label: equipoModo === 'nuevo' ? equipoLabel : null,
    }
    startTransition(async () => {
      const result = await createTaller(input)
      if (result.ok) {
        router.push(`/admin/talleres/${result.tallerId}`)
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  return (
    <div>
      {/* Step indicator */}
      <ol className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`flex items-center gap-1 ${
              i === step ? 'font-semibold text-[var(--brand-primary)]' : 'text-muted-foreground'
            }`}
          >
            <BadgeSistema variante={i === step ? 'info' : i < step ? 'success' : 'default'}>
              {i + 1}
            </BadgeSistema>
            <span>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1">→</span>}
          </li>
        ))}
      </ol>

      {/* Step content */}
      {step === 0 && (
        <TarjetaSistema variante="elevated" className="p-5">
          <TextoSistema className="text-lg font-medium">Datos del taller</TextoSistema>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Nombre del taller *">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Ej. Matrimonio 101"
              />
            </Field>
            <Field label="Edición (label único) *">
              <input
                value={edicion}
                onChange={(e) => setEdicion(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Ej. otoño-2026"
              />
            </Field>
            <Field label="Tipo *">
              <select
                value={tipo}
                onChange={(e) => {
                  const v = e.target.value as 'individual' | 'pareja'
                  setTipo(v)
                  if (v === 'individual') setLinkType('')
                }}
                className="w-full rounded border px-3 py-2"
              >
                <option value="individual">Individual</option>
                <option value="pareja">Pareja</option>
              </select>
            </Field>
            <Field label="Tipo de vínculo (solo pareja)">
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as 'matrimonio' | 'novios' | '')}
                disabled={tipo !== 'pareja'}
                className="w-full rounded border px-3 py-2 disabled:opacity-50"
              >
                <option value="">— Seleccionar —</option>
                <option value="matrimonio">Matrimonio</option>
                <option value="novios">Novios</option>
              </select>
            </Field>
            <Field label="Sesiones estimadas *">
              <input
                type="number"
                min={1}
                value={sesiones}
                onChange={(e) => setSesiones(Number(e.target.value))}
                className="w-full rounded border px-3 py-2"
              />
            </Field>
            <Field label="Duración por sesión (minutos) *">
              <input
                type="number"
                min={15}
                step={15}
                value={duracion}
                onChange={(e) => setDuracion(Number(e.target.value))}
                className="w-full rounded border px-3 py-2"
              />
            </Field>
            <Field label="Fecha inicio del periodo *">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </Field>
            <Field label="Fecha fin del periodo (opcional)">
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </Field>
          </div>
        </TarjetaSistema>
      )}

      {step === 1 && (
        <TarjetaSistema variante="elevated" className="p-5">
          <div className="flex items-center justify-between">
            <TextoSistema className="text-lg font-medium">Firmantes del certificado</TextoSistema>
            <button
              type="button"
              onClick={addFirmante}
              className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm hover:bg-[var(--brand-accent)]"
            >
              <Plus className="h-4 w-4" /> Agregar firmante
            </button>
          </div>
          <TextoSistema variante="sutil" className="mt-1 block text-sm">
            Opcional. Si la lista está vacía, los certificados se emiten sin firmas. Podés agregar firmantes después.
          </TextoSistema>
          <ul className="mt-4 grid gap-2">
            {firmantes.length === 0 ? (
              <li className="rounded border border-dashed p-3 text-center text-sm text-muted-foreground">
                Sin firmantes
              </li>
            ) : (
              firmantes.map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    value={f.nombre}
                    onChange={(e) => updateFirmante(i, { nombre: e.target.value })}
                    placeholder="Nombre"
                    className="flex-1 rounded border px-3 py-2"
                  />
                  <input
                    value={f.rol}
                    onChange={(e) => updateFirmante(i, { rol: e.target.value })}
                    placeholder="Rol (Ej. Director Pastoral)"
                    className="flex-1 rounded border px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={() => removeFirmante(i)}
                    aria-label="Quitar firmante"
                    className="rounded border p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </TarjetaSistema>
      )}

      {step === 2 && (
        <TarjetaSistema variante="elevated" className="p-5">
          <TextoSistema className="text-lg font-medium">Cohorte inicial</TextoSistema>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Label de la cohorte *">
              <input
                value={cohorteLabel}
                onChange={(e) => setCohorteLabel(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Ej. otoño-2026 (default: edicion del taller)"
              />
            </Field>
            <Field label="Inicio cohorte (opcional)">
              <input
                type="date"
                value={cohorteStartedAt}
                onChange={(e) => setCohorteStartedAt(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </Field>
            <Field label="Fin cohorte (opcional)">
              <input
                type="date"
                value={cohorteEndedAt}
                onChange={(e) => setCohorteEndedAt(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </Field>
          </div>

          <div className="mt-6">
            <TextoSistema className="font-medium">Equipo que lidera esta cohorte *</TextoSistema>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEquipoModo('existente')}
                className={`rounded border px-3 py-1.5 text-sm ${
                  equipoModo === 'existente' ? 'bg-[var(--brand-accent)] font-semibold' : ''
                }`}
              >
                Existente
              </button>
              <button
                type="button"
                onClick={() => setEquipoModo('nuevo')}
                className={`rounded border px-3 py-1.5 text-sm ${
                  equipoModo === 'nuevo' ? 'bg-[var(--brand-accent)] font-semibold' : ''
                }`}
              >
                Crear nuevo
              </button>
            </div>
            {equipoModo === 'existente' ? (
              <Field label="Equipo">
                {equiposDisponibles.length === 0 ? (
                  <TextoSistema variante="sutil" className="text-sm">
                    No hay equipos de talleres activos. Cambiá a &quot;Crear nuevo&quot;.
                  </TextoSistema>
                ) : (
                  <select
                    value={equipoId}
                    onChange={(e) => setEquipoId(e.target.value)}
                    className="w-full rounded border px-3 py-2"
                  >
                    <option value="">— Seleccionar —</option>
                    {equiposDisponibles.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : (
              <Field label="Nombre del nuevo equipo">
                <input
                  value={equipoLabel}
                  onChange={(e) => setEquipoLabel(e.target.value)}
                  className="w-full rounded border px-3 py-2"
                  placeholder="Ej. Equipo Matrimonio 101"
                />
              </Field>
            )}
          </div>
        </TarjetaSistema>
      )}

      {error && (
        <TarjetaSistema variante="outlined" className="mt-4 p-3 text-sm text-red-700">
          <TextoSistema>Error: {error}</TextoSistema>
        </TarjetaSistema>
      )}

      {/* Navigation buttons */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 0 || pending}
          className="inline-flex items-center gap-1 rounded border px-4 py-2 text-sm disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" /> Atrás
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            disabled={
              pending ||
              (step === 0 && !step1Valid) ||
              (step === 1 && !step2Valid)
            }
            className="inline-flex items-center gap-1 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={pending || !step3Valid}
            className="inline-flex items-center gap-1 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> {pending ? 'Creando…' : 'Crear taller'}
          </button>
        )}
      </div>
    </div>
  )
}

interface FieldProps {
  readonly label: string
  readonly children: ReactElement | ReactElement[]
}

function Field({ label, children }: FieldProps): ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
