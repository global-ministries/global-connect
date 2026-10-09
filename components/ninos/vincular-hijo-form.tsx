'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarCheck, Link2, Search } from 'lucide-react'

import { BotonSistema, InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import { enRangoNinos, mensajeDeErrorFamilia } from '@/lib/platform/ninos/familia'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { detalleHijo, parseHijosParaVincular, type HijoParaVincular } from '@/lib/platform/ninos/familias-vista'

type Props = {
  adulto: { id: string; nombre: string }
  onVinculado: () => void
  onCancelar: () => void
}

type Pestana = 'menores' | 'revisar'

const MIN_LETRAS = 3
const ESPERA_MS = 300

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'menores', etiqueta: 'Menores de 13' },
  { valor: 'revisar', etiqueta: 'Revisar edad' },
]

/**
 * "Vincular hijo existente" (N11, N12, N13). "Menores de 13": finds a child
 * under 13 already in the system, with or without a ficha or a family (first
 * and last name, full name or exact cédula, through
 * ninos_buscar_hijos_vincular), and links the adult as their parent with
 * ninos_vincular_padre. "Revisar edad": same search over people 13+ or with
 * no birth date who are not married (ninos_buscar_hijos_revisar_edad), for
 * children registered with a wrong date; linking requires a corrected birth
 * date under 13, saved by ninos_vincular_revisando_edad before the link.
 * Only name, age and masked cédula are shown. N14: a single word of 3+
 * letters (first OR last name) also searches, and the search runs as you
 * type (debounced) as well as on Enter / the button.
 */
export function VincularHijoForm({ adulto, onVinculado, onCancelar }: Props) {
  const [pestana, setPestana] = useState<Pestana>('menores')
  const [q, setQ] = useState('')
  const [hijos, setHijos] = useState<HijoParaVincular[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [fechaCorregida, setFechaCorregida] = useState('')
  const ultimaBusqueda = useRef(0)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (q.trim().length < MIN_LETRAS) return
    espera.current = setTimeout(() => void buscar(), ESPERA_MS)
    return () => {
      if (espera.current) clearTimeout(espera.current)
    }
    // buscar reads the current q and pestana; re-run only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pestana])

  function cambiarPestana(p: Pestana) {
    ultimaBusqueda.current++
    setPestana(p)
    setHijos(null)
    setError(null)
    setCorrigiendo(null)
  }

  async function buscar() {
    // Enter / the button searches now: the pending typed search is not needed.
    if (espera.current) clearTimeout(espera.current)
    espera.current = null
    if (q.trim().length < MIN_LETRAS) {
      setError('Escribe al menos 3 letras del nombre o del apellido, o la cédula.')
      return
    }
    const id = ++ultimaBusqueda.current
    setError(null)
    setCorrigiendo(null)
    const rpcBuscar = pestana === 'menores' ? 'ninos_buscar_hijos_vincular' : 'ninos_buscar_hijos_revisar_edad'
    const { data, error: err } = await createClient().rpc(rpcBuscar, { p_q: q.trim(), p_padre_id: adulto.id })
    // A newer search (typing or a tab change) already started: drop this one.
    if (id !== ultimaBusqueda.current) return
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

  async function vincularConFecha(h: HijoParaVincular) {
    if (!enRangoNinos(fechaCorregida, hoyEnCaracas())) {
      setError(mensajeDeErrorFamilia({ message: 'edad_fuera_de_rango' }))
      return
    }
    setError(null)
    setGuardando(true)
    const { error: err } = await createClient().rpc('ninos_vincular_revisando_edad', {
      p_nino_id: h.id,
      p_fecha_nacimiento: fechaCorregida,
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
      <div role="tablist" aria-label="Tipo de búsqueda" className="flex gap-1 rounded-xl border border-border p-1">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            role="tab"
            aria-selected={pestana === p.valor}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              pestana === p.valor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => cambiarPestana(p.valor)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      {pestana === 'revisar' && (
        <TextoSistema variante="sutil" tamaño="sm">
          Personas de 13 años o más, o sin fecha de nacimiento (no casadas). Si es un niño registrado con una fecha
          equivocada, corrige su fecha de nacimiento para vincularlo.
        </TextoSistema>
      )}
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
            placeholder="Nombre, apellido o cédula"
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
          {pestana === 'menores' ? 'No se encontraron niños.' : 'No se encontraron personas para revisar.'}
        </TextoSistema>
      )}
      {hijos && hijos.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {hijos.map((h) => (
            <li key={h.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block break-words font-medium text-foreground">
                    {h.nombre} {h.apellido}
                  </span>
                  <span className="block text-xs text-muted-foreground">{detalleHijo(h, { conFecha: pestana === 'revisar' })}</span>
                </span>
                {pestana === 'menores' ? (
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
                ) : (
                  <BotonSistema
                    type="button"
                    variante="outline"
                    tamaño="sm"
                    icono={CalendarCheck}
                    className="shrink-0"
                    disabled={guardando}
                    aria-label={`Corregir edad de ${h.nombre} ${h.apellido}`}
                    onClick={() => {
                      setCorrigiendo(h.id)
                      // Start from the current date so the host only adjusts what is wrong (often the year).
                      setFechaCorregida(h.fecha_nacimiento ?? '')
                      setError(null)
                    }}
                  >
                    Corregir edad
                  </BotonSistema>
                )}
              </div>
              {pestana === 'revisar' && corrigiendo === h.id && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs text-muted-foreground">
                    Fecha de nacimiento correcta
                    <InputSistema
                      type="date"
                      aria-label={`Fecha de nacimiento corregida de ${h.nombre} ${h.apellido}`}
                      max={hoyEnCaracas()}
                      value={fechaCorregida}
                      onChange={(e) => setFechaCorregida(e.target.value)}
                    />
                  </label>
                  <BotonSistema
                    type="button"
                    tamaño="sm"
                    icono={Link2}
                    disabled={guardando || fechaCorregida === ''}
                    aria-label={`Guardar fecha y vincular a ${h.nombre} ${h.apellido}`}
                    onClick={() => void vincularConFecha(h)}
                  >
                    Guardar y vincular
                  </BotonSistema>
                </div>
              )}
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
