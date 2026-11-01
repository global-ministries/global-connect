'use client'

/**
 * Estudiantes › Promover temporada — client island of /estudiantes/promocion
 * (C6b3 of odd/tasks/estudiantes-fase-b.md, S11–S15; artboards 09 desktop and
 * 10 phone of design/estudiantes-asistencia, A18–A25).
 *
 * One page, no wizard (A19). Top to bottom: breadcrumbs "Estudiantes / Grupos
 * / Promover temporada" (phone "‹ Grupos"), hero with the key numbers, the
 * campus select when there is more than one, the once-a-year warning, the
 * search, the attention metrics as filters (Por decidir, Pasan a Inside Out,
 * Egresan, Quedan vacíos), the ámbito cards (toggle filter), one decision
 * card per 3er año group, the groups "Grupo hoy → Queda como", the graduates
 * and the page actions; "Promover temporada" stays disabled with a status
 * line until every 3er año group has a choice, then asks in a dialog. A row
 * opens the read-only group drawer. After applying (or within 180 days of
 * the last promotion) the page shows the blocked state.
 *
 * Every rule lives in lib/platform/estudiantes/promocion.ts; the server
 * action (lib/actions/estudiantes-promocion.actions.ts) applies it and the
 * database checks it again. Filters are mirrored into the URL with
 * `history.replaceState`; the choices stay in local state.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarX, Search, UsersRound } from 'lucide-react'

import { BotonSistema, InputSistema, PaginaSistema, PieAccionesSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { TarjetasFiltro } from '@/components/ui/TarjetasFiltro'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { aplicarPromocion } from '@/lib/actions/estudiantes-promocion.actions'
import {
  FILTROS_PROMOCION,
  calcularPromocion,
  decisionesParaAplicar,
  detallePromocion,
  urlPromocion,
  type CampusPromocion,
  type ContenidoPromocion,
  type Decision,
  type Decisiones,
  type FiltrosPromocion,
  type MetricaPromocion,
  type ResultadoPromocion,
  type VistaPromocion,
} from '@/lib/platform/estudiantes/promocion'

import { FilaInset, ListaInset, TituloSeccion } from '../filas-inset'
import { DetallePromocion } from './detalle-promocion'
import { DialogoPromocion } from './dialogo-promocion'
import { EstadoPromovido } from './estado-promovido'
import { ListaPromocion } from './lista-promocion'
import { AvisoPromocion } from './partes-promocion'
import { TarjetaDecision, idOpcion } from './tarjeta-decision'

const TITULO = 'Promover temporada'
const CLASE_H2 = 'px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0'

export interface PromocionClientProps {
  /** Campuses the caller may promote, by name. */
  readonly campus: readonly CampusPromocion[]
  readonly campusId: string
  readonly contenido: ContenidoPromocion
  readonly filtrosIniciales?: FiltrosPromocion
}

function Migas(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="flex min-w-0 items-center">
          <span className="truncate px-2 py-1.5 text-muted-foreground">Estudiantes</span>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            /
          </span>
          <Link
            href="/estudiantes/grupos"
            className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11"
          >
            Grupos
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            /
          </span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            {TITULO}
          </span>
        </li>
      </ol>
    </nav>
  )
}

const Num = ({ n }: { readonly n: number }): ReactElement => <strong className="font-mono tabular-nums">{n}</strong>

function Resumen({ campus, vista, resultado }: { readonly campus: string; readonly vista: VistaPromocion | null; readonly resultado: ResultadoPromocion | null }): ReactElement {
  if (!vista || !resultado) return <>{campus}</>
  if (resultado.bloqueado) {
    return (
      <>
        {campus} · Ya se promovió este campus el <strong>{resultado.bloqueado.fecha}</strong>
      </>
    )
  }
  const { grupos, suben, pasanInsideOut, egresan } = resultado.resumen
  const [desde, hasta] = [vista.ambitos[0]?.nombre ?? 'Transit', vista.ambitos[1]?.nombre ?? 'Inside Out']
  return (
    <>
      {campus} · <Num n={grupos} /> {grupos === 1 ? 'grupo' : 'grupos'} y <Num n={suben} /> estudiantes suben un año · <Num n={pasanInsideOut} /> pasan de {desde} a {hasta} ·{' '}
      <Num n={egresan} /> egresan a {vista.theLivingRoom?.nombre ?? 'The Living Room'}
    </>
  )
}

