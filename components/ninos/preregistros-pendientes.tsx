'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Mail, RotateCw, Trash2, UserRound } from 'lucide-react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BadgeSistema, BotonSistema, InputSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import {
  conExistentes,
  formDesdePreregistro,
  parseCuentasPreregistro,
  type CuentaPreregistro,
  type PreregistroPayload,
} from '@/lib/platform/ninos/preregistro'
import { createClient } from '@/lib/supabase/client'

import type { SalonNivel } from '@/lib/platform/ninos/nivel'

import { CoincidenciasCuenta } from './coincidencias-cuenta'
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

const AVISO_INVITACION: Record<string, string> = {
  enviada: 'Le enviamos una invitación para crear su cuenta.',
  fallo: 'No se pudo enviar la invitación para crear la cuenta.',
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

type Lista = { pendientes: Pendiente[]; cuentas: Record<string, CuentaPreregistro> }

async function leerPendientes(): Promise<Lista> {
  const cliente = createClient()
  const [pendientes, cuentas] = await Promise.all([
    cliente.rpc('ninos_preregistros_pendientes'),
    // Requests made from an account: the requester and the likely duplicates (M6a).
    cliente.rpc('ninos_preregistros_cuentas'),
  ])
  return {
    pendientes: Array.isArray(pendientes.data) ? (pendientes.data as Pendiente[]) : [],
    cuentas: parseCuentasPreregistro(cuentas.data),
  }
}

const nombreCompleto = (p: { nombre: string; apellido: string }) => `${p.nombre} ${p.apellido}`.trim()

/** "Pre-registros pendientes" of the caller's campuses (N8), shown at check-in and Familias. */
export function PreregistrosPendientes({ onConfirmado, salones }: Props) {
  const [lista, setLista] = useState<Pendiente[]>([])
  const [cuentas, setCuentas] = useState<Record<string, CuentaPreregistro>>({})
  const [abierto, setAbierto] = useState<Pendiente | null>(null)
  /** Child position → the existing person the team recognised (linked instead of created). */
  const [elegidos, setElegidos] = useState<Record<number, string>>({})
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  /** The last confirmed pre-registration whose account invitation failed (resend within the hour). */
  const [fallida, setFallida] = useState<{ id: string; email: string } | null>(null)
  const [reenvio, setReenvio] = useState<{ error: boolean; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const r = await leerPendientes()
    setLista(r.pendientes)
    setCuentas(r.cuentas)
  }, [])

  useEffect(() => {
    let vigente = true
    void leerPendientes().then((r) => {
      if (!vigente) return
      setLista(r.pendientes)
      setCuentas(r.cuentas)
    })
    return () => {
      vigente = false
    }
  }, [])

  function abrir(p: Pendiente) {
    setAbierto(p)
    setElegidos({})
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

  async function reenviarInvitacion() {
    if (!fallida) return
    setOcupado(true)
    const r = await resolver(fallida.id, { accion: 'invitar', email: fallida.email })
    setOcupado(false)
    if (r.ok) {
      setReenvio({ error: false, texto: `Invitación reenviada a ${fallida.email}.` })
      setFallida(null)
      return
    }
    const mensaje = typeof r.datos.error === 'string' ? r.datos.error : 'No se pudo enviar la invitación. Intenta de nuevo.'
    setReenvio({ error: true, texto: mensaje })
    // Only a transient failure can be retried; a refusal (time, operator, account) cannot.
    if (typeof r.datos.codigo === 'string') setFallida(null)
  }

  if (lista.length === 0 && !aviso) return null

  const cuentaAbierta = abierto ? cuentas[abierto.id] : undefined
  const formAbierto = abierto ? formDesdePreregistro(abierto.payload).form : undefined
  // A request from an account: the requester is the parent (never a new adult).
  const inicialAbierto =
    formAbierto && cuentaAbierta ? { ...formAbierto, padre: { ...formAbierto.padre, id: cuentaAbierta.solicitante.id } } : formAbierto

  return (
    <TarjetaSistema className="space-y-3 p-4 md:p-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-[var(--brand-primary)]" aria-hidden />
        <TituloSistema nivel={3}>Pre-registros pendientes</TituloSistema>
        {lista.length > 0 && <BadgeSistema tamaño="sm">{lista.length}</BadgeSistema>}
      </div>
      {aviso && (
        <p role="status" className="text-sm text-success-text">
          {aviso}
        </p>
      )}
      {fallida && (
        <BotonSistema type="button" variante="outline" tamaño="sm" icono={RotateCw} disabled={ocupado} onClick={() => void reenviarInvitacion()}>
          Reenviar invitación
        </BotonSistema>
      )}
      {reenvio && (
        <p
          role={reenvio.error ? 'alert' : 'status'}
          className={reenvio.error ? 'text-sm text-danger-text' : 'text-sm text-success-text'}
        >
          {reenvio.texto}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {lista.map((p) => {
          const { form } = formDesdePreregistro(p.payload)
          const cuenta = cuentas[p.id]
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => abrir(p)}
                className="flex min-h-[44px] w-full flex-col rounded-xl border border-border bg-card/50 p-3 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/40"
              >
                <span className="font-medium text-foreground">
                  {cuenta ? nombreCompleto(cuenta.solicitante) : `${form.padre.nombre} ${form.padre.apellido}`}
                </span>
                {cuenta && (
                  <span className="flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)]">
                    <UserRound className="h-3.5 w-3.5" aria-hidden />
                    Desde la cuenta de {nombreCompleto(cuenta.solicitante)}
                  </span>
                )}
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
                  <p role="alert" className="text-sm text-danger-text">
                    {error}
                  </p>
                )}
                {cuentaAbierta && cuentaAbierta.coincidencias.length > 0 && (
                  <CoincidenciasCuenta
                    hijos={formAbierto?.hijos ?? []}
                    coincidencias={cuentaAbierta.coincidencias}
                    elegidos={elegidos}
                    onElegir={(indice, id) =>
                      setElegidos((e) => {
                        const siguiente = { ...e }
                        if (id) siguiente[indice] = id
                        else delete siguiente[indice]
                        return siguiente
                      })
                    }
                  />
                )}
                <RegistrarFamiliaForm
                  key={abierto.id}
                  inicial={inicialAbierto}
                  padreExistente={
                    cuentaAbierta
                      ? { id: cuentaAbierta.solicitante.id, nombre: nombreCompleto(cuentaAbierta.solicitante) }
                      : undefined
                  }
                  textoGuardar="Confirmar familia"
                  salones={salones}
                  onCancelar={() => setAbierto(null)}
                  guardar={async (datos) => {
                    const payload = cuentaAbierta ? conExistentes(datos, elegidos) : datos
                    const r = await resolver(abierto.id, { accion: 'confirmar', payload, email: email.trim() })
                    if (!r.ok || typeof r.datos.padreId !== 'string') {
                      return { error: typeof r.datos.error === 'string' ? r.datos.error : 'No se pudo confirmar.' }
                    }
                    setAviso(
                      ['Familia registrada.', AVISO_CORREO[String(r.datos.correo)], AVISO_INVITACION[String(r.datos.invitacion)]]
                        .filter(Boolean)
                        .join(' '),
                    )
                    setReenvio(null)
                    setFallida(r.datos.invitacion === 'fallo' && email.trim() ? { id: abierto.id, email: email.trim().toLowerCase() } : null)
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
