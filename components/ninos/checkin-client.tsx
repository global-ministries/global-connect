'use client'

/**
 * Niños › Check-in at the desk on design-system v2 (odd/tasks/ninos-v2.md,
 * N2a–N2b, S3–S4; prototypes docs/design-system/prototipos/ninos/01 phone,
 * 04 tablet, 05 desktop). Top to bottom: hero with the summary line, service
 * + Ingreso / Retiro, salones with occupancy, then LLEGANDO (1-tap
 * "Llegaron") and PRE-REGISTROS POR QR first, and the MESA (search, the
 * family with its children already marked, the pickup code with "Siguiente
 * familia"). From md the queue and the mesa sit side by side; from lg a third
 * column shows the salones. Nueva familia, Cambiar salón, Completar ficha and
 * the adult-without-children forms open in one panel without leaving the
 * screen (PanelesCheckin). Every RPC, API route and permission is unchanged.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'

import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { BotonSistema, PaginaSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import type { Servicio, TurnoFila } from '@/lib/platform/ninos/checkin'
import { resumenCheckin, type OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import { aSalonSugerible, type SalonFila } from '@/lib/platform/ninos/familias-vista'
import type { FamiliaLlegando } from '@/lib/platform/ninos/precheck'
import { createClient } from '@/lib/supabase/client'

import { ColaLlegando } from './checkin/cola-llegando'
import { ColumnaSalones } from './checkin/columna-salones'
import { EncabezadoCheckin, MigasCheckin } from './checkin/encabezado-checkin'
import { Mesa } from './checkin/mesa'
import { PanelesCheckin, type PanelCheckin } from './checkin/paneles-checkin'
import { SalonesOcupacion } from './checkin/salones-ocupacion'
import { useColaLlegando } from './checkin/use-cola-llegando'
import { useMesa } from './checkin/use-mesa'
import { PreregistrosPendientes } from './preregistros-pendientes'
import { RetiroPanel } from './retiro-panel'
import { SelectorServicio } from './selector-servicio'
import { useRefrescoVisible } from './use-refresco'

type Props = {
  salones: SalonFila[]
  turnos: TurnoFila[]
  servicio: Servicio
  /** Campus of the salones, for the summary line. */
  campus?: string | null
  /** Search to run on load (a family just registered from Familias). */
  consultaInicial?: string
  /** Family to select after consultaInicial. */
  padreInicial?: string
}

type Pestana = 'ingreso' | 'retiro'

const PESTANAS = [
  { valor: 'ingreso', etiqueta: 'Ingreso' },
  { valor: 'retiro', etiqueta: 'Retiro' },
] as const

function urlCheckin(s: Servicio): string {
  return `/ninos/checkin?turno=${encodeURIComponent(s.turnoId ?? '')}&fecha=${encodeURIComponent(s.fecha)}`
}