function Encabezado({ resumen, tituloRef }: { readonly resumen: ReactElement; readonly tituloRef: React.RefObject<HTMLHeadingElement | null> }): ReactElement {
  return (
    <>
      <div data-slot="cabecera-movil" className="md:hidden">
        <div className="-mx-2 -mt-2 mb-1">
          <BotonAtrasMovil atras={{ etiqueta: 'Grupos', href: '/estudiantes/grupos' }} className="max-w-[75%]" />
        </div>
        <TituloGrande titulo={TITULO} nivel={2} resumen={resumen} />
      </div>
      <div className="hidden min-w-0 md:block">
        <h1 ref={tituloRef} tabIndex={-1} className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground focus:outline-none">
          {TITULO}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{resumen}</p>
      </div>
    </>
  )
}

export function PromocionClient({ campus, campusId, contenido, filtrosIniciales = FILTROS_PROMOCION }: PromocionClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const vista: VistaPromocion | null = contenido.tipo === 'vista' ? contenido.vista : null
  const nombreCampus = vista?.campus.nombre ?? campus.find((c) => c.id === campusId)?.nombre ?? ''

  const [decisiones, setDecisiones] = useState<Decisiones>({})
  const [filtros, setFiltros] = useState<FiltrosPromocion>(filtrosIniciales)
  // The row stays selected after the drawer closes, so it can animate out.
  const [detalle, setDetalle] = useState<{ readonly filaId: string; readonly abierto: boolean } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aplicado = useRef(false)
  const tituloRef = useRef<HTMLHeadingElement>(null)

  const resultado = useMemo(() => (vista ? calcularPromocion({ vista, decisiones, filtros }) : null), [vista, decisiones, filtros])
  const detalleActual = useMemo(() => (vista && detalle ? detallePromocion(vista, decisiones, detalle.filaId) : null), [vista, decisiones, detalle])

  // After applying, the page comes back blocked: focus moves to the title.
  useEffect(() => {
    if (aplicado.current && resultado?.bloqueado) {
      aplicado.current = false
      tituloRef.current?.focus({ preventScroll: true })
    }
  }, [resultado?.bloqueado])

  function cambiar(parche: Partial<FiltrosPromocion>): void {
    const siguiente = { ...filtros, ...parche }
    setFiltros(siguiente)
    window.history.replaceState(window.history.state, '', urlPromocion(campus.length > 1 ? campusId : null, siguiente))
  }

  function decidir(grupoId: string, decision: Decision): void {
    setDecisiones((actual) => ({ ...actual, [grupoId]: decision }))
  }

  function irADecision(grupoId: string): void {
    setDetalle((actual) => (actual ? { ...actual, abierto: false } : null))
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true
    // Let the drawer give focus back before moving it to the option.
    window.setTimeout(() => {
      const opcion = document.getElementById(idOpcion(grupoId, 'pasan_chicos'))
      opcion?.scrollIntoView?.({ block: 'center', behavior: reducido ? 'auto' : 'smooth' })
      opcion?.focus({ preventScroll: true })
    }, 0)
  }

  async function confirmar(): Promise<void> {
    if (!vista) return
    const enviar = decisionesParaAplicar(vista, decisiones)
    if (!enviar) return
    setEnviando(true)
    setError(null)
    try {
      const r = await aplicarPromocion({ campusId: vista.campus.id, decisiones: enviar })
      if (!r.ok) {
        setError(r.message)
        return
      }
      aplicado.current = true
      setConfirmando(false)
      toast.success(`${vista.campus.nombre} promovido: ${r.data.grupos} ${r.data.grupos === 1 ? 'grupo subió' : 'grupos subieron'} un año`)
      router.refresh()
    } catch {
      setError('No se pudo promover. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const resumen = <Resumen campus={nombreCampus} vista={vista} resultado={resultado} />
  const selectorCampus =
    campus.length > 1 ? (
      <div className="lg:max-w-[360px]">
        <SelectSistema
          label="Campus"
          opciones={campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
          value={campusId}
          onValueChange={(id) => router.push(urlPromocion(id, FILTROS_PROMOCION))}
        />
      </div>
    ) : null

  if (!vista || !resultado) {
    return (
      <PaginaSistema breadcrumbs={<Migas />}>
        <Encabezado resumen={resumen} tituloRef={tituloRef} />
        {selectorCampus}
        <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
          {contenido.tipo === 'sin_escala' ? (
            <EstadoVacioSistema
              icono={CalendarX}
              titulo="Este campus no tiene escala de años"
              subtitulo="Para promover hace falta la escala de Transit e Inside Out del campus (1er a 6to año). Pide que la configuren."
            />
          ) : (
            <EstadoVacioSistema icono={CalendarX} titulo="No se pudo cargar la promoción" subtitulo={contenido.tipo === 'error' ? contenido.mensaje : undefined} />
          )}
        </div>
      </PaginaSistema>
    )
  }

  if (resultado.bloqueado) {
    return (
      <PaginaSistema breadcrumbs={<Migas />}>
        <Encabezado resumen={resumen} tituloRef={tituloRef} />
        {selectorCampus}
        <EstadoPromovido estado={resultado.bloqueado} theLivingRoom={vista.theLivingRoom} />
      </PaginaSistema>
    )
  }

  const hayFiltros = filtros.metrica !== null || filtros.ambito !== null || filtros.q.trim() !== ''
  const ultimoTransit = vista.ambitos[0]?.ultimoEtiqueta ?? '3er año'

  return (
    <PaginaSistema breadcrumbs={<Migas />}>
      <Encabezado resumen={resumen} tituloRef={tituloRef} />
      {selectorCampus}

      <AvisoPromocion tono="warning" titulo="Se aplica una vez al año y no se puede deshacer desde la app.">
        <p>{`${vista.ambitos.map((a) => a.nombre).join(' e ')} de ${vista.campus.nombre} suben juntos. Revisa la lista, decide qué pasa con cada grupo de ${ultimoTransit} y confirma.`}</p>
      </AvisoPromocion>

      <InputSistema
        type="search"
        aria-label="Buscar grupo, líder o estudiante"
        placeholder="Buscar grupo, líder o estudiante"
        icono={Search}
        value={filtros.q}
        onChange={(e) => cambiar({ q: e.target.value })}
      />

      <MetricasAtencion
        etiqueta="Resumen de la promoción"
        metricas={resultado.metricas}
        onAlternar={(id) => cambiar({ metrica: filtros.metrica === id ? null : (id as MetricaPromocion) })}
      />

      {resultado.ambitos.length > 1 && (
        <section aria-labelledby="promocion-ambitos" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 px-1 md:px-0">
            <h2 id="promocion-ambitos" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Ámbitos
            </h2>
            <span className="hidden text-xs text-muted-foreground md:inline">Toca para ver solo uno</span>
          </div>
          <TarjetasFiltro
            items={resultado.ambitos.map((a) => ({ id: a.id, label: a.label, subtitulo: a.subtitulo, total: a.total, badge: null, insignias: a.insignias }))}
            modoCompacto={false}
            seleccionadoId={filtros.ambito ?? ''}
            onSeleccionar={(id) => cambiar({ ambito: filtros.ambito === id ? null : id })}
            unidad={{ singular: 'integrante', plural: 'integrantes' }}
            etiqueta="Ámbitos"
            buscarEtiqueta="Buscar ámbito"
            presentacion="alcance"
          />
        </section>
      )}

      {resultado.decisiones.length > 0 && (
        <section aria-labelledby="promocion-decisiones" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 md:px-0">
            <h2 id="promocion-decisiones" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {`${ultimoTransit} de ${vista.ambitos[0]?.nombre ?? 'Transit'} · decide cada grupo`}
            </h2>
            <span className="text-xs text-muted-foreground">{resultado.pistaDecisiones}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {resultado.decisiones.map((tarjeta) => (
              <TarjetaDecision key={tarjeta.grupoId} tarjeta={tarjeta} onDecidir={decidir} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="promocion-grupos" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="promocion-grupos" className={CLASE_H2}>
            Grupos · <span className="font-mono tabular-nums">{vista.totales.grupos}</span>
          </h2>
          <span className="hidden text-xs text-muted-foreground md:inline">Los visitantes suben con su grupo</span>
        </div>
        {resultado.bloques.length > 0 ? (
          <ListaPromocion bloques={resultado.bloques} onAbrir={(filaId) => setDetalle({ filaId, abierto: true })} />
        ) : (
          <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
            <EstadoVacioSistema
              icono={UsersRound}
              titulo={hayFiltros ? 'Ningún grupo coincide' : 'No hay grupos activos'}
              subtitulo={hayFiltros ? 'Toca de nuevo la métrica o el ámbito, o cambia la búsqueda.' : 'Las fichas sin grupo suben de año igual.'}
              accion={
                hayFiltros ? (
                  <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar(FILTROS_PROMOCION)}>
                    Limpiar todo
                  </BotonSistema>
                ) : undefined
              }
            />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{resultado.pie.resumen}</span>
          {resultado.pie.sinGrupo && <span>{resultado.pie.sinGrupo}</span>}
        </div>
      </section>

      <section aria-labelledby="promocion-egresan" className="space-y-3">
        <TituloSeccion id="promocion-egresan" texto="Egresan" cantidad={resultado.totalEgresados} pista={<span className="hidden md:inline">Su año final es el año que cursan hoy</span>} />
        {resultado.egresados.length > 0 ? (
          <ListaInset etiqueta="Egresan">
            {resultado.egresados.map((e) => (
              <FilaInset key={e.personaId} titulo={e.nombre} subtitulo={`${e.grupo} · año final ${e.anioFinal} → ${e.pasaA}`} />
            ))}
          </ListaInset>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
            <EstadoVacioSistema
              icono={UsersRound}
              titulo={resultado.totalEgresados ? 'Nadie que egresa coincide' : 'Nadie egresa este año'}
              subtitulo={resultado.totalEgresados ? 'Busca por nombre o grupo.' : 'Ningún estudiante está en su año final.'}
            />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
          <span>{resultado.pieEgresados}</span>
          {resultado.egresados.length > 0 && <span>{resultado.egresados[0].pasaADetalle}</span>}
        </div>
      </section>

      <PieAccionesSistema fijo={false} aria-label="Confirmar la promoción" role="group">
        <p id="promocion-estado" role="status" className="text-sm text-muted-foreground max-sm:order-last sm:mr-auto">
          {resultado.estadoPie}
        </p>
        <BotonSistema asChild variante="outline">
          <Link href="/estudiantes/grupos">Cancelar</Link>
        </BotonSistema>
        <BotonSistema
          type="button"
          disabled={!resultado.puedeConfirmar}
          aria-describedby="promocion-estado"
          onClick={() => {
            setError(null)
            setConfirmando(true)
          }}
        >
          {TITULO}
        </BotonSistema>
      </PieAccionesSistema>

      <DetallePromocion
        key={detalle?.filaId ?? 'ninguno'}
        detalle={detalleActual}
        abierto={detalle?.abierto ?? false}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
        onIrADecision={irADecision}
      />

      <DialogoPromocion
        confirmacion={resultado.confirmacion}
        abierto={confirmando}
        enviando={enviando}
        error={error}
        onCerrar={() => setConfirmando(false)}
        onConfirmar={() => void confirmar()}
      />
    </PaginaSistema>
  )
}
