'use client'

/**
 * Estudiantes › Promover temporada — client island of /estudiantes/promocion
 * (C6b3 of odd/tasks/estudiantes-fase-b.md, S11–S15), in the planning style
 * of odd/tasks/estudiantes-estilo-dps.md (S7; artboards 13 desktop and 14
 * phone of design/estudiantes-dps, C15–C26).
 *
 * One page, no wizard (A19). Desktop (`MarcoAlcance`): breadcrumbs
 * "Estudiantes › Grupos › Promover temporada"; the header band with the key
 * numbers and no action (the only primary action ends the flow; the campus
 * select when there is more than one); the «barra de alcance» with Resumen
 * (the four metrics as toggles: Por decidir, Pasan a Inside Out, Egresan,
 * Quedan vacíos), Ámbitos (toggle filter) and Además; the toolbar (search,
 * the jumps «3er año | Grupo hoy → Queda como | Egresan», "N de M grupos");
 * one scrolling region with the once-a-year warning, the 3er año decision
 * cards first (they enable the button, D6), the table "Grupo hoy → Queda
 * como" banded by ámbito and sub-área and the graduates; the footer fixed
 * under the view says how many decisions are missing («Faltan 2
 * decisiones: …», S7) next to Cancelar and «Promover temporada», which asks
 * in a dialog. A row opens the read-only group panel, docked from 1280px.
 *
 * Phone: "‹ Grupos", the large title and summary, the warning, the search,
 * the metrics 2 × 2, the ámbitos as pills, the cards, the groups by ámbito
 * and sub-área, the graduates and the same footer fixed over the tab bar.
 *
 * After applying (or within 180 days of the last promotion) the page shows
 * the blocked state. Every rule lives in lib/platform/estudiantes/promocion.ts;
 * the server action (lib/actions/estudiantes-promocion.actions.ts) applies it
 * and the database checks it again. Filters are mirrored into the URL with
 * `history.replaceState`; the choices stay in local state.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpCircle, CalendarX, UsersRound } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { LISTA_PESTANAS, clasePestana } from '@/components/ninos/pestanas-sistema'
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
import { cn } from '@/lib/utils'

import { BarraAlcance, FilaAlcance, SeccionAlcance } from '../alcance/barra-alcance'
import { BuscadorBarra } from '../alcance/herramientas-tabla'
import { MarcoAlcance } from '../alcance/marco-alcance'
import { MetricasCompactas } from '../alcance/movil-alcance'
import { useAcoplado } from '../alcance/panel-acoplado'
import { FilaInset, ListaInset } from '../filas-inset'
import { DetallePromocion } from './detalle-promocion'
import { DialogoPromocion } from './dialogo-promocion'
import { EstadoPromovido } from './estado-promovido'
import { ListaPromocionMovil, TablaEgresan, TablaPromocion } from './lista-promocion'
import { AvisoPromocion } from './partes-promocion'
import { TarjetaDecision, idOpcion } from './tarjeta-decision'

const TITULO = 'Promover temporada'
const CLASE_H2 = 'text-[15px] font-[650] text-foreground'

export interface PromocionClientProps {
  /** Campuses the caller may promote, by name. */
  readonly campus: readonly CampusPromocion[]
  readonly campusId: string
  readonly contenido: ContenidoPromocion
  readonly filtrosIniciales?: FiltrosPromocion
}

const CLASE_MIGA = 'focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11'

