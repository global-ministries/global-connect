'use client'

/**
 * Confirmar / No puedo of one service (odd/tasks/dps-asistencia-pco.md,
 * T15c, S13.2, S13.5; artboards design/dps-avisos/04, 05 and 07). Both answers
 * go through responderServicioDps and the service it returns replaces the
 * shown one; «Cambiar respuesta» shows the buttons again. In the detail, «No
 * puedo» may also block the date (agregarFechaBloqueadaDps), which never
 * answers anything by itself (S13.6). The two buttons are 44px.
 */
import { useRef, useState, type ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { agregarFechaBloqueadaDps, responderServicioDps } from '@/lib/actions/dps-avisos.actions'
import type { ServicioAviso } from '@/lib/platform/dps/avisos'
import { cn } from '@/lib/utils'

import { HojaNoPuedo } from './hoja-no-puedo'
import { rolesTexto, textoHorarios, textoRespuesta, tituloFecha } from './textos'

export interface RespuestaServicioProps {
  readonly servicio: ServicioAviso
  readonly onServicio: (servicio: ServicioAviso) => void
  /** `detalle` asks «¿Puedes servir este domingo?» and says «Confirmaste». */
  readonly variante: 'tarjeta' | 'detalle'
  /** Offer «Agregar a mis fechas que no puedo servir» in the sheet. */
  readonly ofrecerBloqueo?: boolean
  readonly onBloqueada?: () => void
  /** Open «No puedo» on mount (the «Responder «No puedo»» link of 06). */
  readonly abrirNoPuedo?: boolean
  readonly className?: string
}

const CLASE_ENLACE = 'focus-ring inline-flex min-h-11 shrink-0 items-center rounded-md px-1 text-sm font-medium text-brand-text touch-manipulation'

export function RespuestaServicio({
  servicio,
  onServicio,
  variante,
  ofrecerBloqueo = false,
  onBloqueada,
  abrirNoPuedo = false,
  className,
}: RespuestaServicioProps): ReactElement {
  const [cambiando, setCambiando] = useState(false)
  const [hoja, setHoja] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bloqueo, setBloqueo] = useState<'si' | string | null>(null)
  const [vivo, setVivo] = useState('')
  const botonNoPuedo = useRef<HTMLButtonElement>(null)
  const botonCambiar = useRef<HTMLButtonElement>(null)

  const preguntar = servicio.estado === 'pendiente' || cambiando
  const fecha = tituloFecha(servicio.fecha)

  // Opens once when asked (adjusting state while rendering, not in an effect).
  const [abiertaPorAncla, setAbiertaPorAncla] = useState(false)
  if (abrirNoPuedo && !abiertaPorAncla) {
    setAbiertaPorAncla(true)
    setHoja(true)
  }

  function aplicar(nuevo: ServicioAviso) {
    onServicio(nuevo)
    setCambiando(false)
    setError(null)
    setVivo(nuevo.estado === 'confirmo' ? `Confirmaste el ${fecha.toLocaleLowerCase('es')}.` : `Respondiste que no puedes el ${fecha.toLocaleLowerCase('es')}.`)
    // The buttons leave: focus goes to «Cambiar respuesta».
    requestAnimationFrame(() => botonCambiar.current?.focus())
  }

  async function confirmar() {
    if (enviando) return
    setEnviando(true)
    setError(null)
    const r = await responderServicioDps({ planId: servicio.planId, respuesta: 'confirmo' })
    setEnviando(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setBloqueo(null)
    aplicar(r.data)
  }

  async function noPuedo(motivo: string | null, bloquear: boolean): Promise<string | null> {
    const r = await responderServicioDps({ planId: servicio.planId, respuesta: 'no_puede', motivo })
    if (!r.ok) return r.message
    let resultadoBloqueo: string | null = null
    if (bloquear) {
      const b = await agregarFechaBloqueadaDps({ desde: servicio.fecha, hasta: servicio.fecha, nota: null })
      resultadoBloqueo = b.ok ? 'si' : b.message
      if (b.ok) onBloqueada?.()
    }
    setBloqueo(resultadoBloqueo)
    aplicar(r.data)
    return null
  }

  const textoHecho = [
    textoRespuesta(servicio, variante === 'detalle'),
    servicio.estado === 'no_puede' && bloqueo === 'si' ? 'También bloqueamos esta fecha.' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cn('min-w-0', className)}>
      {preguntar ? (
        <div className="grid gap-2">
          {variante === 'detalle' && (
            <p className="text-[15px] font-semibold">{servicio.tipo === 'domingo' ? '¿Puedes servir este domingo?' : '¿Puedes servir este día?'}</p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
            <BotonSistema type="button" onClick={confirmar} cargando={enviando}>
              Confirmar
            </BotonSistema>
            <BotonSistema ref={botonNoPuedo} type="button" variante="outline" aria-haspopup="dialog" onClick={() => setHoja(true)} disabled={enviando}>
              No puedo
            </BotonSistema>
          </div>
          {cambiando && servicio.estado !== 'pendiente' && (
            <button type="button" className={cn(CLASE_ENLACE, 'justify-self-start')} onClick={() => setCambiando(false)}>
              Mantener mi respuesta
            </button>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-card px-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1 break-words py-1.5">{textoHecho}</span>
          <button ref={botonCambiar} type="button" className={CLASE_ENLACE} onClick={() => setCambiando(true)}>
            Cambiar respuesta
          </button>
        </div>
      )}
      {bloqueo && bloqueo !== 'si' && servicio.estado === 'no_puede' && (
        <AvisoFormulario tono="error" className="mt-2">
          Respondiste «No puedo», pero no se pudo bloquear la fecha: {bloqueo}
        </AvisoFormulario>
      )}
      {error && (
        <AvisoFormulario tono="error" className="mt-2">
          {error}
        </AvisoFormulario>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {vivo}
      </p>
      <HojaNoPuedo
        abierta={hoja}
        onCambioAbierta={(abierta) => {
          setHoja(abierta)
          if (!abierta && preguntar) requestAnimationFrame(() => botonNoPuedo.current?.focus())
        }}
        descripcion={[fecha, rolesTexto(servicio.roles), textoHorarios(servicio.horarios)].filter(Boolean).join(' · ')}
        ofrecerBloqueo={ofrecerBloqueo}
        onEnviar={noPuedo}
      />
    </div>
  )
}

/** The anchor that opens «No puedo» in the detail (the link «Responder «No puedo»» of 06). */
export const ANCLA_NO_PUEDO = 'no-puedo'
