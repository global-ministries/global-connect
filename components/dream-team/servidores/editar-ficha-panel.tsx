'use client'

/**
 * Servidores — "Editar ficha" (T11): a right-side panel where the volunteer
 * coordinator fixes a person's personal data (birth date, cedula, gender,
 * marital status, phone, social networks). Loads the ficha from GET
 * /api/dream-team/personas/[id]/ficha and saves only the changed fields with
 * PATCH; the database decides who may do it and validates again
 * (lib/platform/dream-team/ficha-persona.ts).
 */
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BotonSistema, InputSistema, SelectSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import { ESTADOS_CIVILES, GENEROS } from '@/lib/platform/dream-team/alta-persona'
import {
  cambiosDeFicha,
  formularioDesdeFicha,
  hoyIso,
  parseEditarFicha,
  REDES_SOCIALES_MAX,
  type FichaPersona,
  type FormularioFicha,
} from '@/lib/platform/dream-team/ficha-persona'

export interface EditarFichaPanelProps {
  readonly personaId: string
  readonly nombre: string
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  readonly onGuardado: () => void
  readonly toast: ReturnType<typeof useNotificaciones>
}

const opciones = (valores: readonly string[]) => valores.map((v) => ({ valor: v, etiqueta: v }))

async function leerError(res: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { error?: unknown }
    return typeof cuerpo.error === 'string' ? cuerpo.error : porDefecto
  } catch {
    return porDefecto
  }
}

export function EditarFichaPanel({
  personaId,
  nombre,
  abierto,
  onAbiertoChange,
  onGuardado,
  toast,
}: EditarFichaPanelProps): ReactElement {
  const [ficha, setFicha] = useState<FichaPersona | null>(null)
  const [form, setForm] = useState<FormularioFicha | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const url = `/api/dream-team/personas/${encodeURIComponent(personaId)}/ficha`

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    setFicha(null)
    setForm(null)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(await leerError(res, 'No se pudo cargar la ficha.'))
        const { ficha: cargada } = (await res.json()) as { ficha: FichaPersona }
        if (!vigente) return
        setFicha(cargada)
        setForm(formularioDesdeFicha(cargada))
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo cargar la ficha.')
      }
    })()
    return () => {
      vigente = false
    }
  }, [abierto, url])

  const cambios = ficha && form ? cambiosDeFicha(ficha, form) : {}
  const hayCambios = Object.keys(cambios).length > 0

  const cambiar = (campo: keyof FormularioFicha, valor: string) => {
    setError(null)
    setForm((actual) => (actual ? { ...actual, [campo]: valor } : actual))
  }

  async function guardar(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!hayCambios || guardando) return
    const validacion = parseEditarFicha(cambios)
    if ('error' in validacion) {
      setError(validacion.error)
      return
    }
    setGuardando(true)
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      })
      if (!res.ok) {
        setError(await leerError(res, 'No se pudo guardar la ficha.'))
        return
      }
      toast.success('Ficha actualizada.')
      onGuardado()
      onAbiertoChange(false)
    } catch {
      setError('No se pudo guardar la ficha.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent side="right" className="h-dvh w-full max-w-none gap-0 p-0 sm:w-[480px] sm:max-w-[480px]">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>Editar ficha</SheetTitle>
          <SheetDescription>Corrige los datos personales de {nombre}.</SheetDescription>
        </SheetHeader>

        <form onSubmit={guardar} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4">
            {form === null && error === null && <TextoSistema variante="sutil">Cargando…</TextoSistema>}
            {form !== null && (
              <>
                <div className="grid gap-1">
                  <InputSistema
                    label="Fecha de nacimiento"
                    type="date"
                    min="1900-01-01"
                    max={hoyIso()}
                    value={form.fechaNacimiento}
                    onChange={(e) => cambiar('fechaNacimiento', e.target.value)}
                  />
                  {form.fechaNacimiento === '' && (
                    <TextoSistema variante="sutil">Sin fecha de nacimiento registrada.</TextoSistema>
                  )}
                </div>
                <InputSistema
                  label="Cédula"
                  inputMode="numeric"
                  value={form.cedula}
                  onChange={(e) => cambiar('cedula', e.target.value)}
                />
                <SelectSistema
                  label="Género"
                  opciones={opciones(GENEROS)}
                  value={form.genero}
                  onChange={(e) => cambiar('genero', e.target.value)}
                />
                <div className="grid gap-1">
                  <SelectSistema
                    label="Estado civil"
                    opciones={opciones(ESTADOS_CIVILES)}
                    value={form.estadoCivil}
                    onChange={(e) => cambiar('estadoCivil', e.target.value)}
                  />
                  {form.estadoCivil === 'No especificado' && (
                    <TextoSistema variante="sutil">Estado civil sin especificar.</TextoSistema>
                  )}
                </div>
                <InputSistema
                  label="Teléfono"
                  type="tel"
                  inputMode="tel"
                  value={form.telefono}
                  onChange={(e) => cambiar('telefono', e.target.value)}
                />
                <InputSistema
                  label="Redes sociales"
                  maxLength={REDES_SOCIALES_MAX}
                  value={form.redesSociales}
                  onChange={(e) => cambiar('redesSociales', e.target.value)}
                />
              </>
            )}
            {error !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border p-4">
            <BotonSistema type="button" variante="outline" onClick={() => onAbiertoChange(false)}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="submit" disabled={!hayCambios || guardando} cargando={guardando}>
              Guardar
            </BotonSistema>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
