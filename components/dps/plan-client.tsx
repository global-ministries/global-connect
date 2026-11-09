'use client'

/**
 * DPS › Plan — client island of /dps/plan, Plan del domingo · Orden and
 * Equipos (T10 and T13 of odd/tasks/dps-asistencia-pco.md; S6.2, S6.4,
 * S6.5, S7.1, S7.4, S10). Built on the wide layout of
 * docs/design-system/layout.md and the artboards
 * prototipos/planificacion-dps/01-plan-domingo-equipos.html and
 * 02-plan-domingo-orden.html.
 *
 * Top to bottom: crumbs "DPS › Plan"; the header band (encabezado-plan.tsx:
 * series cover, title, date pill to the previous / next plan, horarios and
 * llegada; «Matriz» to the matrix of Sundays of that week (T12, from md);
 * "Acciones ▾" for whoever edits: "Copiar del domingo anterior", «Copiar
 * orden del domingo anterior» and the series cover); the toolbar (tabs
 * «Orden» · «Equipos» · «Ensayo pronto», the summary and the autosave
 * status); then the tab. «Equipos»: "N convocados en M equipos · F puestos
 * sin cubrir" and the team columns (columnas-equipos.tsx). «Orden» (T13):
 * the context sidebar with the plan's own horarios (S10, orden-barra.tsx,
 * horarios-plan.tsx), «Servicio 1 h 07 min · termina 10:22 y 12:22» and
 * the order of the service (orden-servicio.tsx). The tabs are links
 * (`?vista=orden`) that switch in place and keep the URL in step. From md
 * the view fills the viewport under the desktop header: the band and the
 * toolbar stay put and only the columns or the order scroll (layout.md ›
 * Wide layout), so their scrollbars are always in view. On a phone the page
 * scrolls; the toolbar, the horarios and the order stack in that order.
 *
 * The page column is `relative`: its `sr-only` text (absolutely positioned)
 * would otherwise take the viewport as containing block, escape the clipping
 * of the shell's `<main>` scroller and stretch the document under the shell,
 * showing the body background as a band at the bottom (L34).
 *
 * Whoever edits (dps_plan_equipos.puede_editar) convoca from the popover and
 * quita from each row: the change is applied at once and saved through a
 * server action; a failure rolls it back and explains why. The copy confirms
 * first (and asks to replace when the plan already has people convocados by
 * hand; the automatic directors of S8 stay), then
 * reloads the teams and says how many were copied. The horarios and the
 * order save the same way (lib/actions/dps-orden.actions.ts). Everyone else
 * reads the same plan without controls. The database decides who edits and
 * who may be convocado where.
 *
 * Service notices (T15b; S13.2-S13.4, S13.6; design/dps-avisos/01, 02),
 * for whoever edits: the plan reads each person's state
 * (cargarEstadoAvisosDps) and who blocked its date
 * (cargarPersonasBloqueadasDps) once it opens, and the states again after
 * every convocar, quitar, copy, change of horarios and send. The header
 * sums the answers; the columns show a chip per person and «Buscar
 * reemplazo» on «No puede» (the pick convoca the new person and takes out
 * the one who could not); a bar «N avisos sin enviar» with «Enviar avisos»
 * shows while something is pending and the plan is not past, and opens the
 * review panel (avisos-panel.tsx). Nothing is notified on its own. A failed
 * read of the states keeps what is shown (none at first).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronDown, Copy, Grid3x3, ImageMinus, ImageUp, ListOrdered, UsersRound } from 'lucide-react'

import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { CLASE_TITULO_PAGINA } from '@/components/grupos-vida/planner/marco-planner'
import { LISTA_PESTANAS, clasePestana } from '@/components/ninos/pestanas-sistema'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cambiarPortadaDps, cargarEquiposDps, convocarDps, copiarPlanDps, desconvocarDps, planAnteriorDps, quitarPortadaDps } from '@/lib/actions/dps-plan.actions'
import { cargarOrdenDps, copiarOrdenDps, guardarHorariosDps } from '@/lib/actions/dps-orden.actions'
import { cargarEstadoAvisosDps, cargarPersonasBloqueadasDps } from '@/lib/actions/dps-avisos.actions'
import type { EnvioAvisos, PlanEstadoAvisos } from '@/lib/platform/dps/avisos'
import { MENSAJE_IMAGEN } from '@/lib/platform/dps/errores'
import { domingoAnterior, hrefMatriz } from '@/lib/platform/dps/matriz'
import { calcularOrden, cronogramaPlan, duracionLarga, type OrdenPlan } from '@/lib/platform/dps/orden'
import {
  confirmarConvocado,
  convocadosManuales,
  convocarEnPlan,
  etiquetaFechaPlan,
  quitarDePlan,
  textoCopia,
  tituloCabecera,
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

import { BarraAvisos, ResumenRespuestas, cierresAvisos, detalleAvisos } from './avisos-estado'
import { PanelAvisos, textoEnvio } from './avisos-panel'
import { ColumnasEquipos, type AvisosColumnas } from './columnas-equipos'
import { DialogoCopiar } from './dialogo-copiar'
import { EncabezadoPlan, hrefPlan } from './encabezado-plan'
import { EstadoGuardado, type EstadoGuardadoValor } from './estado-guardado'
import { MigasDps } from './migas-dps'
import { OrdenBarra } from './orden-barra'
import { OrdenDialogoCopiar } from './orden-dialogo-copiar'
import { OrdenServicio, type SeguimientoGuardado } from './orden-servicio'

export type VistaPlan = 'equipos' | 'orden'

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
  /** dps_orden_leer (T13); null when it failed (`ordenError`). */
  readonly orden?: OrdenPlan | null
  readonly ordenError?: string | null
  /** The tab it opens on (`?vista=orden`); Equipos by default. */
  readonly vista?: VistaPlan
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

