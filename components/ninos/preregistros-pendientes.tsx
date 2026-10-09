'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Mail, Trash2 } from 'lucide-react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BadgeSistema, BotonSistema, InputSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import { formDesdePreregistro, type PreregistroPayload } from '@/lib/platform/ninos/preregistro'
import { createClient } from '@/lib/supabase/client'

import type { SalonNivel } from '@/lib/platform/ninos/nivel'

import { RegistrarFamiliaForm } from './registrar-familia-form'

type Pendiente = { id: string; campus_id: string; created_at: string; payload: PreregistroPayload }

type Props = {
  /** After confirming: the parent id and "Nombre Apellido" of the first child, to select the family. */
  onConfirmado: (padreId: string, consulta: string) => void
  /** The rooms that define each child's level. */
  salones?: readonly SalonNivel[]
}

const AVISO_CORREO: Record<string, string> = {
  enviado: 'Enviamos el correo de bienvenida.',
  fallo: 'No se pudo enviar el correo de bienvenida.',
}

async function resolver(id: string, body: unknown): Promise<{ ok: boolean; datos: Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/ninos/preregistro/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const datos = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>
    return { ok: res.ok, datos }
  } catch {
    return { ok: false, datos: {} }
  }
}

async function leerPendientes(): Promise<Pendiente[]> {
  const { data } = await createClient().rpc('ninos_preregistros_pendientes')
  return Array.isArray(data) ? (data as Pendiente[]) : []
}

/** "Pre-registros pendientes" of the caller's campuses (N8), shown at check-in and Familias. */
export function PreregistrosPendientes({ onConfirmado, salones }: Props) {
  const [lista, setLista] = useState<Pendiente[]>([])
  const [abierto, setAbierto] = useState<Pendiente | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setLista(await leerPendientes())
  }, [])

  useEffect(() => {
    let vigente = true
    void leerPendientes().then((pendientes) => {
      if (vigente) setLista(pendientes)
    })
    return () => {
      vigente = false
    }
  }, [])

  function abrir(p: Pendiente) {
    setAbierto(p)
    setEmail(formDesdePreregistro(p.payload).email)
    setError(null)
  }

  async function descartar() {
    if (!abierto) return
    setOcupado(true)
    const r = await resolver(abierto.id, { accion: 'descartar' })
    setOcupado(false)
    if (!r.ok) {
      setError(typeof r.datos.error === 'string' ? r.datos.error : 'No se pudo descartar.')
      return
    }
    setAbierto(null)
    void cargar()
  }

  if (lista.length === 0 && !aviso) return null

  return (
    <TarjetaSistema className="space-y-3 p-4 md:p-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-[var(--brand-primary)]" aria-hidden />
        <TituloSistema nivel={3}>Pre-registros pendientes</TituloSistema>
        {lista.length > 0 && <BadgeSistema tamaño="sm">{lista.length}</BadgeSistema>}
      </div>
      {aviso && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {aviso}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {lista.map((p) => {
          const { form } = formDesdePreregistro(p.payload)
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => abrir(p)}
                className="flex min-h-[44px] w-full flex-col rounded-xl border border-border bg-card/50 p-3 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/40"
              >
                <span className="font-medium text-foreground">
                  {form.padre.nombre} {form.padre.apellido}
                </span>
                <span className="text-sm text-muted-foreground">
                  {form.hijos.map((h) => h.nombre).join(', ')} · {horaEnCaracas(p.created_at)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Sheet open={abierto !== null} onOpenChange={(v) => !v && setAbierto(null)}>
        <SheetContent side="right" className="h-dvh w-full max-w-none gap-0 p-0 sm:w-[640px] sm:max-w-[640px]">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>Revisar pre-registro</SheetTitle>
            <SheetDescription>Confirma los datos con la familia antes de registrarla.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-4">
            {abierto && (
              <>
                <InputSistema
                  id="pre-revision-email"
                  label="Correo del representante (opcional)"
                  aria-label="Correo del representante"
                  icono={Mail}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <TextoSistema variante="sutil" className="text-xs">
                  Con correo, le enviamos la bienvenida y, si no tiene cuenta, una invitación para crearla.
                </TextoSistema>
                {error && (
                  <p role="alert" className="text-sm text-red-500 dark:text-red-400">
                    {error}
                  </p>
                )}
                <RegistrarFamiliaForm
                  key={abierto.id}
                  inicial={formDesdePreregistro(abierto.payload).form}
                  textoGuardar="Confirmar familia"
                  salones={salones}
                  onCancelar={() => setAbierto(null)}
                  guardar={async (payload) => {
                    const r = await resolver(abierto.id, { accion: 'confirmar', payload, email: email.trim() })
                    if (!r.ok || typeof r.datos.padreId !== 'string') {
                      return { error: typeof r.datos.error === 'string' ? r.datos.error : 'No se pudo confirmar.' }
                    }
                    setAviso(['Familia registrada.', AVISO_CORREO[String(r.datos.correo)] ?? ''].filter(Boolean).join(' '))
                    return { padreId: r.datos.padreId }
                  }}
                  onRegistrada={(padreId, consulta) => {
                    setAbierto(null)
                    void cargar()
                    onConfirmado(padreId, consulta)
                  }}
                />
                <div className="pb-6">
                  <BotonSistema type="button" variante="ghost" icono={Trash2} disabled={ocupado} onClick={() => void descartar()}>
                    Descartar
                  </BotonSistema>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </TarjetaSistema>
  )
}
