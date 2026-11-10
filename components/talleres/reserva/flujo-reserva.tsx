'use client'

/**
 * The reservation flow as one dialog (design/talleres-reserva/03–06):
 * full screen on phones with a back control, "Paso N de 3" and a sticky
 * call to action (native push screen); a 680px dialog with the 4-step bar
 * (Horario · Identificarte · Tus datos · Listo) from md. One form holds the
 * current step; its primary action is the footer button.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ChevronLeft, X } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { tituloEdicion, type TallerPublico } from '@/lib/platform/talleres/reserva-publica'
import { cn } from '@/lib/utils'

import { RUTA_CATALOGO, VistaCerrada, VistaGeneroNoAplica, VistaListo, VistaLleno, VistaYaInscrito } from './estados'
import { useFlujoReserva, type FlujoReserva, type Vista } from './use-flujo-reserva'
import { VistaCedula, VistaCodigo, VistaConfirmado, VistaHorario, VistaNuevo, VistaPareja, VistaPorVerificar } from './vistas'

const PASOS = ['Horario', 'Identificarte', 'Tus datos', 'Listo'] as const

const PASO: Partial<Record<Vista, number>> = {
  horario: 0,
  cedula: 1,
  codigo: 1,
  confirmado: 2,
  por_verificar: 2,
  nuevo: 2,
  pareja: 2,
  listo: 3,
}

const ETIQUETA_ATRAS: Partial<Record<Vista, string>> = {
  horario: 'Horario',
  cedula: 'Cédula',
  codigo: 'Código',
  confirmado: 'Atrás',
  por_verificar: 'Atrás',
}

const FORM_ID = 'flujo-reserva'

type Accion = { etiqueta: string; ejecutar: () => void | Promise<unknown> } | { enlace: string; etiqueta: string } | null

function accionDe(f: FlujoReserva, codigo: string): Accion {
  const enviarOContinuar = () => (f.taller.pareja ? { etiqueta: 'Continuar', ejecutar: () => f.ir('pareja') } : { etiqueta: 'Enviar solicitud', ejecutar: f.enviar })
  switch (f.vista) {
    case 'horario': {
      const e = f.taller.ediciones.find((x) => x.id === f.edicionId)
      return { etiqueta: 'Continuar', ejecutar: () => f.ir(e?.lleno ? 'lleno' : 'cedula') }
    }
    case 'cedula':
      return { etiqueta: 'Continuar', ejecutar: f.identificar }
    case 'codigo':
      return { etiqueta: 'Verificar código', ejecutar: () => f.verificar(codigo) }
    case 'confirmado':
    case 'por_verificar':
      return enviarOContinuar()
    case 'nuevo':
    case 'pareja':
      return { etiqueta: 'Enviar solicitud', ejecutar: f.enviar }
    default:
      return { enlace: RUTA_CATALOGO, etiqueta: 'Ver otros talleres' }
  }
}

export interface FlujoReservaProps {
  readonly taller: TallerPublico
  readonly edicionId: string
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
}

export function FlujoReserva({ taller, edicionId, abierto, onAbiertoChange }: FlujoReservaProps) {
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      {abierto && <ContenidoFlujo taller={taller} edicionId={edicionId} onCerrar={() => onAbiertoChange(false)} />}
    </Dialog>
  )
}

function ContenidoFlujo({ taller, edicionId, onCerrar }: { taller: TallerPublico; edicionId: string; onCerrar: () => void }) {
  const inicial = taller.ediciones.find((e) => e.id === edicionId)
  const f = useFlujoReserva({ taller, edicionInicial: edicionId, vistaInicial: inicial?.lleno ? 'lleno' : 'cedula' })
  const [codigo, setCodigo] = useState('')
  const cuerpo = useRef<HTMLFormElement>(null)
  // A new step starts at its top, like a pushed screen.
  useEffect(() => {
    cuerpo.current?.scrollTo?.({ top: 0 })
  }, [f.vista])
  const accion = accionDe(f, codigo)
  const paso = PASO[f.vista]
  const anterior = f.vistaAnterior()
  const edicion = taller.ediciones.find((e) => e.id === f.edicionId)
  const nombre = f.identidad?.tipo === 'token' ? f.identidad.nombre : f.identidad?.tipo === 'nueva' ? f.ficha.nombre.trim().split(/\s+/)[0] : ''
  const email = f.identidad?.tipo === 'nueva' ? f.ficha.email.trim() : ''

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (f.cargando || !accion || 'enlace' in accion) return
    void accion.ejecutar()
  }

  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        'flex flex-col gap-0 overflow-hidden border-0 bg-background p-0',
        // Phone: a full-screen push screen.
        'top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none',
        // From md: the 680px dialog of design 06.
        'md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100dvh-56px)] md:w-[680px] md:max-w-[calc(100vw-48px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-sheet',
      )}
    >
      {/* Header: phone nav bar (back · Reservar · close); desktop title and context. */}
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-2 pt-[env(safe-area-inset-top,0px)] md:flex md:gap-3 md:px-6 md:pt-4">
        <div className="flex min-w-0 md:hidden">
          {anterior && (
            <button
              type="button"
              onClick={() => f.ir(anterior)}
              aria-label={`Volver a ${ETIQUETA_ATRAS[anterior] ?? 'el paso anterior'}`}
              className="focus-ring inline-flex min-h-11 max-w-[140px] items-center gap-0.5 rounded-xl px-1 text-base font-medium text-brand-text"
            >
              <ChevronLeft aria-hidden="true" className="-ml-1 size-6 shrink-0" />
              <span className="truncate">{ETIQUETA_ATRAS[anterior] ?? 'Atrás'}</span>
            </button>
          )}
        </div>
        <div className="min-w-0 text-center md:flex-1 md:text-left">
          <DialogTitle className="text-base font-semibold md:text-lg">Reservar mi lugar</DialogTitle>
          <DialogDescription className="sr-only md:not-sr-only md:mt-1 md:text-[13px]">
            {taller.nombre}
            {edicion ? ` · ${tituloEdicion(edicion)}` : ''}
          </DialogDescription>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar la reserva"
            className="focus-ring grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      {paso !== undefined && (
        <ol aria-label="Pasos de la reserva" className="hidden shrink-0 grid-cols-4 gap-2 border-b border-border px-6 py-4 md:grid">
          {PASOS.map((nombrePaso, i) => (
            <li
              key={nombrePaso}
              aria-current={i === paso ? 'step' : undefined}
              className={cn('grid gap-2 text-[13px]', i === paso ? 'font-semibold text-foreground' : 'text-muted-foreground')}
            >
              <span aria-hidden="true" className={cn('h-1 rounded-full', i < paso ? 'bg-success' : i === paso ? 'bg-brand' : 'bg-muted')} />
              <span>
                {nombrePaso}
                {i < paso && <span className="sr-only"> (hecho)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      <form ref={cuerpo} id={FORM_ID} onSubmit={enviar} noValidate className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6 md:px-6 md:pt-6">
        {paso !== undefined && paso > 0 && paso < 3 && (
          <p className="mb-3 text-[13px] font-medium text-muted-foreground md:hidden">
            Paso <span className="font-mono tabular-nums">{paso}</span> de <span className="font-mono tabular-nums">3</span>
          </p>
        )}
        {f.vista === 'horario' && <VistaHorario f={f} />}
        {f.vista === 'cedula' && <VistaCedula f={f} />}
        {f.vista === 'codigo' && <VistaCodigo f={f} valor={codigo} onCambio={setCodigo} />}
        {f.vista === 'confirmado' && <VistaConfirmado f={f} />}
        {f.vista === 'por_verificar' && <VistaPorVerificar f={f} />}
        {f.vista === 'nuevo' && <VistaNuevo f={f} />}
        {f.vista === 'pareja' && <VistaPareja f={f} />}
        {f.vista === 'listo' && <VistaListo f={f} nombre={nombre} email={email} />}
        {f.vista === 'lleno' && (
          <VistaLleno f={f} nombreInicial={f.identidad?.tipo === 'nueva' ? `${f.ficha.nombre} ${f.ficha.apellido}`.trim() : nombre} emailInicial={email} />
        )}
        {f.vista === 'cerrada' && <VistaCerrada f={f} />}
        {f.vista === 'ya_inscrito' && <VistaYaInscrito f={f} nombre={nombre} />}
        {f.vista === 'genero_no_aplica' && <VistaGeneroNoAplica f={f} />}
        {f.error && (
          <AvisoFormulario tono="error" className="mt-5">
            {f.error}
          </AvisoFormulario>
        )}
      </form>

      {accion && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:bg-card md:px-6 md:py-3.5">
          {anterior && (
            <BotonSistema type="button" variante="ghost" className="hidden md:inline-flex" onClick={() => f.ir(anterior)}>
              Atrás
            </BotonSistema>
          )}
          <p className="hidden flex-1 text-[13px] text-muted-foreground md:block">
            {paso !== undefined && paso < 3 ? 'Tu solicitud queda pendiente hasta que la coordinación la apruebe.' : ''}
          </p>
          {'enlace' in accion ? (
            <BotonSistema asChild variante="outline" tamaño="lg" className="w-full md:w-auto">
              <Link href={accion.enlace}>{accion.etiqueta}</Link>
            </BotonSistema>
          ) : (
            <BotonSistema type="submit" form={FORM_ID} tamaño="lg" cargando={f.cargando} className="w-full md:w-auto">
              {accion.etiqueta}
            </BotonSistema>
          )}
        </div>
      )}
    </DialogContent>
  )
}