const horaCorta = (hora: string): string => hora.replace(/^0(\d)/, '$1')

/** The states of the plan's notices; undefined when they could not be read (keep what is shown). */
async function leerEstadoAvisos(planId: string): Promise<PlanEstadoAvisos | null | undefined> {
  try {
    const r = await cargarEstadoAvisosDps({ planIds: [planId] })
    if (!r?.ok) return undefined
    return r.data.planes.find((p) => p.planId === planId) ?? null
  } catch {
    return undefined
  }
}

/** Who blocked the plan's date, with their nota (S13.6); null when it could not be read. */
async function leerBloqueados(planId: string): Promise<ReadonlyMap<string, string | null> | null> {
  try {
    const r = await cargarPersonasBloqueadasDps({ planId })
    return r?.ok ? new Map(r.data.map((b) => [b.personaId, b.nota])) : null
  } catch {
    return null
  }
}

const SIN_BLOQUEOS: ReadonlyMap<string, string | null> = new Map()

/** "9:26", "9:26 y 11:26", "8:20, 10:20 y 12:20". */
function enumerar(partes: readonly string[]): ReactElement[] {
  return partes.map((p, i) => (
    <span key={i}>
      {i > 0 && (i === partes.length - 1 ? ' y ' : ', ')}
      <strong className="font-mono font-semibold tabular-nums text-foreground">{p}</strong>
    </span>
  ))
}

function textoCopiaOrden(copiados: number): string {
  if (copiados === 0) return 'El plan anterior no tiene orden para copiar.'
  return copiados === 1 ? 'Se copió 1 fila del orden.' : `Se copiaron ${copiados} filas del orden.`
}

