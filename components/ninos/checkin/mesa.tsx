'use client'

/**
 * Niños › Check-in — MESA, the right column on tablet and the last block on
 * the phone (prototypes 01, 04): "Otra familia" search, then the family with
 * its children already marked, or the pickup code, or "Mesa libre". On the
 * phone the family and the code open in a bottom sheet (MarcoMesa).
 */
import type { ReactElement } from 'react'
import { ScanLine } from 'lucide-react'

import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import type { Servicio } from '@/lib/platform/ninos/checkin'
import type { OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
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
  readonly onCompletar: (h: HijoEncontrado) => void
  readonly onParaAdulto: (tipo: 'agregar' | 'vincular', adulto: FamiliaEncontrada) => void
}

export function Mesa({ mesa, servicio, salones, ocupacion, onCompletar, onParaAdulto }: MesaProps): ReactElement {
  const { busqueda, familia, resultado } = mesa
  const varias = (busqueda.familias?.length ?? 0) > 1

  return (
    <section aria-label="Mesa" className="grid min-w-0 content-start gap-3 md:sticky md:top-20">
      <BuscadorFamilia
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
          <div className="min-w-0 md:rounded-2xl md:border md:border-border md:bg-card md:p-4">
            <CodigoRetiro resultado={resultado} onSiguiente={mesa.siguienteFamilia} />
          </div>
        )}
      </MarcoMesa>

      <MarcoMesa
        abierto={resultado === null && familia !== null}
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
            selectores={mesa.selectores}
            salonDe={mesa.salonDe}
            error={mesa.error}
            guardando={mesa.guardando}
            puedeRegistrar={Boolean(servicio.turnoId)}
            onOtraFamilia={varias ? () => mesa.elegirFamilia(null) : undefined}
            onMarcar={mesa.marcar}
            onAbrirSelector={mesa.abrirSelector}
            onSalon={mesa.elegirSalon}
            onCompletar={onCompletar}
            onRegistrar={() => void mesa.registrarIngreso()}
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
