'use client'

/**
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
 * the partner picker for a couple edición in /talleres/explorar. It replaces
 * the leaders-only SelectLeaderModal, which could never find a spouse who
 * is not a líder. Same Dialog + BotonSistema pattern as the other talleres
 * dialogs (components/talleres/cerrar-edicion-dialog.tsx).
 *
 * Steps:
 *   0. Only when the edición leaves the vínculo open (`link_type` null):
 *      "¿Se inscriben como matrimonio o como novios?". The answer is sent
 *      to the RPC as `vinculo`.
 *   1. Matrimonio: the registered spouse (`miConyugeRegistrado`) is the
 *      default choice, with "No es mi cónyuge actual" to search someone else.
 *   2. Novios, no registered spouse, or a dismissed one: a cédula search
 *      (`buscarParejaPorCedula`) that only shows the masked name ("María G.")
 *      and asks "Sí, es mi pareja". A miss shows the neutral message.
 *
 * Confirming calls `inscribirseATaller`; the RPC is the authority and may
 * still refuse (cupo, partner already enrolled, …), shown inside the
 * dialog. The parent mounts this component only while it is open, so every
 * open starts from step 0/1/2 with a clean state.
 */

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserAvatar } from '@/components/ui/UserAvatar'

import { buscarParejaPorCedula, inscribirseATaller, miConyugeRegistrado } from '@/app/(auth)/talleres/explorar/actions'
import type { ConyugeRegistrado, ParejaInscripcion, VinculoPareja } from '@/lib/platform/talleres/inscripcion-pareja'

export interface SelectorParejaProps {
  /** taller_ediciones.id of the selected couple edición. */
  readonly edicionId: string
  /** The edición's own vínculo (`link_type`); null means the member chooses. */
  readonly vinculoEdicion: VinculoPareja | null
  readonly onCerrar: () => void
  /** Called once the RPC accepted the enrollment. */
  readonly onInscrito: () => void
}

type Paso =
  | { readonly tipo: 'vinculo' }
  | { readonly tipo: 'cargando-conyuge' }
  | { readonly tipo: 'conyuge'; readonly conyuge: ConyugeRegistrado }
  | { readonly tipo: 'cedula' }
  | { readonly tipo: 'confirmar'; readonly cedula: string; readonly nombreMostrado: string }

const ERROR_TRANSPORTE = 'No se pudo completar la operación. Inténtalo de nuevo.'

function pasoInicial(vinculo: VinculoPareja | null): Paso {
  if (vinculo === null) return { tipo: 'vinculo' }
  return vinculo === 'matrimonio' ? { tipo: 'cargando-conyuge' } : { tipo: 'cedula' }
}

