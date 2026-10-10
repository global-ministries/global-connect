'use client'

/**
 * "Mis hijos" in Mi Perfil (odd/tasks/ninos-mis-hijos.md, M4): the logged-in
 * parent's children, one card each, and their data edited in a side panel
 * with the shared Niños form in parent mode. Reads and saves go through the
 * definer RPCs ninos_mis_hijos / ninos_mis_hijos_guardar with the user's
 * session; the SQL decides which children are theirs.
 */
import { useState } from 'react'

import { EditarNinoForm, type PayloadEdicionNino } from '@/components/ninos/editar-nino-form'
import { PanelLateralNinos } from '@/components/ninos/panel-lateral'
import { TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { mensajeDeErrorMisHijos, miHijoAEncontrado, parseMisHijos, type MiHijo } from '@/lib/platform/ninos/mis-hijos'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/database.types'

import { TarjetaMiHijo } from './mis-hijos-tarjeta'

type Props = {
  /** The children read on the server (ninos_mis_hijos); the section is only rendered when there is one. */
  hijos: MiHijo[]
}

export function MisHijos({ hijos: iniciales }: Props) {
  const [hijos, setHijos] = useState(iniciales)
  const [editando, setEditando] = useState<MiHijo | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function guardar(hijo: MiHijo, payload: PayloadEdicionNino): Promise<{ error: string } | null> {
    const { error } = await createClient().rpc('ninos_mis_hijos_guardar', {
      p_nino_id: hijo.id,
      p: payload as unknown as Json,
    })
    return error ? { error: mensajeDeErrorMisHijos(error) } : null
  }

  async function recargar() {
    const { data, error } = await createClient().rpc('ninos_mis_hijos')
    if (!error) setHijos(parseMisHijos(data))
  }

  function guardado(hijo: MiHijo) {
    setEditando(null)
    setAviso(`Guardamos los datos de ${hijo.nombre}.`)
    void recargar()
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
      {aviso && (
        <p role="status" className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          {aviso}
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
      <TextoSistema variante="sutil" tamaño="sm">
        ¿Falta alguno de tus hijos? El domingo, pide en la mesa de check-in de Niños que lo vinculen a tu cuenta.
      </TextoSistema>

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
            onGuardado={() => guardado(editando)}
          />
        )}
      </PanelLateralNinos>
    </section>
  )
}
