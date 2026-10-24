'use client'

/**
 * Registering a 1:1 after it happened (odd/tasks/uno-a-uno.md, T4): a
 * required resumen (the leader side and their supervision chain read it), an
 * optional private note (the leader side only) and, since T7, an optional
 * celebración (the chain and the person too). Two uses:
 *
 *   - a scheduled 1:1 (`unoAUnoId`): registrarUnoAUno; the database keeps
 *     the scheduled time, or now when registered early;
 *   - one that was never scheduled (`dirigidos`): registrarSinAgenda, which
 *     also needs the person, the (past) date and time and an optional place.
 */

import { useState, useTransition, type ReactElement, type ReactNode } from 'react'
import { NotebookPen } from 'lucide-react'

import { BotonSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { registrarSinAgenda, registrarUnoAUno } from '@/app/(auth)/mis-uno-a-uno/actions'
import { LIMITES_UNO_A_UNO } from '@/lib/uno-a-uno/errores'
import { hoyEnCaracas } from '@/lib/uno-a-uno/fecha'
import type { OpcionDirigido } from '@/lib/uno-a-uno/vista'

import { CamposCita, CITA_VACIA, citaCompleta, type ValoresCita } from './campos-cita'

/** A field with a line below it saying who reads it (S7.6). */
function CampoConAyuda({ ayuda, children }: { ayuda: string; children: ReactNode }): ReactElement {
  return (
    <div className="space-y-1">
      {children}
      <TextoSistema variante="sutil" tamaño="sm">
        {ayuda}
      </TextoSistema>
    </div>
  )
}

type Props =
  | { readonly unoAUnoId: string; readonly conQuien: string; readonly dirigidos?: never }
  | { readonly dirigidos: readonly OpcionDirigido[]; readonly unoAUnoId?: never; readonly conQuien?: never }

export function RegistrarUnoAUnoDialog(props: Props): ReactElement {
  const agendado = props.unoAUnoId !== undefined
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState('')
  const [notaPrivada, setNotaPrivada] = useState('')
  const [celebracion, setCelebracion] = useState('')
  const [cita, setCita] = useState<ValoresCita>(CITA_VACIA)
  const [hoy, setHoy] = useState('')

  function abrir(): void {
    setResumen('')
    setNotaPrivada('')
    setCelebracion('')
    setCita(CITA_VACIA)
    setError(null)
    setHoy(hoyEnCaracas())
    setOpen(true)
  }

  function cerrar(): void {
    setOpen(false)
    setError(null)
  }

  const canSubmit = !pending && resumen.trim() !== '' && (agendado || citaCompleta(cita))

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result =
        props.unoAUnoId !== undefined
          ? await registrarUnoAUno({ id: props.unoAUnoId, resumen, notaPrivada, celebracion })
          : await registrarSinAgenda({
              dirigidoId: cita.dirigidoId,
              fecha: cita.fecha,
              hora: cita.hora,
              resumen,
              notaPrivada,
              celebracion,
              lugar: cita.lugar,
            })
      if (result.ok) setOpen(false)
      else setError(result.message)
    })
  }

  return (
    <>
      <BotonSistema
        type="button"
        variante={agendado ? 'primario' : 'outline'}
        tamaño={agendado ? 'sm' : 'md'}
        icono={NotebookPen}
        onClick={abrir}
      >
        {agendado ? 'Registrar' : 'Registrar sin agenda'}
      </BotonSistema>

      <Dialog open={open} onOpenChange={(next) => (next ? abrir() : cerrar())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{agendado ? 'Registrar 1 a 1' : 'Registrar un 1 a 1 sin agenda'}</DialogTitle>
            <DialogDescription>
              {agendado
                ? `Con ${props.conQuien}. Cuenta cómo fue la conversación.`
                : 'Para un 1 a 1 que ya ocurrió y no estaba agendado.'}
            </DialogDescription>
          </DialogHeader>

          {props.dirigidos !== undefined ? (
            <CamposCita dirigidos={props.dirigidos} valores={cita} onChange={setCita} fechaMax={hoy || undefined} />
          ) : null}

          <CampoConAyuda ayuda="Lo ve tu cadena de supervisión.">
            <TextareaSistema
              label="Resumen"
              value={resumen}
              maxLength={LIMITES_UNO_A_UNO.resumen}
              onChange={(e) => setResumen(e.target.value)}
              filas={4}
            />
          </CampoConAyuda>
          <CampoConAyuda ayuda="Solo la ves tú (y tu cónyuge).">
            <TextareaSistema
              label="Nota privada (opcional)"
              value={notaPrivada}
              maxLength={LIMITES_UNO_A_UNO.notaPrivada}
              onChange={(e) => setNotaPrivada(e.target.value)}
              filas={2}
            />
          </CampoConAyuda>
          <CampoConAyuda ayuda="La ven tu cadena de supervisión y la persona.">
            <TextareaSistema
              label="Celebración (opcional)"
              value={celebracion}
              maxLength={LIMITES_UNO_A_UNO.celebracion}
              onChange={(e) => setCelebracion(e.target.value)}
              filas={2}
            />
          </CampoConAyuda>

          {error ? (
            <TextoSistema role="alert" className="block text-destructive">
              {error}
            </TextoSistema>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={cerrar}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="primario" icono={NotebookPen} onClick={submit} disabled={!canSubmit}>
              {pending ? 'Guardando…' : 'Guardar'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
