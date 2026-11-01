'use client'

/**
 * Niños › Check-in at the desk on design-system v2 (odd/tasks/ninos-v2.md,
 * N2a, S3–S4; prototypes docs/design-system/prototipos/ninos/01 phone and 04
 * tablet). Top to bottom: hero with the summary line, service + Ingreso /
 * Retiro, salones with occupancy, then LLEGANDO (1-tap "Llegaron") and
 * PRE-REGISTROS POR QR first, and the MESA ("Otra familia" search, the family
 * with its children already marked, the pickup code with "Siguiente familia").
 * From md the queue and the mesa sit side by side; N2b adds the desktop
 * three columns and moves Nueva familia / Cambiar salón / Completar ficha
 * into side panels. Every RPC, API route and permission is unchanged.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'

import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { BotonSistema, PaginaSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import type { Servicio, TurnoFila } from '@/lib/platform/ninos/checkin'
import { resumenCheckin, type OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import { aSalonSugerible, type HijoEncontrado, type SalonFila } from '@/lib/platform/ninos/familias-vista'
import { createClient } from '@/lib/supabase/client'

import { ColaLlegando } from './checkin/cola-llegando'
import { EncabezadoCheckin, MigasCheckin } from './checkin/encabezado-checkin'
import { Mesa } from './checkin/mesa'
import { SalonesOcupacion } from './checkin/salones-ocupacion'
import { useColaLlegando } from './checkin/use-cola-llegando'
import { useMesa } from './checkin/use-mesa'
import { EditarNinoForm } from './editar-nino-form'
import { PanelLateralNinos } from './panel-lateral'
import { PreregistrosPendientes } from './preregistros-pendientes'
import { RegistrarFamiliaForm } from './registrar-familia-form'
import { RetiroPanel } from './retiro-panel'
import { SelectorServicio } from './selector-servicio'
import { useRefrescoVisible } from './use-refresco'
import { VincularHijoForm } from './vincular-hijo-form'

type Props = {
  salones: SalonFila[]
  turnos: TurnoFila[]
  servicio: Servicio
  /** Campus of the salones, for the summary line. */
  campus?: string | null
  /** Search to run on load (a family just registered from here). */
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
  const [completando, setCompletando] = useState<HijoEncontrado | null>(null)
  /** An adult without children (N11): add a new child or link an existing one. */
  const [paraAdulto, setParaAdulto] = useState<{ tipo: 'agregar' | 'vincular'; id: string; nombre: string } | null>(null)
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

  const porSalon = useMemo(() => new Map((ocupacion ?? []).map((o) => [o.salon_id, o])), [ocupacion])
  const resumen = resumenCheckin(ocupacion, cola.length)
  const ocultarPreregistros = useMemo(() => cola.flatMap((i) => (i.tipo === 'preregistro' ? [i.clave] : [])), [cola])
  const urlNuevaFamilia = `/ninos/familias?nueva=1&volver=checkin&turno=${encodeURIComponent(servicio.turnoId ?? '')}&fecha=${encodeURIComponent(servicio.fecha)}`
  const buscarDeNuevo = (padreId: string, consulta = busqueda.q) => {
    busqueda.setQ(consulta)
    void buscarYElegir(consulta, padreId)
  }

  return (
    <PaginaSistema
      breadcrumbs={<MigasCheckin />}
      acciones={
        <BotonSistema asChild tamaño="sm" icono={UserPlus}>
          <Link href={urlNuevaFamilia}>Nueva familia</Link>
        </BotonSistema>
      }
      className="pb-28 md:pb-0"
    >
      <EncabezadoCheckin campus={campus} resumen={resumen} />

      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end lg:max-w-[720px]">
        <SelectorServicio idPrefijo="checkin" turnos={turnos} servicio={servicio} onCambiar={cambiarServicio} />
        <ControlSegmentado
          etiqueta="Ingreso o retiro"
          opciones={PESTANAS}
          valor={pestana}
          onCambio={setPestana}
          className="flex w-full md:w-auto [&>button]:flex-1 md:[&>button]:px-6"
        />
      </div>

      <SalonesOcupacion ocupacion={ocupacion} />

      {pestana === 'retiro' ? (
        <TarjetaSistema className="p-4 md:p-6">
          <RetiroPanel servicio={servicio} onRetirado={() => void cargarOcupacion()} />
        </TarjetaSistema>
      ) : (
        <div className="grid min-w-0 gap-6 md:grid-cols-2 md:items-start">
          <div className="grid min-w-0 gap-6">
            {servicio.turnoId && (
              <ColaLlegando
                cola={cola}
                salones={salones}
                fecha={servicio.fecha}
                ocupacion={porSalon}
                onLlegaron={mesa.llegaron}
                onCambiarSalon={mesa.abrirLlegando}
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
                buscarDeNuevo(padreId, consulta)
              }}
            />
          </div>
          <Mesa
            mesa={{ ...mesa, siguienteFamilia }}
            servicio={servicio}
            salones={salones}
            ocupacion={porSalon}
            onCompletar={setCompletando}
            onParaAdulto={(tipo, a) => setParaAdulto({ tipo, id: a.id, nombre: `${a.nombre} ${a.apellido}` })}
          />
        </div>
      )}

      <BotonFlotante href={urlNuevaFamilia} icono={UserPlus} label="Nueva familia" />

      <PanelLateralNinos
        abierto={completando !== null}
        titulo="Completar ficha"
        descripcion={completando ? `Datos de ${completando.nombre} ${completando.apellido}.` : ''}
        onCerrar={() => setCompletando(null)}
      >
        {completando && (
          <EditarNinoForm
            key={completando.id}
            salones={salonesNivel}
            hijo={completando}
            onCancelar={() => setCompletando(null)}
            onGuardado={() => {
              setCompletando(null)
              // Reload the family so the child can be checked in right away.
              if (mesa.familia) buscarDeNuevo(mesa.familia.id)
            }}
          />
        )}
      </PanelLateralNinos>

      <PanelLateralNinos
        abierto={paraAdulto !== null}
        titulo={paraAdulto?.tipo === 'vincular' ? 'Vincular hijo existente' : 'Agregar niño'}
        descripcion={paraAdulto?.tipo === 'vincular' ? `Representante: ${paraAdulto.nombre}.` : ''}
        onCerrar={() => setParaAdulto(null)}
      >
        {paraAdulto?.tipo === 'agregar' && (
          <RegistrarFamiliaForm
            salones={salonesNivel}
            key={paraAdulto.id}
            padreExistente={{ id: paraAdulto.id, nombre: paraAdulto.nombre }}
            onCancelar={() => setParaAdulto(null)}
            onRegistrada={(padreId) => {
              setParaAdulto(null)
              buscarDeNuevo(padreId)
            }}
            onAbrirFamilia={(padreId, consulta) => {
              setParaAdulto(null)
              buscarDeNuevo(padreId, consulta)
            }}
          />
        )}
        {paraAdulto?.tipo === 'vincular' && (
          <VincularHijoForm
            key={paraAdulto.id}
            adulto={{ id: paraAdulto.id, nombre: paraAdulto.nombre }}
            onCancelar={() => setParaAdulto(null)}
            onVinculado={() => {
              const id = paraAdulto.id
              setParaAdulto(null)
              buscarDeNuevo(id)
            }}
          />
        )}
      </PanelLateralNinos>
    </PaginaSistema>
  )
}
