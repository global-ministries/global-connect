'use client'

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15) — «Suspender y mover a
 * nueva fecha», the side panel of artboard 13 (design/talleres-reserva/
 * 13-minimo-no-alcanzado-escritorio.html): 1 the new first clase and cierre
 * with every clase's Antes/Ahora, 2 motivo and the message for the
 * inscritos, 3 the inscription reopens until the new cierre, 4 who gets a
 * notice and the deadline. Submits through suspenderEdicion; the RPC moves
 * the dates with the same move as «Reprogramar» and this preview uses that
 * dialog's own day math (components/talleres/reprogramar-edicion.tsx).
 */

import { useState, useTransition, type ReactElement, type ReactNode } from 'react'
import { CalendarClock } from 'lucide-react'

import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'
import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextareaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { addDays, diffDays } from '@/components/talleres/reprogramar-edicion'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { suspenderEdicion } from '@/lib/platform/talleres/minimo-suspension-actions'
import {
  fechaCorta,
  fechaLarga,
  MENSAJE_MAX,
  MOTIVO_MAX,
  MOTIVOS_SUSPENSION,
  type ClaseAMover,
} from '@/lib/platform/talleres/minimo-suspension'

export interface SuspenderEdicionPanelProps {
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  readonly tallerSlug: string
  readonly tallerNombre: string
  readonly edicionId: string
  readonly fechaInicio: string
  readonly cierreInscripcion: string
  readonly clases: readonly ClaseAMover[]
  readonly aprobados: number
  readonly pendientes: number
  readonly minimo: number
}

const FORM_ID = 'suspender-edicion-form'

