'use client'

/**
 * DPS › Plan — client island of /dps/plan, Plan del domingo · Equipos
 * (T10 of odd/tasks/dps-asistencia-pco.md; S6.2, S6.4, S6.5, S7.1, S7.4).
 * Built on the wide layout of docs/design-system/layout.md and the artboard
 * prototipos/planificacion-dps/01-plan-domingo-equipos.html.
 *
 * Top to bottom: crumbs "DPS › Plan"; the header band (encabezado-plan.tsx:
 * series cover, title, date pill to the previous / next plan, horarios and
 * llegada; "Acciones ▾" for whoever edits: "Copiar del domingo anterior" and
 * the series cover); the toolbar (tabs "Orden pronto" · "Equipos", the
 * summary "N convocados en M equipos · F puestos sin cubrir" and the
 * autosave status); the team columns (columnas-equipos.tsx).
 *
 * Whoever edits (dps_plan_equipos.puede_editar) convoca from the popover and
 * quita from each row: the change is applied at once and saved through a
 * server action; a failure rolls it back and explains why. The copy confirms
 * first (and asks to replace when the plan already has convocados), then
 * reloads the teams and says how many were copied. Everyone else reads the
 * same plan without controls. The database decides who edits and who may be
 * convocado where.
 */
import { useMemo, useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronDown, Copy, ImageMinus, ImageUp, UsersRound } from 'lucide-react'

import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { CLASE_TITULO_PAGINA } from '@/components/grupos-vida/planner/marco-planner'
import { LISTA_PESTANAS, clasePestana } from '@/components/ninos/pestanas-sistema'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cambiarPortadaDps, cargarEquiposDps, convocarDps, copiarPlanDps, desconvocarDps, planAnteriorDps, quitarPortadaDps } from '@/lib/actions/dps-plan.actions'
import { MENSAJE_IMAGEN } from '@/lib/platform/dps/errores'
import {
  confirmarConvocado,
  convocarEnPlan,
  quitarDePlan,
  textoCopia,
  totalesPlan,
  type CandidatoPuesto,
  type ConvocadoPlan,
  type EquipoPlan,
  type EquiposPlan,
  type PlanCabecera,
  type PuestoPlan,
} from '@/lib/platform/dps/plan'
import { horariosTexto, nombreCompleto } from '@/lib/platform/dps/planilla'
import { cn } from '@/lib/utils'

import { ColumnasEquipos } from './columnas-equipos'
import { DialogoCopiar } from './dialogo-copiar'
import { EncabezadoPlan } from './encabezado-plan'
import { EstadoGuardado, type EstadoGuardadoValor } from './estado-guardado'
import { MigasDps } from './migas-dps'

export interface PlanClientProps {
  readonly plan: PlanCabecera | null
  readonly anterior: PlanCabecera | null
  readonly siguiente: PlanCabecera | null
  /** dps_plan_equipos; null when there is no plan or it failed (`error`). */
  readonly equipos: EquiposPlan | null
  readonly portadaUrl: string | null
  /** Why there is no plan: none yet, or ?plan= points at nothing. */
  readonly motivo: 'sin_planes' | 'plan_invalido' | null
  readonly error: string | null
}

/** The dps-series bucket (jpeg / png / webp, 5 MB); the server action checks again, by the bytes. */
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGEN = 5 * 1024 * 1024

const CLASE_ITEM = 'min-h-9 gap-2.5 text-sm pointer-coarse:min-h-11'

interface EstadoCopia {
  readonly origen: PlanCabecera
  readonly reemplazar: boolean
  readonly enviando: boolean
  readonly error: string | null
}

function SinPlan({ motivo, error }: { readonly motivo: PlanClientProps['motivo']; readonly error: string | null }): ReactElement {
  return (
    <PaginaSistema breadcrumbs={<MigasDps actual="Plan" />}>
      <h1 className={CLASE_TITULO_PAGINA}>Plan</h1>
      {motivo === 'plan_invalido' ? (
        <EstadoVacioSistema
          icono={CalendarDays}
          titulo="Ese plan no existe"
          subtitulo="Puede que lo hayan borrado o que el enlace esté incompleto."
          accion={
            <BotonSistema asChild variante="outline" tamaño="sm">
              <Link href="/dps/plan">Ir al próximo plan</Link>
            </BotonSistema>
          }
        />
      ) : error ? (
        <EstadoVacioSistema icono={CalendarDays} titulo="No se pudo cargar el plan" subtitulo={error} />
      ) : (
        <EstadoVacioSistema
          icono={CalendarDays}
          titulo="Todavía no hay planes"
          subtitulo="La dirección de DPS crea los planes de cada fecha en la programación anual."
        />
      )}
    </PaginaSistema>
  )
}

