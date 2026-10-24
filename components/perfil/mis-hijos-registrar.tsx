'use client'

/**
 * "Agregar a mis hijos" in Mi Perfil (odd/tasks/ninos-mis-hijos.md, M5): a
 * parent registers their children from home with the shared Niños fields in
 * parent mode (school grade, never a room). The campus list comes from
 * ninos_mis_hijos_campus and the save goes through ninos_mis_hijos_registrar
 * with the user's session; the SQL links the new children to the caller only.
 */
import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'

import { CamposAutorizados, CamposNino } from '@/components/ninos/campos-nino'
import { BotonSistema, SelectSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { hijoVacio, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { LIMITES_MIS_HIJOS } from '@/lib/platform/ninos/mis-hijos'
import {
  LIMITES_REGISTRO,
  mensajeDeErrorRegistro,
  parseCampusMisHijos,
  parseResultadoRegistro,
  validarRegistroMisHijos,
  type CampusMisHijos,
  type ResultadoRegistro,
} from '@/lib/platform/ninos/mis-hijos-registrar'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/supabase/database.types'

type Props = {
  onRegistrado: (resultado: ResultadoRegistro) => void
  onCancelar: () => void
}

/** The campus to preselect: the only one, or the parent's principal campus. */
function campusInicial(campus: readonly CampusMisHijos[]): string {
  if (campus.length === 1) return campus[0].id
  return campus.find((c) => c.principal)?.id ?? ''
}

export function RegistrarMisHijosForm({ onRegistrado, onCancelar }: Props) {
  const [campus, setCampus] = useState<CampusMisHijos[] | null>(null)
  const [errorCampus, setErrorCampus] = useState(false)
  const [campusId, setCampusId] = useState('')
  const [hijos, setHijos] = useState<HijoForm[]>([hijoVacio()])
  const [autorizados, setAutorizados] = useState<AutorizadoForm[]>([])
  const [errores, setErrores] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vigente = true
    void createClient()
      .rpc('ninos_mis_hijos_campus')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) {
          setErrorCampus(true)
          return
        }
        const lista = parseCampusMisHijos(data)
        setCampus(lista)
        setCampusId(campusInicial(lista))
      })
    return () => {
      vigente = false
    }
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const r = validarRegistroMisHijos({ campusId, hijos, autorizados }, hoyEnCaracas())
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    setErrores([])
    setEnviando(true)
    const { data, error } = await createClient().rpc('ninos_mis_hijos_registrar', { p: r.payload as unknown as Json })
    setEnviando(false)
    if (error) {
      setErrores([mensajeDeErrorRegistro(error)])
      return
    }
    onRegistrado(parseResultadoRegistro(data))
  }

  if (errorCampus) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
        No pudimos cargar los campus. Cierra y vuelve a intentar.
      </p>
    )
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-6 pb-6">
      <TextoSistema variante="sutil" tamaño="sm">
        Solo el nombre, la fecha de nacimiento y el género son obligatorios. Lo demás ayuda al equipo de Niños a cuidarlo mejor.
      </TextoSistema>

      {campus && campus.length > 1 && (
        <SelectSistema
          id="registrar-campus"
          label="Campus"
          opciones={[{ valor: '', etiqueta: 'Elige…' }, ...campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
          value={campusId}
          onValueChange={setCampusId}
        />
      )}

      {hijos.map((h, i) => (
        <section key={i} aria-label={`Niño ${i + 1}`} className="space-y-4 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <TituloSistema nivel={3}>Niño {i + 1}</TituloSistema>
            {hijos.length > 1 && (
              <BotonSistema type="button" variante="ghost" tamaño="sm" icono={X} onClick={() => setHijos((xs) => xs.filter((_, j) => j !== i))}>
                Quitar
              </BotonSistema>
            )}
          </div>
          <CamposNino indice={i} hijo={h} modo="padre" onChange={(x) => setHijos((xs) => xs.map((y, j) => (j === i ? x : y)))} />
        </section>
      ))}
      {hijos.length < LIMITES_REGISTRO.hijos && (
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={Plus}
          onClick={() => setHijos((xs) => [...xs, { ...hijoVacio(), apellido: xs[0]?.apellido ?? '' }])}
        >
          Agregar otro niño
        </BotonSistema>
      )}

      <div className="space-y-3">
        <TituloSistema nivel={3}>Personas autorizadas para retirar (opcional)</TituloSistema>
        <CamposAutorizados autorizados={autorizados} onChange={setAutorizados} maximo={LIMITES_MIS_HIJOS.autorizados} />
      </div>

      {errores.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BotonSistema type="button" variante="ghost" onClick={onCancelar}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="submit" cargando={enviando}>
          Registrar
        </BotonSistema>
      </div>
    </form>
  )
}
