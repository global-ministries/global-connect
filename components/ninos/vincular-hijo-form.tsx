'use client'

import { useState } from 'react'
import { Link2, Search } from 'lucide-react'

import { BotonSistema, InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import { mensajeDeErrorFamilia } from '@/lib/platform/ninos/familia'
import { detalleHijo, parseHijosParaVincular, type HijoParaVincular } from '@/lib/platform/ninos/familias-vista'

type Props = {
  adulto: { id: string; nombre: string }
  onVinculado: () => void
  onCancelar: () => void
}

/**
 * "Vincular hijo existente" (N11, N12): finds a child under 13 already in the
 * system, with or without a ficha or a family (first and last name, full
 * name or exact cédula, through ninos_buscar_hijos_vincular), and links the
 * adult as their parent with ninos_vincular_padre. Only name, age and masked
 * cédula are shown.
 */
export function VincularHijoForm({ adulto, onVinculado, onCancelar }: Props) {
  const [q, setQ] = useState('')
  const [hijos, setHijos] = useState<HijoParaVincular[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function buscar() {
    if (q.trim().length < 3) {
      setError('Escribe el nombre y el apellido del niño, o su cédula.')
      return
    }
    setError(null)
    setGuardando(true)
    const { data, error: err } = await createClient().rpc('ninos_buscar_hijos_vincular', { p_q: q.trim(), p_padre_id: adulto.id })
    setGuardando(false)
    if (err) {
      setError(mensajeDeErrorFamilia(err))
      setHijos(null)
      return
    }
    setHijos(parseHijosParaVincular(data))
  }

  async function vincular(h: HijoParaVincular) {
    setError(null)
    setGuardando(true)
    const { error: err } = await createClient().rpc('ninos_vincular_padre', {
      p_nino_ids: [h.id],
      p_padre_id: adulto.id,
      p_padre_nuevo: null,
    })
    setGuardando(false)
    if (err) {
      setError(mensajeDeErrorFamilia(err))
      return
    }
    onVinculado()
  }

  return (
    <div className="space-y-4">
      <TextoSistema variante="sutil" tamaño="sm">
        Representante: <span className="font-medium text-foreground">{adulto.nombre}</span>
      </TextoSistema>
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void buscar()
        }}
      >
        <div className="min-w-0 flex-1">
          <InputSistema
            type="search"
            icono={Search}
            aria-label="Nombre o cédula del niño"
            placeholder="Nombre y apellido, o cédula"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <BotonSistema type="submit" icono={Search} disabled={guardando} aria-label="Buscar niño" />
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
      {hijos && hijos.length === 0 && (
        <TextoSistema variante="sutil" tamaño="sm">
          No se encontraron niños.
        </TextoSistema>
      )}
      {hijos && hijos.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {hijos.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="block break-words font-medium text-foreground">
                  {h.nombre} {h.apellido}
                </span>
                <span className="block text-xs text-muted-foreground">{detalleHijo(h)}</span>
              </span>
              <BotonSistema
                type="button"
                variante="outline"
                tamaño="sm"
                icono={Link2}
                className="shrink-0"
                disabled={guardando}
                aria-label={`Vincular a ${h.nombre} ${h.apellido}`}
                onClick={() => void vincular(h)}
              >
                Vincular
              </BotonSistema>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <BotonSistema type="button" variante="outline" onClick={onCancelar}>
          Cancelar
        </BotonSistema>
      </div>
    </div>
  )
}