function Migas(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
        <li className="flex min-w-0 items-center">
          <span className="truncate px-2 py-1.5 text-muted-foreground">Estudiantes</span>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            ›
          </span>
          <Link href="/estudiantes/grupos" className={CLASE_MIGA}>
            Grupos
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground">
            ›
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

/** The footer of the flow: how many decisions are missing, Cancelar and the primary action. */
function PiePromocion({ resultado, onPromover, className }: { readonly resultado: ResultadoPromocion; readonly onPromover: () => void; readonly className?: string }): ReactElement {
  const { estado } = resultado
  return (
    <div role="group" aria-label="Confirmar la promoción" className={cn('grid grid-cols-[1fr_1.6fr] items-center gap-2 border-t border-border md:flex md:flex-wrap md:gap-3', className)}>
      <p id="promocion-estado" role="status" className="col-span-2 min-w-0 text-sm text-muted-foreground md:min-w-[220px] md:flex-1 md:text-[13px]">
        <b className={cn('font-semibold', estado.listo ? 'text-success-text' : 'text-warning-text')}>{estado.destacado}</b> {estado.texto}
      </p>
      <BotonSistema asChild variante="outline" className="w-full md:w-auto">
        <Link href="/estudiantes/grupos">Cancelar</Link>
      </BotonSistema>
      <BotonSistema type="button" icono={ArrowUpCircle} disabled={!resultado.puedeConfirmar} aria-describedby="promocion-estado" onClick={onPromover} className="w-full md:w-auto">
        {TITULO}
      </BotonSistema>
    </div>
  )
}

export function PromocionClient({ campus, campusId, contenido, filtrosIniciales = FILTROS_PROMOCION }: PromocionClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const escritorio = useEsEscritorio()
  const acoplado = useAcoplado()
  const vista: VistaPromocion | null = contenido.tipo === 'vista' ? contenido.vista : null
  const nombreCampus = vista?.campus.nombre ?? campus.find((c) => c.id === campusId)?.nombre ?? ''

  const [decisiones, setDecisiones] = useState<Decisiones>({})
  const [filtros, setFiltros] = useState<FiltrosPromocion>(filtrosIniciales)
  // The row stays selected after the panel closes, so it can animate out.
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
    // Let the panel give focus back before moving it to the option.
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
  const selectorCampus = (conEtiqueta: boolean): ReactNode =>
    campus.length > 1 ? (
      <SelectSistema
        {...(conEtiqueta ? { label: 'Campus' } : { 'aria-label': 'Campus' })}
        opciones={campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        value={campusId}
        onValueChange={(id) => router.push(urlPromocion(id, FILTROS_PROMOCION))}
      />
    ) : null
  const movil = (
    <>
      <div className="-mx-2 -mt-2">
        <BotonAtrasMovil atras={{ etiqueta: 'Grupos', href: '/estudiantes/grupos' }} className="max-w-[75%]" />
      </div>
      <TituloGrande titulo={TITULO} nivel={2} resumen={resumen} />
    </>
  )
  const marco = (children: ReactNode, extra: { readonly barra?: ReactNode; readonly pie?: ReactNode } = {}): ReactElement => (
    <MarcoAlcance
      migas={<Migas />}
      titulo={TITULO}
      tituloRef={tituloRef}
      resumen={resumen}
      acciones={escritorio !== false && campus.length > 1 && <div className="hidden min-w-56 md:block">{selectorCampus(false)}</div>}
      barra={extra.barra}
      panel={acoplado && detalle?.abierto && detalleActual ? 'md' : null}
      movil={
        <>
          {movil}
          {escritorio !== true && campus.length > 1 && <div className="md:hidden">{selectorCampus(true)}</div>}
        </>
      }
      pie={extra.pie}
    >
      {children}
    </MarcoAlcance>
  )

  if (!vista || !resultado) {
    return marco(
      <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:m-6 md:rounded-md md:border md:border-border">
        {contenido.tipo === 'sin_escala' ? (
          <EstadoVacioSistema
            icono={CalendarX}
            titulo="Este campus no tiene escala de años"
            subtitulo="Para promover hace falta la escala de Transit e Inside Out del campus (1er a 6to año). Pide que la configuren."
          />
        ) : (
          <EstadoVacioSistema icono={CalendarX} titulo="No se pudo cargar la promoción" subtitulo={contenido.tipo === 'error' ? contenido.mensaje : undefined} />
        )}
      </div>,
    )
  }

  if (resultado.bloqueado) {
    return marco(
      <div className="md:overflow-y-auto md:px-6 md:py-6">
        <EstadoPromovido estado={resultado.bloqueado} theLivingRoom={vista.theLivingRoom} />
      </div>,
    )
  }

  const hayFiltros = filtros.metrica !== null || filtros.ambito !== null || filtros.q.trim() !== ''
  const ultimoTransit = vista.ambitos[0]?.ultimoEtiqueta ?? '3er año'
  const alternarMetrica = (id: string): void => cambiar({ metrica: filtros.metrica === id ? null : (id as MetricaPromocion) })
  const alternarAmbito = (id: string): void => cambiar({ ambito: filtros.ambito === id ? null : id })
  const abrir = (filaId: string): void => setDetalle({ filaId, abierto: true })
  const promover = (): void => {
    setError(null)
    setConfirmando(true)
  }

  const aviso = (
    <AvisoPromocion tono="warning" titulo="Se aplica una vez al año y no se puede deshacer desde la app.">
      <p>{`${vista.ambitos.map((a) => a.nombre).join(' e ')} de ${vista.campus.nombre} suben juntos. Revisa la lista, decide qué pasa con cada grupo de ${ultimoTransit} y confirma.`}</p>
    </AvisoPromocion>
  )
  const decisionesSeccion = resultado.decisiones.length > 0 && (
    <section id="promocion-s-decisiones" aria-labelledby="promocion-decisiones" className="scroll-mt-4 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="promocion-decisiones" className={CLASE_H2}>
          {`${ultimoTransit} de ${vista.ambitos[0]?.nombre ?? 'Transit'} · decide cada grupo`}
        </h2>
        <span className="text-xs text-muted-foreground">{resultado.pistaDecisiones}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-2.5">
        {resultado.decisiones.map((tarjeta) => (
          <TarjetaDecision key={tarjeta.grupoId} tarjeta={tarjeta} onDecidir={decidir} />
        ))}
      </div>
    </section>
  )
  const vacioGrupos = (
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
  )
  const vacioEgresan = (
    <EstadoVacioSistema
      icono={UsersRound}
      titulo={resultado.totalEgresados ? 'Nadie que egresa coincide' : 'Nadie egresa este año'}
      subtitulo={resultado.totalEgresados ? 'Busca por nombre o grupo.' : 'Ningún estudiante está en su año final.'}
    />
  )
  const seleccionada = detalle?.abierto ? detalle.filaId : null
  const ademas = [vista.totales.sinGrupo ? `${vista.totales.sinGrupo} ${vista.totales.sinGrupo === 1 ? 'estudiante sin grupo sube' : 'estudiantes sin grupo suben'} de año en su ficha.` : null, 'Los visitantes suben con su grupo. Su año final es el año que cursan hoy.']
    .filter(Boolean)
    .join(' ')

  const barra = escritorio !== false && (
    <BarraAlcance etiqueta="Resumen y filtros">
      <SeccionAlcance id="promocion-barra-resumen" titulo="Resumen">
        {resultado.metricas.map((m) => (
          <FilaAlcance
            key={m.id}
            etiqueta={m.etiqueta}
            valor={m.valor}
            valorAviso={m.id === 'decidir' && m.valor > 0}
            detalle={m.id === 'decidir' && m.valor === 0 ? 'Todo decidido' : m.pista}
            pulsado={m.activa}
            onClick={() => alternarMetrica(m.id)}
          />
        ))}
      </SeccionAlcance>
      {resultado.ambitos.length > 1 && (
        <SeccionAlcance id="promocion-barra-ambitos" titulo="Ámbitos" pista="toca para ver solo uno">
          {resultado.ambitos.map((a) => (
            <FilaAlcance
              key={a.id}
              etiqueta={a.label}
              valor={a.total}
              detalle={
                <>
                  {a.subtitulo}
                  {a.insignias.map((i) => (
                    <span key={i.texto} className={i.tono === 'warning' ? 'font-semibold text-warning-text' : undefined}>
                      {` · ${i.texto}`}
                    </span>
                  ))}
                </>
              }
              pulsado={a.activa}
              onClick={() => alternarAmbito(a.id)}
            />
          ))}
        </SeccionAlcance>
      )}
      <SeccionAlcance id="promocion-barra-ademas" titulo="Además">
        <p className="text-[13px] leading-[1.45] text-muted-foreground">{ademas}</p>
      </SeccionAlcance>
    </BarraAlcance>
  )

  const pie = (
    <>
      {escritorio !== false && <PiePromocion resultado={resultado} onPromover={promover} className="hidden shrink-0 bg-card px-6 py-3 md:flex" />}
      {escritorio !== true && (
        <PiePromocion
          resultado={resultado}
          onPromover={promover}
          className="sticky bottom-[calc(max(env(safe-area-inset-bottom),8px)_+_4rem)] z-[4] -mx-4 bg-background px-4 py-3 sm:-mx-6 sm:px-6 md:hidden"
        />
      )}
    </>
  )

  return (
    <>
      {marco(
        <>
          {escritorio !== false && (
            <div className="hidden shrink-0 flex-wrap items-center gap-2.5 px-6 pt-3 pb-2.5 md:flex">
              <BuscadorBarra valor={filtros.q} onCambio={(q) => cambiar({ q })} placeholder="Buscar grupo, líder o estudiante" etiqueta="Buscar grupo, líder o estudiante" />
              <nav aria-label="Secciones" className={LISTA_PESTANAS}>
                {resultado.decisiones.length > 0 && (
                  <a href="#promocion-s-decisiones" className={clasePestana(false)}>
                    {ultimoTransit}
                  </a>
                )}
                <a href="#promocion-s-grupos" className={clasePestana(false)}>
                  Grupo hoy → Queda como
                </a>
                <a href="#promocion-s-egresan" className={clasePestana(false)}>
                  Egresan
                </a>
              </nav>
              <p className="ml-auto text-[13px] text-muted-foreground">{resultado.pie.resumen}</p>
            </div>
          )}

          {escritorio !== true && (
            <div className="space-y-5 md:hidden">
              {aviso}
              <InputSistema
                type="search"
                aria-label="Buscar grupo, líder o estudiante"
                placeholder="Buscar grupo, líder o estudiante"
                value={filtros.q}
                onChange={(e) => cambiar({ q: e.target.value })}
              />
              <MetricasCompactas
                etiqueta="Resumen"
                metricas={resultado.metricas.map((m) => ({ id: m.id, etiqueta: m.etiqueta, valor: m.valor, aviso: m.id === 'decidir', activa: m.activa }))}
                onAlternar={alternarMetrica}
              />
              {resultado.ambitos.length > 1 && (
                <GrupoPastillas etiqueta="Ámbitos">
                  {resultado.ambitos.map((a) => (
                    <PastillaFiltro key={a.id} etiqueta={a.label} cantidad={a.total} activa={a.activa} onClick={() => alternarAmbito(a.id)} />
                  ))}
                </GrupoPastillas>
              )}
            </div>
          )}

          {/* One region scrolls on desktop; on a phone the page does. */}
          <div
            role={escritorio ? 'region' : undefined}
            tabIndex={escritorio ? 0 : undefined}
            aria-label={escritorio ? `Promoción de ${vista.campus.nombre}` : undefined}
            className="focus-ring space-y-5 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-6 md:pb-4"
          >
            {escritorio !== false && <div className="hidden md:block">{aviso}</div>}
            {decisionesSeccion}
            <section id="promocion-s-grupos" aria-labelledby="promocion-grupos" className="scroll-mt-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="promocion-grupos" className={CLASE_H2}>
                  Grupo hoy → Queda como
                </h2>
                <span className="hidden text-xs text-muted-foreground md:inline">Toca un grupo para ver a sus integrantes</span>
              </div>
              {escritorio !== false && (
                <div className="hidden overflow-x-auto rounded-md border border-border bg-card md:block">
                  {resultado.bloques.length > 0 ? <TablaPromocion bloques={resultado.bloques} seleccionada={seleccionada} onAbrir={abrir} /> : vacioGrupos}
                </div>
              )}
              {escritorio !== true && (
                <div className="md:hidden">
                  {resultado.bloques.length > 0 ? <ListaPromocionMovil bloques={resultado.bloques} onAbrir={abrir} /> : <div className="overflow-hidden rounded-2xl bg-card">{vacioGrupos}</div>}
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground md:px-0">
                <span className="md:hidden">{resultado.pie.resumen}</span>
                {resultado.pie.sinGrupo && <span>{resultado.pie.sinGrupo}</span>}
              </div>
            </section>
            <section id="promocion-s-egresan" aria-labelledby="promocion-egresan" className="scroll-mt-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="promocion-egresan" className={CLASE_H2}>
                  Egresan · <span className="font-mono tabular-nums">{resultado.totalEgresados}</span>
                </h2>
                {resultado.egresados.length > 0 && <span className="hidden text-xs text-muted-foreground md:inline">{resultado.egresados[0].pasaADetalle}</span>}
              </div>
              {escritorio !== false && (
                <div className="hidden overflow-x-auto rounded-md border border-border bg-card md:block">
                  {resultado.egresados.length > 0 ? <TablaEgresan egresados={resultado.egresados} /> : vacioEgresan}
                </div>
              )}
              {escritorio !== true && (
                <div className="md:hidden">
                  {resultado.egresados.length > 0 ? (
                    <ListaInset etiqueta="Egresan">
                      {resultado.egresados.map((e) => (
                        <FilaInset key={e.personaId} titulo={e.nombre} subtitulo={`${e.grupo} · año final ${e.anioFinal} → ${e.pasaA}`} />
                      ))}
                    </ListaInset>
                  ) : (
                    <div className="overflow-hidden rounded-2xl bg-card">{vacioEgresan}</div>
                  )}
                </div>
              )}
              <p className="px-1 text-xs text-muted-foreground md:px-0">{resultado.pieEgresados}</p>
            </section>
          </div>
        </>,
        { barra, pie },
      )}

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
    </>
  )
}