export function SelectorPareja({ edicionId, vinculoEdicion, onCerrar, onInscrito }: SelectorParejaProps): ReactElement {
  const [paso, setPaso] = useState<Paso>(() => pasoInicial(vinculoEdicion))
  // Only set when the edición leaves the vínculo open; it is then sent to the RPC.
  const [vinculoElegido, setVinculoElegido] = useState<VinculoPareja | null>(null)
  const [conyugeDescartado, setConyugeDescartado] = useState(false)
  const [cedula, setCedula] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Only the latest spouse lookup may write the state.
  const solicitudConyuge = useRef(0)

  const pedirConyuge = useCallback((): void => {
    const solicitud = solicitudConyuge.current + 1
    solicitudConyuge.current = solicitud
    // Any failure falls back to the cédula search: the spouse card is a
    // shortcut, never a requirement.
    miConyugeRegistrado()
      .then((result) => {
        if (solicitudConyuge.current !== solicitud) return
        setPaso(result.ok && result.conyuge ? { tipo: 'conyuge', conyuge: result.conyuge } : { tipo: 'cedula' })
      })
      .catch(() => {
        if (solicitudConyuge.current !== solicitud) return
        setPaso({ tipo: 'cedula' })
      })
  }, [])

  useEffect(() => {
    // A matrimonio edición opens on the registered spouse.
    if (vinculoEdicion === 'matrimonio') pedirConyuge()
  }, [vinculoEdicion, pedirConyuge])

  function elegirVinculo(vinculo: VinculoPareja): void {
    setVinculoElegido(vinculo)
    if (vinculo === 'matrimonio') {
      setPaso({ tipo: 'cargando-conyuge' })
      pedirConyuge()
    } else {
      setPaso({ tipo: 'cedula' })
    }
  }

  function descartarConyuge(): void {
    setConyugeDescartado(true)
    setAviso(null)
    setPaso({ tipo: 'cedula' })
  }

  function volverACedula(): void {
    setAviso(null)
    setPaso({ tipo: 'cedula' })
  }

  function buscar(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const cedulaTipeada = cedula.trim()
    if (cedulaTipeada === '' || pending) return
    setAviso(null)
    startTransition(async () => {
      try {
        const result = await buscarParejaPorCedula(edicionId, cedulaTipeada)
        if (result.ok && result.encontrada) {
          setPaso({ tipo: 'confirmar', cedula: cedulaTipeada, nombreMostrado: result.nombreMostrado })
        } else {
          setAviso(result.message)
        }
      } catch {
        setAviso(ERROR_TRANSPORTE)
      }
    })
  }

  function inscribir(pareja: ParejaInscripcion): void {
    if (pending) return
    setAviso(null)
    startTransition(async () => {
      try {
        const result = await inscribirseATaller({ edicionId, pareja })
        if (result.ok) onInscrito()
        else setAviso(result.message)
      } catch {
        setAviso(ERROR_TRANSPORTE)
      }
    })
  }

  const vinculo = vinculoElegido ? { vinculo: vinculoElegido } : {}

  function cambiarApertura(abierto: boolean): void {
    // A request in flight must finish inside the dialog that started it.
    if (!abierto && !pending) onCerrar()
  }

  return (
    <Dialog open onOpenChange={cambiarApertura}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inscribirse en pareja</DialogTitle>
          <DialogDescription>Indica quién es tu pareja para inscribirse juntos en este taller.</DialogDescription>
        </DialogHeader>

        {paso.tipo === 'vinculo' && (
          <div className="flex flex-col gap-3">
            <TextoSistema>¿Se inscriben como matrimonio o como novios?</TextoSistema>
            <div className="flex flex-wrap gap-2">
              <BotonSistema type="button" variante="outline" onClick={() => elegirVinculo('matrimonio')}>
                Matrimonio
              </BotonSistema>
              <BotonSistema type="button" variante="outline" onClick={() => elegirVinculo('novios')}>
                Novios
              </BotonSistema>
            </div>
          </div>
        )}

        {paso.tipo === 'cargando-conyuge' && (
          <TextoSistema variante="sutil" tamaño="sm" role="status">
            Buscando tu cónyuge registrado…
          </TextoSistema>
        )}

        {paso.tipo === 'conyuge' && (
          <div className="flex flex-col gap-3">
            <TarjetaSistema variante="outlined" className="flex items-center gap-3 p-3">
              <UserAvatar
                photoUrl={paso.conyuge.fotoUrl}
                nombre={paso.conyuge.nombre}
                apellido={paso.conyuge.apellido}
                size="lg"
              />
              <div className="flex flex-col">
                <TextoSistema className="font-medium">
                  {`${paso.conyuge.nombre} ${paso.conyuge.apellido}`.trim()}
                </TextoSistema>
                <TextoSistema variante="sutil" tamaño="sm">
                  Cónyuge registrado en tu ficha
                </TextoSistema>
              </div>
            </TarjetaSistema>
            <BotonSistema
              type="button"
              onClick={() => inscribir({ modo: 'conyuge_registrado', ...vinculo })}
              disabled={pending}
            >
              {pending ? 'Inscribiendo…' : 'Inscribirnos juntos'}
            </BotonSistema>
            <button
              type="button"
              onClick={descartarConyuge}
              disabled={pending}
              className="self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              No es mi cónyuge actual
            </button>
          </div>
        )}

        {paso.tipo === 'cedula' && (
          <form className="flex flex-col gap-3" onSubmit={buscar}>
            <InputSistema
              label="Cédula de tu pareja"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              placeholder="Ej.: 12345678"
              autoComplete="off"
              maxLength={20}
            />
            <BotonSistema type="submit" icono={Search} disabled={pending || cedula.trim() === ''}>
              {pending ? 'Buscando…' : 'Buscar'}
            </BotonSistema>
          </form>
        )}

        {paso.tipo === 'confirmar' && (
          <div className="flex flex-col gap-3">
            <TarjetaSistema variante="outlined" className="flex flex-col p-3">
              <TextoSistema variante="sutil" tamaño="sm">
                Encontramos a
              </TextoSistema>
              <TextoSistema className="font-medium">{paso.nombreMostrado}</TextoSistema>
            </TarjetaSistema>
            <BotonSistema
              type="button"
              onClick={() =>
                inscribir({
                  modo: 'cedula',
                  cedula: paso.cedula,
                  ...vinculo,
                  ...(conyugeDescartado ? { conyugeDescartado: true } : {}),
                })
              }
              disabled={pending}
            >
              {pending ? 'Inscribiendo…' : 'Sí, es mi pareja'}
            </BotonSistema>
            <BotonSistema type="button" variante="outline" onClick={volverACedula} disabled={pending}>
              Buscar otra cédula
            </BotonSistema>
          </div>
        )}

        {/* Inside the dialog: Radix hides everything outside an open dialog
            from assistive tech. */}
        {aviso && (
          <TarjetaSistema variante="outlined" className="p-3" role="alert">
            <TextoSistema tamaño="sm">{aviso}</TextoSistema>
          </TarjetaSistema>
        )}

        <div className="flex justify-end">
          <BotonSistema type="button" variante="ghost" onClick={onCerrar} disabled={pending}>
            Cancelar
          </BotonSistema>
        </div>
      </DialogContent>
    </Dialog>
  )
}
