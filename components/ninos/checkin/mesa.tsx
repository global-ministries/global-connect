'use client'

/**
 * Niños › Check-in — MESA, the center column on desktop, the right column on
 * tablet and the last block on the phone (prototypes 05, 04, 01): the family
 * search, then the family with its children already marked, or the pickup
 * code, or "Mesa libre". On the phone the family and the code open in a
 * bottom sheet (MarcoMesa); while a panel is open that sheet steps aside, so
 * there is never a dialog on top of another.
 *
 * Keyboard (desktop): "/" focuses the search unless the user is typing or a
 * panel is open; the family opens with focus on "Registrar ingreso", the code
 * with focus on "Siguiente familia", and the next family starts at the search.
 */
import { useEffect, useRef, type ReactElement } from 'react'
import { ScanLine } from 'lucide-react'

import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import type { Servicio } from '@/lib/platform/ninos/checkin'
import { atajoBuscar, type OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import type { FamiliaEncontrada, HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'

import { AdultoSinHijos } from '../adulto-sin-hijos'
import { BuscadorFamilia } from './buscador-familia'
import { CodigoRetiro } from './codigo-retiro'
import { MarcoMesa } from './marco-mesa'
import { TarjetaFamilia } from './tarjeta-familia'
import type { useMesa } from './use-mesa'

export interface MesaProps {
  readonly mesa: ReturnType<typeof useMesa>
  readonly servicio: Servicio
  readonly salones: readonly SalonFila[]
  readonly ocupacion: ReadonlyMap<string, OcupacionSalon>
  /** A panel of the screen is open: "/" does nothing and the phone sheet steps aside. */
  readonly panelAbierto: boolean
  readonly onCambiarSalon: (h: HijoEncontrado) => void
  readonly onCompletar: (h: HijoEncontrado) => void
  readonly onParaAdulto: (tipo: 'agregar' | 'vincular', adulto: FamiliaEncontrada) => void
}

const esCampo = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || Boolean(t.closest('input, select, textarea, [contenteditable="true"]')))

export function Mesa({ mesa, servicio, salones, ocupacion, panelAbierto, onCambiarSalon, onCompletar, onParaAdulto }: MesaProps): ReactElement {
  const { busqueda, familia, resultado, foco } = mesa
  const varias = (busqueda.familias?.length ?? 0) > 1
  const refBuscar = useRef<HTMLInputElement>(null)
  const refRegistrar = useRef<HTMLButtonElement>(null)
  const refSiguiente = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!foco) return
    const destino = { buscar: refBuscar, registrar: refRegistrar, siguiente: refSiguiente }[foco.objetivo].current
    destino?.focus()
  }, [foco])

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      // Any open dialog counts (e.g. the pre-registration review), not only this screen's panel.
      const abierto = panelAbierto || document.querySelector('[role="dialog"]') !== null
      if (!atajoBuscar(e, { enCampo: esCampo(e.target), panelAbierto: abierto })) return
      e.preventDefault()
      refBuscar.current?.focus()
      refBuscar.current?.select()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [panelAbierto])

  return (
    <section aria-label="Mesa" className="grid min-w-0 content-start gap-3 md:sticky md:top-20 lg:top-24">
      <BuscadorFamilia
        refBuscar={refBuscar}
        q={busqueda.q}
        onQ={busqueda.setQ}
        onBuscar={() => void mesa.buscarYElegir(busqueda.q)}
        buscando={busqueda.buscando}
        error={busqueda.error}
        familias={busqueda.familias}
        mostrarLista={!familia && !resultado}
        onElegir={(f) => mesa.elegirFamilia(f)}
      />

      <MarcoMesa abierto={resultado !== null} titulo="Ingreso registrado" onCerrar={mesa.siguienteFamilia}>
        {resultado && (
          <div className="min-w-0 md:rounded-2xl md:border md:border-border md:bg-card md:p-4 lg:p-5">
            <CodigoRetiro resultado={resultado} onSiguiente={mesa.siguienteFamilia} refSiguiente={refSiguiente} />
          </div>
        )}
      </MarcoMesa>

      <MarcoMesa
        abierto={resultado === null && familia !== null}
        ocultoTemporalmente={panelAbierto}
        titulo={familia ? `Familia ${familia.apellido}`.trim() : 'Familia'}
        descripcion="Revisa y registra. Los niños ya van marcados."
        onCerrar={() => mesa.elegirFamilia(null)}
      >
        {familia?.sin_hijos ? (
          <AdultoSinHijos adulto={familia} onAgregarNino={() => onParaAdulto('agregar', familia)} onVincularHijo={() => onParaAdulto('vincular', familia)} />
        ) : familia ? (
          <TarjetaFamilia
            familia={familia}
            fecha={servicio.fecha}
            salones={salones}
            ocupacion={ocupacion}
            ingresados={mesa.ingresados}
            marcados={mesa.marcados}
            salonDe={mesa.salonDe}
            error={mesa.error}
            guardando={mesa.guardando}
            puedeRegistrar={Boolean(servicio.turnoId)}
            onOtraFamilia={varias ? () => mesa.elegirFamilia(null) : undefined}
            onMarcar={mesa.marcar}
            onCambiarSalon={onCambiarSalon}
            onCompletar={onCompletar}
            onRegistrar={() => void mesa.registrarIngreso()}
            refRegistrar={refRegistrar}
          />
        ) : null}
      </MarcoMesa>

      {!familia && !resultado && (
        <div className="hidden rounded-2xl border border-dashed border-border md:block">
          <EstadoVacioSistema icono={ScanLine} className="py-10" titulo="Mesa libre" subtitulo="Toca «Llegaron» en la cola o busca la siguiente familia." />
        </div>
      )}
    </section>
  )
}