export function CheckinClient({ salones, turnos, servicio: servicioInicial, campus = null, consultaInicial, padreInicial }: Props) {
  const salonesNivel = useMemo(() => salones.map(aSalonSugerible), [salones])
  const router = useRouter()
  const [servicio, setServicio] = useState<Servicio>(servicioInicial)
  const [pestana, setPestana] = useState<Pestana>('ingreso')
  const [ocupacion, setOcupacion] = useState<OcupacionSalon[] | null>(null)
  const [panel, setPanel] = useState<PanelCheckin | null>(null)
  /** A QR pre-registration of "Llegando" to open in its review (P4). */
  const [revisar, setRevisar] = useState<string | null>(null)
  const atenderRevisar = useCallback(() => setRevisar(null), [])

  const cargarOcupacion = useCallback(async () => {
    if (!servicio.turnoId) return
    const { data } = await createClient().rpc('ninos_ocupacion', { p_turno_id: servicio.turnoId, p_fecha: servicio.fecha })
    setOcupacion((data ?? []) as OcupacionSalon[])
  }, [servicio])

  useEffect(() => {
    void cargarOcupacion()
  }, [cargarOcupacion])
  useRefrescoVisible(() => void cargarOcupacion())

  const { cola, recargar: recargarCola } = useColaLlegando(servicio)
  const mesa = useMesa(salones, servicio, () => {
    void cargarOcupacion()
    void recargarCola()
  })
  const { busqueda, buscarYElegir } = mesa

  useEffect(() => {
    if (consultaInicial) {
      busqueda.setQ(consultaInicial)
      void buscarYElegir(consultaInicial, padreInicial)
    }
    // Only on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cambiarServicio(s: Servicio) {
    setServicio(s)
    router.replace(urlCheckin(s))
  }

  function siguienteFamilia() {
    mesa.siguienteFamilia()
    void recargarCola()
  }

  /** "Cambiar" on a child of Llegando: the family opens at the mesa with the salón panel. */
  function cambiarSalonLlegando(f: FamiliaLlegando, hijoId: string) {
    mesa.abrirLlegando(f)
    const hijo = f.hijos.find((h) => h.id === hijoId)
    if (hijo) setPanel({ tipo: 'salon', hijo })
  }

  const porSalon = useMemo(() => new Map((ocupacion ?? []).map((o) => [o.salon_id, o])), [ocupacion])
  const resumen = resumenCheckin(ocupacion, cola.length)
  const ocultarPreregistros = useMemo(() => cola.flatMap((i) => (i.tipo === 'preregistro' ? [i.clave] : [])), [cola])
  const abrirFamilia = (padreId: string, consulta = busqueda.q) => {
    busqueda.setQ(consulta)
    void buscarYElegir(consulta, padreId)
  }
  const nuevaFamilia = () => setPanel({ tipo: 'nueva' })
  const ingreso = pestana === 'ingreso'

  return (
    <PaginaSistema
      breadcrumbs={<MigasCheckin />}
      acciones={
        <BotonSistema type="button" tamaño="sm" icono={UserPlus} aria-haspopup="dialog" onClick={nuevaFamilia}>
          Nueva familia
        </BotonSistema>
      }
      className="pb-28 md:pb-0"
    >
      <div className="grid min-w-0 gap-6 lg:flex lg:flex-wrap lg:items-end lg:justify-between">
        <EncabezadoCheckin campus={campus} resumen={resumen} />
        <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end lg:w-[min(100%,640px)]">
          <SelectorServicio idPrefijo="checkin" turnos={turnos} servicio={servicio} onCambiar={cambiarServicio} />
          <ControlSegmentado
            etiqueta="Ingreso o retiro"
            opciones={PESTANAS}
            valor={pestana}
            onCambio={setPestana}
            className="flex w-full md:w-auto [&>button]:flex-1 md:[&>button]:px-6"
          />
        </div>
      </div>

      <SalonesOcupacion ocupacion={ocupacion} columna={ingreso} />

      {!ingreso ? (
        <section aria-labelledby="checkin-retiro" className="grid min-w-0 gap-2 lg:max-w-[720px]">
          <h2 id="checkin-retiro" className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Retiro por código
          </h2>
          <TarjetaSistema className="p-4 md:p-6">
            <RetiroPanel servicio={servicio} onRetirado={() => void cargarOcupacion()} />
          </TarjetaSistema>
        </section>
      ) : (
        <div className="grid min-w-0 gap-6 md:grid-cols-2 md:items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_272px]">
          <div className="grid min-w-0 gap-6">
            {servicio.turnoId && (
              <ColaLlegando
                cola={cola}
                salones={salones}
                fecha={servicio.fecha}
                ocupacion={porSalon}
                onLlegaron={mesa.llegaron}
                onCambiarSalon={cambiarSalonLlegando}
                onRevisar={setRevisar}
              />
            )}
            <PreregistrosPendientes
              variante="seccion"
              salones={salonesNivel}
              abrirId={revisar}
              ocultarIds={ocultarPreregistros}
              onAbrirAtendido={atenderRevisar}
              onConfirmado={(padreId, consulta) => {
                void recargarCola()
                abrirFamilia(padreId, consulta)
              }}
            />
          </div>
          <Mesa
            mesa={{ ...mesa, siguienteFamilia }}
            servicio={servicio}
            salones={salones}
            ocupacion={porSalon}
            panelAbierto={panel !== null}
            onCambiarSalon={(hijo) => setPanel({ tipo: 'salon', hijo })}
            onCompletar={(hijo) => setPanel({ tipo: 'ficha', hijo })}
            onParaAdulto={(tipo, a) => setPanel({ tipo, id: a.id, nombre: `${a.nombre} ${a.apellido}` })}
          />
          <div className="hidden min-w-0 lg:block">
            <ColumnaSalones ocupacion={ocupacion} adentro={resumen.adentro} />
          </div>
        </div>
      )}

      <BotonFlotante onClick={nuevaFamilia} icono={UserPlus} label="Nueva familia" />

      <PanelesCheckin
        panel={panel}
        onCerrar={() => setPanel(null)}
        salones={salones}
        salonesNivel={salonesNivel}
        fecha={servicio.fecha}
        turnoId={servicio.turnoId}
        onIngresado={() => {
          void cargarOcupacion()
          void recargarCola()
        }}
        ocupacion={porSalon}
        salonDe={mesa.salonDe}
        onElegirSalon={mesa.elegirSalon}
        onAbrirFamilia={(padreId, consulta) => abrirFamilia(padreId, consulta)}
        onFichaGuardada={() => {
          // Reload the family so the child can be checked in right away.
          if (mesa.familia) abrirFamilia(mesa.familia.id)
        }}
      />
    </PaginaSistema>
  )
}
