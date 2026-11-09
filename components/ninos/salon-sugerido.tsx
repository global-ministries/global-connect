'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import { fechaPasadaValida, GRADOS, mensajeDeErrorFamilia } from '@/lib/platform/ninos/familia'
import { TEXTO_FALTA, type HijoEncontrado, type SalonParaHijo } from '@/lib/platform/ninos/familias-vista'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import type { DatoFaltante } from '@/lib/platform/ninos/sugerir-salon'
import type { Json } from '@/lib/supabase/database.types'

type HijoDatos = Pick<HijoEncontrado, 'id' | 'nombre' | 'fecha_nacimiento' | 'grado'>

type Props = {
  hijo: HijoDatos
  resultado: SalonParaHijo
  /** After the missing data is saved: reload so the salón is recomputed. */
  onGuardado: () => void
}

/**
 * The room shown for a child (D4): the suggestion when the rules find one.
 * When they find none it asks for the missing data (S9.6, L38: "Pide
 * completar el dato que falta"); a room that does not correspond is never
 * offered. Never guesses.
 */
export function SalonSugerido({ hijo, resultado, onGuardado }: Props) {
  if (resultado.tipo !== 'ninguno') {
    return (
      <BadgeSistema variante={resultado.tipo === 'elegido' ? 'success' : 'info'} tamaño="sm" className="whitespace-normal">
        {resultado.tipo === 'elegido' ? 'Salón asignado' : 'Salón sugerido'}: {resultado.salon.nombre}
      </BadgeSistema>
    )
  }
  if (resultado.falta === null) {
    return (
      <BadgeSistema variante="warning" tamaño="sm" className="whitespace-normal">
        Su salón está cerrado hoy.
      </BadgeSistema>
    )
  }
  return <CompletarDatoSalon hijo={hijo} falta={resultado.falta} onGuardado={onGuardado} />
}

type PropsCompletar = {
  hijo: HijoDatos
  falta: DatoFaltante
  onGuardado: () => void
}

const SIN_CAMBIOS: Record<DatoFaltante, string> = {
  grado: 'Elige el grado.',
  fecha_o_grado: 'Completa la fecha de nacimiento o el grado.',
  revisar: 'Cambia la fecha de nacimiento o el grado.',
}

/**
 * What keeps the child out of every salón and the fields to fix it right
 * there (S9.6): the grade, or the birth date and the grade. Saves to the
 * ficha with the team's edit (ninos_actualizar_nino, only the changed
 * fields); the caller reloads and the salón appears.
 */
export function CompletarDatoSalon({ hijo, falta, onGuardado }: PropsCompletar) {
  const [fecha, setFecha] = useState(hijo.fecha_nacimiento ?? '')
  const [grado, setGrado] = useState(hijo.grado === null ? '' : String(hijo.grado))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const conFecha = falta !== 'grado'
  const opcionesGrado = (falta === 'grado' ? GRADOS.filter((g) => g.valor !== '') : GRADOS).map((g) => ({ valor: g.valor, etiqueta: g.label }))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const cambios: { fecha_nacimiento?: string; grado?: number | null } = {}
    if (conFecha && fecha !== '' && fecha !== (hijo.fecha_nacimiento ?? '')) {
      if (!fechaPasadaValida(fecha, hoyEnCaracas())) {
        setError('La fecha de nacimiento no es válida.')
        return
      }
      cambios.fecha_nacimiento = fecha
    }
    if (grado !== (hijo.grado === null ? '' : String(hijo.grado))) cambios.grado = grado === '' ? null : Number(grado)
    if (Object.keys(cambios).length === 0) {
      setError(SIN_CAMBIOS[falta])
      return
    }
    setError(null)
    setGuardando(true)
    const { error: err } = await createClient().rpc('ninos_actualizar_nino', { p_nino_id: hijo.id, p: cambios as unknown as Json })
    setGuardando(false)
    if (err) setError(mensajeDeErrorFamilia(err))
    else onGuardado()
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void guardar(e)}
      aria-label={`Completar datos de ${hijo.nombre}`}
      className="grid min-w-0 gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-warning-text">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {TEXTO_FALTA[falta]}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Sin este dato no puede ingresar a un salón.</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        {conFecha && (
          <div className="min-w-0 flex-1 basis-40">
            <InputSistema
              type="date"
              aria-label={`Fecha de nacimiento de ${hijo.nombre}`}
              max={hoyEnCaracas()}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        )}
        <div className="min-w-0 flex-1 basis-40">
          <SelectSistema
            aria-label={`Grado de ${hijo.nombre}`}
            placeholder={falta === 'grado' ? 'Elige el grado' : undefined}
            opciones={opcionesGrado}
            value={grado}
            onValueChange={setGrado}
          />
        </div>
        <BotonSistema type="submit" variante="outline" cargando={guardando} disabled={guardando}>
          Guardar
        </BotonSistema>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </form>
  )
}