function isoDe(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

function mensajePorDefecto(tallerNombre: string, nuevaFecha: string): string {
  return `Queremos que el grupo arranque completo para aprovecharlo al máximo. ${tallerNombre} ahora empieza el ${fechaLarga(nuevaFecha)}; te guardamos el cupo hasta que lo confirmes.`
}

export function SuspenderEdicionPanel({
  abierto,
  onAbiertoChange,
  tallerSlug,
  tallerNombre,
  edicionId,
  fechaInicio,
  cierreInscripcion,
  clases,
  aprobados,
  pendientes,
  minimo,
}: SuspenderEdicionPanelProps): ReactElement {
  const notificar = useNotificaciones()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [nuevaFecha, setNuevaFecha] = useState('')
  // Empty = the taller's own offset (the RPC keeps it), shown as the suggestion.
  const [cierre, setCierre] = useState('')
  const [motivo, setMotivo] = useState<string>(MOTIVOS_SUSPENSION[0])
  const [motivoOtro, setMotivoOtro] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [mensajeEditado, setMensajeEditado] = useState(false)

  const delta = nuevaFecha ? diffDays(nuevaFecha, fechaInicio) : 0
  const offsetCierre = diffDays(cierreInscripcion, fechaInicio)
  const cierreSugerido = nuevaFecha ? isoDe(addDays(cierreInscripcion, delta)) : ''
  const cierreFinal = cierre || cierreSugerido
  const mensajeFinal = mensajeEditado ? mensaje : nuevaFecha ? mensajePorDefecto(tallerNombre, nuevaFecha) : ''
  const motivoFinal = motivo === 'Otro' ? motivoOtro.trim() : motivo
  const faltan = Math.max(minimo - aprobados, 0)
  const avisos = aprobados + pendientes

  const filas = clases.map((c) => ({
    numero: c.numero,
    antes: fechaCorta(c.fecha),
    ahora: nuevaFecha ? fechaCorta(isoDe(addDays(c.fecha, delta))) : '—',
  }))

  const puedeEnviar = !pending && nuevaFecha !== '' && cierreFinal !== '' && motivoFinal !== ''

  function enviar(): void {
    if (!puedeEnviar) return
    setError(null)
    startTransition(async () => {
      const result = await suspenderEdicion({
        tallerSlug,
        edicionId,
        nuevaFechaInicio: nuevaFecha,
        nuevoCierre: cierre || null,
        motivo: motivoFinal,
        mensaje: mensajeFinal || null,
      })
      if (result.ok) {
        onAbiertoChange(false)
        notificar.success(
          `Edición suspendida. ${result.suspension.porConfirmar} ${result.suspension.porConfirmar === 1 ? 'inscrito debe' : 'inscritos deben'} confirmar antes del ${fechaCorta(result.suspension.cierreInscripcion)}.`,
        )
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <PanelLateralSistema
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo="Suspender y mover a nueva fecha"
      descripcion={`${tallerNombre} · ${aprobados} ${aprobados === 1 ? 'inscrito' : 'inscritos'}, ${pendientes} por aprobar`}
      tamaño="lg"
      pie={
        <>
          <BotonSistema type="button" variante="outline" onClick={() => onAbiertoChange(false)} disabled={pending}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={FORM_ID} icono={CalendarClock} disabled={!puedeEnviar} cargando={pending}>
            {`Suspender y enviar ${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}`}
          </BotonSistema>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        <Paso numero={1} titulo="Nueva fecha">
          <div className="grid gap-4 @md:grid-cols-2">
            <div>
              <InputSistema
                label="Primera clase"
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                required
              />
              <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                {`Era el ${fechaCorta(fechaInicio)}`}
              </TextoSistema>
            </div>
            <div>
              <InputSistema
                label="Cierre de inscripción"
                type="date"
                value={cierreFinal}
                onChange={(e) => setCierre(e.target.value)}
                disabled={!nuevaFecha}
              />
              <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                {offsetCierre === 0
                  ? 'Sugerido: el mismo día de la primera clase, como en la configuración'
                  : `Sugerido: ${Math.abs(offsetCierre)} ${Math.abs(offsetCierre) === 1 ? 'día' : 'días'} ${offsetCierre < 0 ? 'antes' : 'después'}, como en la configuración`}
              </TextoSistema>
            </div>
          </div>
          {filas.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Cómo se mueven las clases</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-medium">Clase</th>
                    <th scope="col" className="px-3 py-2 font-medium">Antes</th>
                    <th scope="col" className="px-3 py-2 font-medium">Ahora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filas.map((f) => (
                    <tr key={f.numero}>
                      <td className="px-3 py-2 font-mono tabular-nums">{f.numero}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.antes}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{f.ahora}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <TextoSistema variante="sutil" tamaño="sm" className="mt-2 block">
            Todas se mueven igual: mismo horario, mismo lugar, mismos grupos y facilitadores. Puedes ajustar una clase suelta
            después.
          </TextoSistema>
        </Paso>

        <Paso numero={2} titulo="Motivo">
          <div className="grid gap-4">
            <SelectSistema
              label="Motivo"
              value={motivo}
              onValueChange={setMotivo}
              opciones={MOTIVOS_SUSPENSION.map((m) => ({ valor: m, etiqueta: m }))}
            />
            {motivo === 'Otro' && (
              <InputSistema
                label="¿Cuál?"
                value={motivoOtro}
                maxLength={MOTIVO_MAX}
                onChange={(e) => setMotivoOtro(e.target.value)}
              />
            )}
            <div>
              <TextareaSistema
                label="Mensaje para los inscritos"
                value={mensajeFinal}
                maxLength={MENSAJE_MAX}
                filas={3}
                onChange={(e) => {
                  setMensajeEditado(true)
                  setMensaje(e.target.value)
                }}
              />
              <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                Sale en el aviso. El motivo queda en el historial de la edición con tu nombre.
              </TextoSistema>
            </div>
          </div>
        </Paso>

        <Paso numero={3} titulo="Inscripción">
          <TextoSistema tamaño="sm" className="block">
            {cierreFinal
              ? `La inscripción se reabre hasta el ${fechaCorta(cierreFinal)}: la página pública vuelve a recibir solicitudes.`
              : 'La inscripción se reabre hasta el nuevo cierre: la página pública vuelve a recibir solicitudes.'}{' '}
            {faltan > 0 && `Faltan ${faltan} para el mínimo de ${minimo}.`}
          </TextoSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
            Si al nuevo cierre tampoco llega al mínimo, vuelves a ver este aviso.
          </TextoSistema>
        </Paso>

        <Paso numero={4} titulo="Revisa los avisos">
          <TextoSistema variante="sutil" tamaño="sm" className="block">
            Llegan por correo y en la app.
          </TextoSistema>
          <TarjetaSistema variante="outlined" className="mt-3 p-4">
            <TextoSistema className="block font-medium">
              Deben confirmar su lugar <span className="font-mono tabular-nums">({aprobados})</span>
            </TextoSistema>
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              {`Les preguntamos «Mantener mi lugar / Ya no puedo». Quien diga que no puede, o no responda antes del ${cierreFinal ? fechaCorta(cierreFinal) : 'nuevo cierre'}, sale de la edición y libera su cupo. Antes del cierre te mostramos a quién llamar.`}
            </TextoSistema>
            {pendientes > 0 && (
              <>
                <TextoSistema className="mt-3 block font-medium">
                  Solicitudes por aprobar <span className="font-mono tabular-nums">({pendientes})</span>
                </TextoSistema>
                <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                  Les contamos la nueva fecha; siguen esperando tu aprobación.
                </TextoSistema>
              </>
            )}
          </TarjetaSistema>
        </Paso>

        {error && (
          <TextoSistema role="alert" className="block text-danger-text">
            {error}
          </TextoSistema>
        )}
      </form>
    </PanelLateralSistema>
  )
}

function Paso({ numero, titulo, children }: { readonly numero: number; readonly titulo: string; readonly children: ReactNode }): ReactElement {
  return (
    <section aria-labelledby={`paso-suspender-${numero}`}>
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-tint font-mono text-xs tabular-nums text-brand-text"
        >
          {numero}
        </span>
        <h3 id={`paso-suspender-${numero}`} className="text-sm font-semibold text-foreground">
          {titulo}
        </h3>
      </div>
      {children}
    </section>
  )
}