export function PlanClient({ plan, anterior, siguiente, equipos: equiposIniciales, portadaUrl, motivo, error }: PlanClientProps): ReactElement {
  const toast = useNotificaciones()
  const [equipos, setEquipos] = useState<EquiposPlan | null>(equiposIniciales)
  const [portada, setPortada] = useState<string | null>(portadaUrl)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<EstadoGuardadoValor>('inactivo')
  const [aviso, setAviso] = useState('')
  const [copia, setCopia] = useState<EstadoCopia | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const enVueloRef = useRef(0)
  const archivoRef = useRef<HTMLInputElement>(null)

  const totales = useMemo(() => (equipos ? totalesPlan(equipos) : null), [equipos])

  if (!plan) return <SinPlan motivo={motivo} error={error} />

  const planId = plan.id
  const editable = equipos?.puedeEditar === true
  const horarios = horariosTexto(plan.horarios)

  function empezar(frase: string): void {
    enVueloRef.current += 1
    setGuardado('guardando')
    setAviso(frase)
  }

  function terminar(ok: boolean, mensaje?: string): void {
    enVueloRef.current -= 1
    if (!ok) {
      setGuardado('error')
      setAviso('')
      if (mensaje) toast.error(mensaje)
    } else if (enVueloRef.current === 0) {
      setGuardado((g) => (g === 'error' ? g : 'guardado'))
    }
  }

  async function elegir(_equipo: EquipoPlan, puesto: PuestoPlan, candidato: CandidatoPuesto): Promise<void> {
    setAbierto(null)
    if (puesto.convocados.some((c) => c.personaId === candidato.personaId)) return
    const nombre = nombreCompleto(candidato)
    const temporal: ConvocadoPlan = { convocadoId: '', personaId: candidato.personaId, servicioId: candidato.servicioId, nombre }
    setEquipos((e) => e && convocarEnPlan(e, puesto.puestoId, temporal))
    empezar(`Convocaste a ${nombre} para ${puesto.nombre}.`)

    const r = await convocarDps({ planId, puestoId: puesto.puestoId, servicioId: candidato.servicioId })
    if (!r.ok) {
      setEquipos((e) => e && quitarDePlan(e, puesto.puestoId, candidato.personaId))
      terminar(false, r.message)
      return
    }
    setEquipos((e) => e && confirmarConvocado(e, puesto.puestoId, candidato.personaId, r.data.convocadoId))
    terminar(true)
  }

  async function quitar(_equipo: EquipoPlan, puesto: PuestoPlan, convocado: ConvocadoPlan): Promise<void> {
    setEquipos((e) => e && quitarDePlan(e, puesto.puestoId, convocado.personaId))
    empezar(`Quitaste a ${convocado.nombre} de ${puesto.nombre}.`)

    const r = await desconvocarDps({ planId, puestoId: puesto.puestoId, personaId: convocado.personaId })
    if (!r.ok) {
      setEquipos((e) => e && convocarEnPlan(e, puesto.puestoId, convocado))
      terminar(false, r.message)
      return
    }
    terminar(true)
  }

  async function abrirCopia(): Promise<void> {
    const r = await planAnteriorDps({ planId })
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    if (!r.data) {
      toast.info('No hay un plan anterior del mismo tipo para copiar.')
      return
    }
    setCopia({ origen: r.data, reemplazar: (totales?.convocados ?? 0) > 0, enviando: false, error: null })
  }

  async function confirmarCopia(): Promise<void> {
    if (!copia) return
    setCopia({ ...copia, enviando: true, error: null })
    const r = await copiarPlanDps({ origenId: copia.origen.id, destinoId: planId, reemplazar: copia.reemplazar })
    if (!r.ok) {
      // Someone convocó meanwhile: the copy can only replace now.
      setCopia({ ...copia, enviando: false, error: r.message, reemplazar: copia.reemplazar || r.codigo === 'destino_con_convocados' })
      return
    }
    setCopia(null)
    const frase = textoCopia(r.data)
    setAviso(frase)
    toast.success(frase)
    const recarga = await cargarEquiposDps({ planId })
    if (recarga.ok) setEquipos(recarga.data)
    else toast.error(recarga.message)
  }

  async function alElegirArchivo(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    if (!TIPOS_IMAGEN.includes(archivo.type) || archivo.size === 0 || archivo.size > MAX_IMAGEN) {
      toast.error(MENSAJE_IMAGEN)
      return
    }
    const datos = new FormData()
    datos.set('planId', planId)
    datos.set('imagen', archivo)
    setSubiendo(true)
    const r = await cambiarPortadaDps(datos)
    setSubiendo(false)
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    setPortada(r.data.url)
    toast.success('Portada actualizada.')
  }

  async function quitarPortada(): Promise<void> {
    setSubiendo(true)
    const r = await quitarPortadaDps({ planId })
    setSubiendo(false)
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    setPortada(null)
    toast.success('Quitaste la portada.')
  }

  const conSerie = plan.serie !== null
  const acciones = editable ? (
    <>
      {conSerie && (
        <input
          ref={archivoRef}
          type="file"
          accept={TIPOS_IMAGEN.join(',')}
          aria-label="Elegir imagen de portada"
          hidden
          onChange={(e) => void alElegirArchivo(e)}
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <BotonSistema variante="outline" tamaño="sm" cargando={subiendo} disabled={subiendo}>
            Acciones
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </BotonSistema>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Acciones del plan" className="min-w-60 bg-card shadow-sheet">
          <DropdownMenuItem className={CLASE_ITEM} onSelect={() => void abrirCopia()}>
            <Copy aria-hidden="true" />
            {plan.tipo === 'domingo' ? 'Copiar del domingo anterior' : 'Copiar del plan anterior'}
          </DropdownMenuItem>
          {conSerie && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={CLASE_ITEM} onSelect={() => archivoRef.current?.click()}>
                <ImageUp aria-hidden="true" />
                Cambiar portada
              </DropdownMenuItem>
              {portada && (
                <DropdownMenuItem className={CLASE_ITEM} onSelect={() => void quitarPortada()}>
                  <ImageMinus aria-hidden="true" />
                  Quitar portada
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ) : null

  return (
    <PaginaSistema breadcrumbs={<MigasDps actual="Plan" />}>
      {/* Past the page gutters of PaginaSistema (p-4 sm:p-6 lg:px-12 lg:py-8), as components/grupos-vida/planner/marco-planner.tsx. */}
      <div className="-m-4 sm:-m-6 lg:-mx-12 lg:-my-8">
        <EncabezadoPlan plan={plan} anterior={anterior} siguiente={siguiente} portadaUrl={portada} acciones={acciones} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-6">
          <nav aria-label="Secciones del plan" className={LISTA_PESTANAS}>
            <span aria-disabled="true" title="Llega en una fase posterior" className={cn(clasePestana(false), 'cursor-default gap-1.5 opacity-60 hover:text-muted-foreground')}>
              Orden <small className="text-[11px]">pronto</small>
            </span>
            <span aria-current="page" className={clasePestana(true)}>
              Equipos
            </span>
          </nav>
          {totales && (
            <p data-testid="resumen-plan" className="text-[13px] text-muted-foreground">
              <strong className="font-mono font-semibold tabular-nums text-foreground">{totales.convocados}</strong>{' '}
              {totales.convocados === 1 ? 'convocado' : 'convocados'} en <span className="font-mono tabular-nums">{totales.equipos}</span>{' '}
              {totales.equipos === 1 ? 'equipo' : 'equipos'} ·{' '}
              {totales.falta > 0 ? (
                <span className="font-semibold text-danger-text">
                  <span className="font-mono tabular-nums">{totales.falta}</span> {totales.falta === 1 ? 'puesto sin cubrir' : 'puestos sin cubrir'}
                </span>
              ) : (
                'todo cubierto'
              )}
            </p>
          )}
          {equipos && !editable && (
            <p className="text-[13px] text-muted-foreground">Solo lectura: el plan lo arman la dirección de DPS y quienes ella agrega.</p>
          )}
          {editable && <EstadoGuardado estado={guardado} className="ml-auto" />}
        </div>

        <div className="px-4 pb-8 sm:px-6">
          {!equipos ? (
            <EstadoVacioSistema icono={UsersRound} titulo="No se pudo cargar el plan" subtitulo={error ?? 'Actualiza la página.'} />
          ) : equipos.equipos.length === 0 ? (
            <EstadoVacioSistema
              icono={UsersRound}
              titulo="Sin puestos en este plan"
              subtitulo="Los puestos de cada equipo de DPS se configuran una vez y aparecen en todos los planes."
            />
          ) : (
            <ColumnasEquipos
              equipos={equipos.equipos}
              acciones={{ planId, horarios, editable, abierto, onAbrir: setAbierto, onElegir: (e, p, c) => void elegir(e, p, c), onQuitar: (e, p, c) => void quitar(e, p, c) }}
            />
          )}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-testid="aviso-cambio">
        {aviso}
      </p>

      {editable && (
        <DialogoCopiar
          origen={copia?.origen ?? null}
          convocados={totales?.convocados ?? 0}
          reemplazar={copia?.reemplazar ?? false}
          enviando={copia?.enviando ?? false}
          error={copia?.error ?? null}
          onCerrar={() => setCopia(null)}
          onConfirmar={() => void confirmarCopia()}
        />
      )}
    </PaginaSistema>
  )
}