function SinPlan({ motivo, error }: { readonly motivo: PlanClientProps['motivo']; readonly error: string | null }): ReactElement {
  return (
    <PaginaSistema breadcrumbs={<MigasDps actual="Plan" />} className="relative">
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

export function PlanClient({
  plan: planInicial,
  anterior,
  siguiente,
  equipos: equiposIniciales,
  portadaUrl,
  motivo,
  error,
  orden: ordenInicial = null,
  ordenError = null,
  vista: vistaInicial = 'equipos',
}: PlanClientProps): ReactElement {
  const toast = useNotificaciones()
  const [plan, setPlan] = useState<PlanCabecera | null>(planInicial)
  const [vista, setVista] = useState<VistaPlan>(vistaInicial)
  const [orden, setOrden] = useState<OrdenPlan | null>(ordenInicial)
  const [copiaOrden, setCopiaOrden] = useState<EstadoCopia | null>(null)
  const [equipos, setEquipos] = useState<EquiposPlan | null>(equiposIniciales)
  const [portada, setPortada] = useState<string | null>(portadaUrl)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<EstadoGuardadoValor>('inactivo')
  const [aviso, setAviso] = useState('')
  const [copia, setCopia] = useState<EstadoCopia | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const enVueloRef = useRef(0)
  const archivoRef = useRef<HTMLInputElement>(null)
  const [estadoAvisos, setEstadoAvisos] = useState<PlanEstadoAvisos | null>(null)
  const [bloqueados, setBloqueados] = useState<ReadonlyMap<string, string | null>>(SIN_BLOQUEOS)
  const [reemplazo, setReemplazo] = useState<{ readonly puestoId: string; readonly personaId: string; readonly nombre: string } | null>(null)
  const [enviarAbierto, setEnviarAbierto] = useState(false)
  const pedidoAvisosRef = useRef(0)
  // Only whoever edits reads the notices (the database refuses the rest).
  const idAvisos = equiposIniciales?.puedeEditar === true ? (planInicial?.id ?? null) : null

  useEffect(() => {
    if (!idAvisos) return
    const pedido = ++pedidoAvisosRef.current
    void leerEstadoAvisos(idAvisos).then((e) => {
      if (pedido === pedidoAvisosRef.current && e !== undefined) setEstadoAvisos(e)
    })
    void leerBloqueados(idAvisos).then((b) => {
      if (b) setBloqueados(b)
    })
  }, [idAvisos])

  const totales = useMemo(() => (equipos ? totalesPlan(equipos) : null), [equipos])
  // The copy replaces only the people convocados by hand; the automatic directors stay (S8).
  const manuales = useMemo(() => (equipos ? convocadosManuales(equipos) : 0), [equipos])
  const calculo = useMemo(() => (plan ? calcularOrden(orden?.filas ?? [], plan.horarios, plan.llegada) : null), [orden, plan])

  if (!plan || !calculo) return <SinPlan motivo={motivo} error={error} />

  const planId = plan.id
  const editable = equipos?.puedeEditar === true
  const ordenEditable = orden?.puedeEditar === true
  const horarios = horariosTexto(plan.horarios)
  const enOrden = vista === 'orden'
  const hrefVista = (v: VistaPlan): string => `${hrefPlan(planId)}${v === 'orden' ? '&vista=orden' : ''}`

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

  const seguimiento: SeguimientoGuardado = { empezar, terminar, anunciar: setAviso }

  /** Reads the states again after a change; the latest read wins. */
  function recargarAvisos(): void {
    if (!idAvisos) return
    const pedido = ++pedidoAvisosRef.current
    void leerEstadoAvisos(idAvisos).then((e) => {
      if (pedido === pedidoAvisosRef.current && e !== undefined) setEstadoAvisos(e)
    })
  }

  function alEnviar(envio: EnvioAvisos): void {
    setEnviarAbierto(false)
    const frase = textoEnvio(envio)
    setAviso(frase)
    if (envio.enviados > 0 || envio.cerrados > 0) toast.success(frase)
    else toast.info(frase)
    recargarAvisos()
  }

  function cambiarVista(e: MouseEvent<HTMLAnchorElement>, v: VistaPlan): void {
    e.preventDefault()
    setVista(v)
    window.history.replaceState(window.history.state, '', hrefVista(v))
  }

  async function guardarHorarios(nuevos: readonly string[], llegada: string): Promise<void> {
    const antes = plan
    setPlan((p) => p && { ...p, horarios: [...nuevos], llegada })
    empezar(`Horarios: ${horariosTexto(nuevos)}, llegada ${horaCorta(llegada)}. Horas recalculadas.`)
    const r = await guardarHorariosDps({ planId, horarios: nuevos, llegada })
    if (!r.ok) {
      setPlan(antes)
      terminar(false, r.message)
      return
    }
    terminar(true)
    recargarAvisos()
  }

  async function abrirCopiaOrden(): Promise<void> {
    const r = await planAnteriorDps({ planId })
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    if (!r.data) {
      toast.info('No hay un plan anterior del mismo tipo para copiar.')
      return
    }
    setCopiaOrden({ origen: r.data, reemplazar: (orden?.filas.length ?? 0) > 0, enviando: false, error: null })
  }

  async function confirmarCopiaOrden(): Promise<void> {
    if (!copiaOrden) return
    setCopiaOrden({ ...copiaOrden, enviando: true, error: null })
    const r = await copiarOrdenDps({ origenId: copiaOrden.origen.id, destinoId: planId, reemplazar: copiaOrden.reemplazar })
    if (!r.ok) {
      // Someone added rows meanwhile: the copy can only replace now.
      setCopiaOrden({ ...copiaOrden, enviando: false, error: r.message, reemplazar: copiaOrden.reemplazar || r.codigo === 'destino_con_orden' })
      return
    }
    setCopiaOrden(null)
    const frase = textoCopiaOrden(r.data.copiados)
    setAviso(frase)
    toast.success(frase)
    const recarga = await cargarOrdenDps({ planId })
    if (recarga.ok) setOrden(recarga.data)
    else toast.error(recarga.message)
  }

  async function elegir(_equipo: EquipoPlan, puesto: PuestoPlan, candidato: CandidatoPuesto): Promise<void> {
    setAbierto(null)
    // «Buscar reemplazo»: the pick takes the place of who said «No puede».
    const reemplazado = reemplazo?.puestoId === puesto.puestoId ? reemplazo : null
    setReemplazo(null)
    if (puesto.convocados.some((c) => c.personaId === candidato.personaId)) return
    const nombre = nombreCompleto(candidato)
    const temporal: ConvocadoPlan = { convocadoId: '', personaId: candidato.personaId, servicioId: candidato.servicioId, nombre, automatico: false }
    setEquipos((e) => e && convocarEnPlan(e, puesto.puestoId, temporal))
    const bloqueo = bloqueados.has(candidato.personaId) ? ' Ojo: bloqueó esta fecha.' : ''
    empezar(
      reemplazado
        ? `${nombre} reemplaza a ${reemplazado.nombre} en ${puesto.nombre}. Queda sin avisar.${bloqueo}`
        : `Convocaste a ${nombre} para ${puesto.nombre}.${bloqueo}`,
    )

    const r = await convocarDps({ planId, puestoId: puesto.puestoId, servicioId: candidato.servicioId })
    if (!r.ok) {
      setEquipos((e) => e && quitarDePlan(e, puesto.puestoId, candidato.personaId))
      terminar(false, r.message)
      return
    }
    setEquipos((e) => e && confirmarConvocado(e, puesto.puestoId, candidato.personaId, r.data.convocadoId))
    const saliente = reemplazado ? puesto.convocados.find((c) => c.personaId === reemplazado.personaId) : undefined
    if (saliente) {
      setEquipos((e) => e && quitarDePlan(e, puesto.puestoId, saliente.personaId))
      const q = await desconvocarDps({ planId, puestoId: puesto.puestoId, personaId: saliente.personaId })
      if (!q.ok) {
        setEquipos((e) => e && convocarEnPlan(e, puesto.puestoId, saliente))
        terminar(false, q.message)
        recargarAvisos()
        return
      }
    }
    terminar(true)
    recargarAvisos()
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
    recargarAvisos()
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
    setCopia({ origen: r.data, reemplazar: manuales > 0, enviando: false, error: null })
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
    recargarAvisos()
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
  // The matrix of Sundays (T12) opens on this plan's week; a desktop view, for everyone who reads the plan.
  const matriz = (
    <BotonSistema asChild variante="outline" tamaño="sm" icono={Grid3x3} className="hidden md:inline-flex">
      <Link href={hrefMatriz(domingoAnterior(plan.fecha))}>Matriz</Link>
    </BotonSistema>
  )
  const acciones = editable || ordenEditable ? (
    <>
      {matriz}
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
          {editable && (
            <DropdownMenuItem className={CLASE_ITEM} onSelect={() => void abrirCopia()}>
              <Copy aria-hidden="true" />
              {plan.tipo === 'domingo' ? 'Copiar del domingo anterior' : 'Copiar del plan anterior'}
            </DropdownMenuItem>
          )}
          {ordenEditable && (
            <DropdownMenuItem className={CLASE_ITEM} onSelect={() => void abrirCopiaOrden()}>
              <ListOrdered aria-hidden="true" />
              {plan.tipo === 'domingo' ? 'Copiar orden del domingo anterior' : 'Copiar orden del plan anterior'}
            </DropdownMenuItem>
          )}
          {conSerie && editable && (
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
  ) : (
    matriz
  )

  const pestana = (v: VistaPlan, texto: string): ReactElement => (
    <Link href={hrefVista(v)} aria-current={vista === v ? 'page' : undefined} onClick={(e) => cambiarVista(e, v)} className={clasePestana(vista === v)}>
      {texto}
    </Link>
  )
  const soloLectura = enOrden ? orden !== null && !ordenEditable : equipos !== null && !editable
  const conAvisos = editable && estadoAvisos !== null
  const avisosColumnas: AvisosColumnas | null =
    editable && estadoAvisos
      ? {
          personas: new Map(estadoAvisos.personas.map((p) => [p.personaId, p])),
          bloqueados,
          reemplazo,
          onReemplazo: (puesto, convocado) => {
            setReemplazo({ puestoId: puesto.puestoId, personaId: convocado.personaId, nombre: convocado.nombre })
            setAbierto(puesto.puestoId)
          },
        }
      : null
  const barraAvisos = conAvisos && !enOrden && !estadoAvisos.pasado && estadoAvisos.porEnviar > 0

  return (
    <PaginaSistema breadcrumbs={<MigasDps actual="Plan" />} className="relative">
      {/* Past the page gutters of PaginaSistema (p-4 sm:p-6 lg:px-12 lg:py-8), as components/grupos-vida/planner/marco-planner.tsx.
          From md, exactly the viewport under the 64px desktop header (at least 32rem on very short windows). */}
      <div data-testid="marco-plan" className="-m-4 sm:-m-6 md:flex md:h-[calc(100dvh-4rem)] md:min-h-[32rem] md:flex-col lg:-mx-12 lg:-my-8">
        <EncabezadoPlan
          plan={plan}
          anterior={anterior}
          siguiente={siguiente}
          portadaUrl={portada}
          acciones={acciones}
          resumen={conAvisos ? <ResumenRespuestas resumen={estadoAvisos.resumen} /> : null}
        />

        {/* From md: [context sidebar | toolbar over the tab]. On a phone the main column dissolves (`contents`)
            so the toolbar, the sidebar and the tab stack in that order. */}
        <div className="flex flex-col md:min-h-0 md:flex-1 md:flex-row">
          {enOrden && (
            <OrdenBarra
              className="order-2 md:order-none"
              horarios={plan.horarios}
              llegada={plan.llegada}
              cronograma={cronogramaPlan(calculo, plan.llegada)}
              editable={ordenEditable}
              equipos={equipos}
              onGuardarHorarios={(h, l) => void guardarHorarios(h, l)}
              onVerEquipos={() => {
                setVista('equipos')
                window.history.replaceState(window.history.state, '', hrefVista('equipos'))
              }}
            />
          )}
          <div className="contents md:flex md:min-w-0 md:flex-1 md:flex-col">
            <div className="order-1 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-6 md:order-none">
              <nav aria-label="Secciones del plan" className={LISTA_PESTANAS}>
                {pestana('orden', 'Orden')}
                {pestana('equipos', 'Equipos')}
                <span aria-disabled="true" title="Llega en una fase posterior" className={cn(clasePestana(false), 'cursor-default gap-1.5 opacity-60 hover:text-muted-foreground')}>
                  Ensayo <small className="text-[11px]">pronto</small>
                </span>
              </nav>
              {!enOrden && totales && (
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
              {enOrden && calculo.filas.length > 0 && (
                <p data-testid="resumen-orden" className="text-[13px] text-muted-foreground">
                  Servicio <strong className="font-mono font-semibold tabular-nums text-foreground">{duracionLarga(calculo.servicioSeg)}</strong> · termina{' '}
                  {enumerar(calculo.fines)}
                </p>
              )}
              {soloLectura && <p className="text-[13px] text-muted-foreground">Solo lectura: el plan lo arman la dirección de DPS y quienes ella agrega.</p>}
              {(enOrden ? ordenEditable : editable) && <EstadoGuardado estado={guardado} className="ml-auto" />}
            </div>

            <div className="order-3 px-4 pb-8 sm:px-6 md:order-none md:flex md:min-h-0 md:flex-1 md:flex-col md:pb-4">
              {enOrden ? (
                <OrdenServicio plan={plan} orden={orden} error={ordenError} calculo={calculo} onOrden={setOrden} seguimiento={seguimiento} />
              ) : !equipos ? (
                <EstadoVacioSistema icono={UsersRound} titulo="No se pudo cargar el plan" subtitulo={error ?? 'Actualiza la página.'} />
              ) : equipos.equipos.length === 0 ? (
                <EstadoVacioSistema
                  icono={UsersRound}
                  titulo="Sin puestos en este plan"
                  subtitulo="Los puestos de cada equipo de DPS se configuran una vez y aparecen en todos los planes."
                />
              ) : (
                <ColumnasEquipos
                  className="md:min-h-0 md:flex-1"
                  equipos={equipos.equipos}
                  acciones={{
                    planId,
                    horarios,
                    editable,
                    abierto,
                    onAbrir: (id) => {
                      setAbierto(id)
                      if (id === null) setReemplazo(null)
                    },
                    onElegir: (e, p, c) => void elegir(e, p, c),
                    onQuitar: (e, p, c) => void quitar(e, p, c),
                    avisos: avisosColumnas,
                  }}
                />
              )}
            </div>
            {barraAvisos && (
              <div className="order-2 shrink-0 px-4 pb-3 sm:px-6 md:order-none md:pb-4">
                <BarraAvisos
                  porEnviar={estadoAvisos.porEnviar}
                  cierres={cierresAvisos(estadoAvisos.porEnviar, estadoAvisos.personas)}
                  detalle={detalleAvisos(estadoAvisos.personas, cierresAvisos(estadoAvisos.porEnviar, estadoAvisos.personas))}
                  nota="Puedes cambiar a alguien las veces que quieras: solo sale el último cambio."
                  onEnviar={() => setEnviarAbierto(true)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-testid="aviso-cambio">
        {aviso}
      </p>

      {editable && (
        <DialogoCopiar
          origen={copia?.origen ?? null}
          convocados={manuales}
          reemplazar={copia?.reemplazar ?? false}
          enviando={copia?.enviando ?? false}
          error={copia?.error ?? null}
          onCerrar={() => setCopia(null)}
          onConfirmar={() => void confirmarCopia()}
        />
      )}
      {editable && enviarAbierto && (
        <PanelAvisos
          abierto
          onCerrar={() => setEnviarAbierto(false)}
          planIds={[planId]}
          descripcion={`${etiquetaFechaPlan(plan.fecha)} · ${tituloCabecera(plan)}`}
          onEnviado={alEnviar}
        />
      )}
      {ordenEditable && (
        <OrdenDialogoCopiar
          origen={copiaOrden?.origen ?? null}
          filas={orden?.filas.length ?? 0}
          reemplazar={copiaOrden?.reemplazar ?? false}
          enviando={copiaOrden?.enviando ?? false}
          error={copiaOrden?.error ?? null}
          onCerrar={() => setCopiaOrden(null)}
          onConfirmar={() => void confirmarCopiaOrden()}
        />
      )}
    </PaginaSistema>
  )
}
