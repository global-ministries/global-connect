'use client'

/**
 * "Mis hijos" in Mi Perfil (odd/tasks/ninos-mis-hijos.md, M4 and M5): the
 * logged-in parent's children, one card each, their data edited in a side
 * panel with the shared Niños form in parent mode, and "Agregar a mis hijos"
 * to register a child from home (always shown, also with no children). Reads
 * and saves go through the definer RPCs ninos_mis_hijos / ninos_mis_hijos_guardar
 * / ninos_mis_hijos_registrar with the user's session; the SQL decides which
 * children are theirs. A likely duplicate waits as a pending request until
 * the check-in table confirms it.
 */
import { useState } from 'react'
import { Clock, Plus, RefreshCw } from 'lucide-react'

import { EditarNinoForm, type PayloadEdicionNino } from '@/components/ninos/editar-nino-form'
import { PanelLateralNinos } from '@/components/ninos/panel-lateral'
import { BotonSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { mensajeDeErrorMisHijos, miHijoAEncontrado, parseMisHijos, type MiHijo } from '@/lib/platform/ninos/mis-hijos'
import {
  mensajeRegistro,
  parsePendientesMisHijos,
  type NombreHijo,
  type ResultadoRegistro,
} from '@/lib/platform/ninos/mis-hijos-registrar'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/database.types'

import { RegistrarMisHijosForm } from './mis-hijos-registrar'
import { TarjetaMiHijo } from './mis-hijos-tarjeta'

/**
 * The notice after a save or a registration; desactualizado when the list
 * could not be read again, pendientes for children waiting for the table.
 */
type Aviso = { texto: string; desactualizado: boolean; pendientes?: string | null }

type Props = {
  /** The children read on the server (ninos_mis_hijos); may be empty. */
  hijos: MiHijo[]
  /** My requests waiting for the check-in table (ninos_mis_hijos_pendientes). */
  pendientes?: NombreHijo[]
}

export function MisHijos({ hijos: iniciales, pendientes: pendientesIniciales = [] }: Props) {
  const [hijos, setHijos] = useState(iniciales)
  const [pendientes, setPendientes] = useState(pendientesIniciales)
  const [editando, setEditando] = useState<MiHijo | null>(null)
  const [registrando, setRegistrando] = useState(false)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [recargando, setRecargando] = useState(false)

  async function guardar(hijo: MiHijo, payload: PayloadEdicionNino): Promise<{ error: string } | null> {
    const { error } = await createClient().rpc('ninos_mis_hijos_guardar', {
      p_nino_id: hijo.id,
      p: payload as unknown as Json,
    })
    return error ? { error: mensajeDeErrorMisHijos(error) } : null
  }

  /** Reads the list again; false when it could not be refreshed (the cards keep the old data). */
  async function recargar(): Promise<boolean> {
    setRecargando(true)
    const { data, error } = await createClient().rpc('ninos_mis_hijos')
    setRecargando(false)
    if (error) return false
    setHijos(parseMisHijos(data))
    return true
  }

  async function guardado(hijo: MiHijo) {
    setEditando(null)
    const ok = await recargar()
    setAviso(
      ok
        ? { texto: `Guardamos los datos de ${hijo.nombre}.`, desactualizado: false }
        : { texto: `Guardamos los datos de ${hijo.nombre}, pero no pudimos actualizar la lista.`, desactualizado: true },
    )
  }

  async function registrado(resultado: ResultadoRegistro) {
    setRegistrando(false)
    const textos = mensajeRegistro(resultado)
    const [ok, lista] = await Promise.all([
      resultado.registrados.length > 0 ? recargar() : Promise.resolve(true),
      createClient().rpc('ninos_mis_hijos_pendientes'),
    ])
    // A failed read keeps what we know: the pending children just returned.
    setPendientes(lista.error ? (xs) => [...xs, ...resultado.pendientes] : parsePendientesMisHijos(lista.data))
    const listos = textos.listos ?? ''
    setAviso(
      ok
        ? { texto: listos, desactualizado: false, pendientes: textos.pendientes }
        : { texto: `${listos} No pudimos actualizar la lista.`.trim(), desactualizado: true, pendientes: textos.pendientes },
    )
  }

  async function reintentar() {
    if (await recargar()) setAviso(null)
  }

  return (
    <section aria-labelledby="mis-hijos-titulo" className="space-y-4">
      <div className="space-y-1">
        <TituloSistema nivel={2} id="mis-hijos-titulo">
          Mis hijos
        </TituloSistema>
        <TextoSistema variante="sutil" tamaño="sm">
          Mantén sus datos al día: el equipo de Niños los usa el domingo al recibirlos.
        </TextoSistema>
      </div>
      {aviso && !aviso.desactualizado && aviso.texto && (
        <p role="status" className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          {aviso.texto}
        </p>
      )}
      {aviso?.pendientes && (
        <p role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          {aviso.pendientes}
        </p>
      )}
      {aviso?.desactualizado && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400"
        >
          <p>{aviso.texto}</p>
          <BotonSistema type="button" variante="outline" tamaño="sm" icono={RefreshCw} disabled={recargando} onClick={() => void reintentar()}>
            Actualizar lista
          </BotonSistema>
        </div>
      )}
      {hijos.length === 0 && pendientes.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Aún no tienes hijos registrados en Niños. Agrégalos aquí y el domingo solo tendrás que confirmar en la mesa.
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {hijos.map((h) => (
          <li key={h.id}>
            <TarjetaMiHijo
              hijo={h}
              onEditar={() => {
                setAviso(null)
                setEditando(h)
              }}
            />
          </li>
        ))}
      </ul>
      {pendientes.length > 0 && (
        <div className="space-y-2">
          <TextoSistema tamaño="sm" className="font-medium">
            Pendientes de confirmar
          </TextoSistema>
          <ul aria-label="Pendientes de confirmar" className="grid gap-3 sm:grid-cols-2">
            {pendientes.map((p, i) => (
              <li key={`${p.nombre}-${p.apellido}-${i}`} className="flex items-start gap-3 rounded-2xl border border-dashed border-border p-4">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="break-words text-[15px] font-semibold text-foreground">
                    {p.nombre} {p.apellido}
                  </p>
                  <TextoSistema variante="sutil" tamaño="sm">
                    Pendiente de confirmar en la mesa
                  </TextoSistema>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <BotonSistema
        type="button"
        variante="outline"
        icono={Plus}
        className="w-full sm:w-auto"
        onClick={() => {
          setAviso(null)
          setRegistrando(true)
        }}
      >
        Agregar a mis hijos
      </BotonSistema>
      <TextoSistema variante="sutil" tamaño="sm">
        ¿Tu hijo ya está registrado con otro representante? El domingo, pide en la mesa de check-in de Niños que lo vinculen a tu cuenta.
      </TextoSistema>

      <PanelLateralNinos
        abierto={registrando}
        titulo="Agregar a mis hijos"
        descripcion="Regístralos desde casa: el domingo solo confirmas en la mesa."
        onCerrar={() => setRegistrando(false)}
      >
        {registrando && <RegistrarMisHijosForm onRegistrado={(r) => void registrado(r)} onCancelar={() => setRegistrando(false)} />}
      </PanelLateralNinos>

      <PanelLateralNinos
        abierto={editando !== null}
        titulo="Editar datos"
        descripcion={editando ? `Datos de ${editando.nombre} ${editando.apellido}.` : ''}
        onCerrar={() => setEditando(null)}
      >
        {editando && (
          <EditarNinoForm
            key={editando.id}
            hijo={miHijoAEncontrado(editando)}
            modo="padre"
            identidadEditable={editando.puede_editar_identidad}
            guardar={(payload) => guardar(editando, payload)}
            onCancelar={() => setEditando(null)}
            onGuardado={() => void guardado(editando)}
          />
        )}
      </PanelLateralNinos>
    </section>
  )
}
