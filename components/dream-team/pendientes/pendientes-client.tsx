'use client'

/**
 * Dream Team — client island for /dream-team/pendientes
 * (odd/tasks/dream-team-pendientes-director.md, T4, S1, S2, S4, S6, S7;
 * artboards design/pendientes-director/01 desktop and 02 phone).
 *
 * Top to bottom: breadcrumbs "Dream Team / Pendientes", the hero (people,
 * urgentes, people with something pending), "Cómo está tu equipo" (the "% en
 * orden" and the four attention metrics, which filter: `?grupo=`), the
 * "Urgente" section (puestos sin servidores, cambio-de-área requests,
 * invitaciones vencidas) and "Para mantener todo en orden" (fichas
 * incompletas with a pill per gap, por activar, sin cuenta, sin turno).
 *
 * Each row opens the existing action, never a copy: AsignadorServicioDialog,
 * EditarFichaPanel (with "1 de N" and "Guardar y siguiente" over the pill's
 * list), InvitarCuentaPanel, AvanceEtapaControl, TurnosServicioDialog and
 * SolicitudesCambioArea. Who may act follows Mi equipo's role
 * (permisosMiEquipo) narrowed by what the database answered per row
 * (ficha_editable, invitable); the server checks each action again. After any
 * of them the page refreshes, and the menu badge takes the new count.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ListChecks } from 'lucide-react'

import { BotonSistema, PaginaSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { useFijarUrgentesPendientes } from '@/hooks/useDreamTeamAcceso'
import { AsignadorServicioDialog, type NodoPlano } from '@/components/dream-team/asignador-servicio-dialog'
import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { EditarFichaPanel } from '@/components/dream-team/servidores/editar-ficha-panel'
import { InvitarCuentaPanel } from '@/components/cuentas/invitar-cuenta-panel'
import { SolicitudesCambioArea } from '@/components/dream-team/solicitudes-cambio-area'
import { TurnosServicioDialog } from '@/components/dream-team/turnos/turnos-servicio-dialog'
import { formatearFecha } from '@/components/dream-team/detalle-persona'
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { permisosMiEquipo, type RolMiEquipo } from '@/lib/platform/dream-team/acciones-servicio'
import type { SolicitudCambioArea } from '@/lib/platform/dream-team/cambiar-area'
import type { FilaPendiente, ResumenPendientes } from '@/lib/platform/dream-team/pendientes'
import {
  TITULO_PENDIENTE,
  fichasDeTipo,
  subtituloEquipo,
  tipoVisible,
  type GrupoPendientes as GrupoFiltro,
  type TipoFicha,
} from '@/lib/platform/dream-team/pendientes-vista'
import type { DreamTeamEstado, DreamTeamRol } from '@/lib/platform/dream-team/types'

import { BarraEnOrden, RUTA_PENDIENTES } from './franja-pendientes'
import { GrupoPendientes, type FilaGrupo } from './grupo-pendientes'

export interface PendientesClientProps {
  /** dream_team_pendientes_resumen(); `null` when the read failed. */
  readonly resumen: ResumenPendientes | null
  /** dream_team_pendientes(), every tipo. */
  readonly filas: readonly FilaPendiente[]
  /** The pending cambio-de-área requests the viewer resolves. */
  readonly solicitudes: readonly SolicitudCambioArea[]
  readonly rol: RolMiEquipo
  /** The áreas sin servidores, for the assigner. */
  readonly equiposAsignables: readonly NodoPlano[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  /** The metric filter of the URL. */
  readonly grupoInicial: GrupoFiltro | null
}

const TIPOS_FICHA: readonly TipoFicha[] = ['sin_cedula', 'fecha_nacimiento', 'sin_telefono', 'genero_estado_civil']

type Accion =
  | { readonly tipo: 'asignar'; readonly equipoId: string }
  | { readonly tipo: 'invitar'; readonly personaId: string; readonly nombre: string }
  | { readonly tipo: 'etapa'; readonly servicioId: string; readonly estado: DreamTeamEstado; readonly version: number }
  | { readonly tipo: 'turnos'; readonly servicioId: string; readonly nombre: string }
  | null

interface SerieAbierta {
  readonly lista: readonly { readonly personaId: string; readonly nombre: string }[]
  readonly indice: number
  readonly origen: string
  readonly abierta: boolean
}

const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)
const nombreDe = (fila: FilaPendiente): string => fila.personaNombre ?? 'Persona sin nombre'

function Migas(): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className="flex min-w-0 items-center gap-0.5">
          <span className="truncate px-2 py-1.5 text-muted-foreground">Dream Team</span>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground/60">
            /
          </span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
            Pendientes
          </span>
        </li>
      </ol>
    </nav>
  )
}

function Resumen({ resumen }: { readonly resumen: ResumenPendientes }): ReactElement {
  const conPendientes = resumen.personasTotal - resumen.personasEnOrden
  return (
    <>
      <strong className="font-mono tabular-nums">{resumen.personasTotal}</strong>{' '}
      {plural(resumen.personasTotal, 'persona', 'personas')} · <strong className="font-mono tabular-nums">{resumen.urgentes}</strong>{' '}
      {plural(resumen.urgentes, 'urgente', 'urgentes')} · <strong className="font-mono tabular-nums">{conPendientes}</strong> con algo
      pendiente
    </>
  )
}

function Seccion({
  id,
  titulo,
  pista,
  children,
  className,
}: {
  readonly id: string
  readonly titulo: string
  readonly pista: string
  readonly children: ReactElement | ReactElement[]
  readonly className?: string
}): ReactElement {
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {titulo}
        </h2>
        <span className="text-[13px] text-muted-foreground">{pista}</span>
      </div>
      <div className={className}>{children}</div>
    </section>
  )
}

export function PendientesClient({
  resumen,
  filas,
  solicitudes,
  rol,
  equiposAsignables,
  rolesPorEquipo,
  grupoInicial,
}: PendientesClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? RUTA_PENDIENTES
  const toast = useNotificaciones()
  useFijarUrgentesPendientes(resumen?.urgentes ?? null)

  const [grupo, setGrupo] = useState<GrupoFiltro | null>(grupoInicial)
  const [accion, setAccion] = useState<Accion>(null)
  const [serie, setSerie] = useState<SerieAbierta | null>(null)
  const permisos = permisosMiEquipo(rol)

  const fichasPorTipo = useMemo(
    () => new Map(TIPOS_FICHA.map((tipo) => [tipo, fichasDeTipo(filas, tipo)] as const)),
    [filas],
  )
  const tiposConFichas = TIPOS_FICHA.filter((tipo) => (fichasPorTipo.get(tipo)?.length ?? 0) > 0)
  const [tipoElegido, setTipoFicha] = useState<TipoFicha | null>(null)
  const tipoFicha: TipoFicha | undefined = tipoElegido && tiposConFichas.includes(tipoElegido) ? tipoElegido : tiposConFichas[0]

  if (!resumen) {
    return (
      <PaginaSistema breadcrumbs={<Migas />}>
        <EstadoVacioSistema
          icono={ListChecks}
          titulo="No se pudieron cargar los pendientes"
          subtitulo="Recarga la página para intentarlo de nuevo."
        />
      </PaginaSistema>
    )
  }

  function filtrar(id: string): void {
    const siguiente = grupo === id ? null : (id as GrupoFiltro)
    setGrupo(siguiente)
    router.replace(siguiente ? `${pathname}?grupo=${siguiente}` : pathname, { scroll: false })
  }

  function hecho(): void {
    setAccion(null)
    router.refresh()
  }
  const cerrarAccion = (abierta: boolean): void => {
    if (!abierta) setAccion(null)
  }

  const de = (tipo: FilaPendiente['tipo']) => (tipoVisible(tipo, grupo) ? filas.filter((fila) => fila.tipo === tipo) : [])
  const completo = grupo !== null

  // ─── Rows, each with its direct action ───
  const invitar = (fila: FilaPendiente, reenviar: boolean) =>
    permisos.invitar && fila.invitable === true && fila.personaId
      ? {
          texto: reenviar ? 'Reenviar' : 'Invitar',
          etiqueta: reenviar ? `Reenviar invitación a ${nombreDe(fila)}` : `Invitar a ${nombreDe(fila)}`,
          onClick: () => setAccion({ tipo: 'invitar', personaId: fila.personaId as string, nombre: nombreDe(fila) }),
        }
      : undefined

  const areas: FilaGrupo[] = de('area_sin_servidores').map((fila) => {
    const nombre = fila.equipoRuta.at(-1) ?? 'Área'
    const porActivar = fila.tipo === 'area_sin_servidores' ? fila.porActivar : 0
    return {
      clave: fila.equipoId,
      titulo: nombre,
      subtitulo: [fila.equipoRuta.at(-2), porActivar > 0 ? `${porActivar} por activar` : 'Sin servidores activos']
        .filter(Boolean)
        .join(' · '),
      accion: permisos.registrar
        ? {
            texto: 'Asignar',
            etiqueta: `Asignar servicio en ${nombre}`,
            primaria: true,
            onClick: () => setAccion({ tipo: 'asignar', equipoId: fila.equipoId }),
          }
        : undefined,
    }
  })

  const vencidas: FilaGrupo[] = de('invitacion_vencida').map((fila) => ({
    clave: `${fila.personaId}`,
    titulo: nombreDe(fila),
    subtitulo: [subtituloEquipo(fila.equipoRuta), fila.desde ? `enviada el ${formatearFecha(fila.desde)}` : null]
      .filter(Boolean)
      .join(' · '),
    accion: invitar(fila, true),
  }))

  const sinCuenta: FilaGrupo[] = de('sin_cuenta').map((fila) => {
    const invitacion = fila.tipo === 'sin_cuenta' ? fila.invitacion : null
    return {
      clave: `${fila.personaId}`,
      titulo: nombreDe(fila),
      subtitulo: subtituloEquipo(fila.equipoRuta),
      detalle:
        [
          fila.tieneCorreo === false ? 'Sin correo' : null,
          invitacion === 'enviada' ? 'Invitación enviada' : invitacion === 'vencida' ? 'Invitación vencida' : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      accion: invitar(fila, invitacion === 'enviada' || invitacion === 'vencida'),
    }
  })

  const porActivar: FilaGrupo[] = de('por_activar').map((fila) => ({
    clave: `${fila.servicioId}`,
    titulo: nombreDe(fila),
    subtitulo: [subtituloEquipo(fila.equipoRuta), fila.desde ? `desde el ${formatearFecha(fila.desde)}` : null]
      .filter(Boolean)
      .join(' · '),
    detalle: fila.servicioEstado ? ESTADO_LABELS[fila.servicioEstado] : undefined,
    accion:
      permisos.cambiarEtapa && fila.servicioId && fila.servicioEstado && fila.servicioVersion !== null
        ? {
            texto: 'Cambiar etapa',
            etiqueta: `Cambiar etapa de ${nombreDe(fila)}`,
            onClick: () =>
              setAccion({
                tipo: 'etapa',
                servicioId: fila.servicioId as string,
                estado: fila.servicioEstado as DreamTeamEstado,
                version: fila.servicioVersion as number,
              }),
          }
        : undefined,
  }))

  const sinTurno: FilaGrupo[] = de('sin_turno').map((fila) => ({
    clave: `${fila.servicioId}`,
    titulo: nombreDe(fila),
    subtitulo: subtituloEquipo(fila.equipoRuta),
    accion:
      permisos.turnos && fila.servicioId
        ? {
            texto: 'Turnos',
            etiqueta: `Turnos de ${nombreDe(fila)}`,
            onClick: () => setAccion({ tipo: 'turnos', servicioId: fila.servicioId as string, nombre: nombreDe(fila) }),
          }
        : undefined,
  }))

  // ─── Fichas: one list per gap, fixed one after another ───
  const fichas = tipoFicha && tipoVisible(tipoFicha, grupo) ? (fichasPorTipo.get(tipoFicha) ?? []) : []
  const serieDeFichas = fichas.filter((persona) => persona.editable && permisos.editarFicha)
  function abrirSerie(personaId?: string): void {
    if (!tipoFicha || serieDeFichas.length === 0) return
    const indice = personaId ? Math.max(0, serieDeFichas.findIndex((persona) => persona.personaId === personaId)) : 0
    setSerie({
      lista: serieDeFichas.map(({ personaId: id, nombre }) => ({ personaId: id, nombre })),
      indice,
      origen: TITULO_PENDIENTE[tipoFicha],
      abierta: true,
    })
  }
  const filasFichas: FilaGrupo[] = fichas.map((persona) => ({
    clave: persona.personaId,
    titulo: persona.nombre,
    subtitulo: subtituloEquipo(persona.equipoRuta),
    detalle: persona.faltas.join(' · '),
    accion:
      persona.editable && permisos.editarFicha
        ? { texto: 'Editar ficha', etiqueta: `Editar ficha de ${persona.nombre}`, onClick: () => abrirSerie(persona.personaId) }
        : undefined,
  }))
  const personaSerie = serie ? serie.lista[serie.indice] : undefined

  const verSolicitudes = solicitudes.length > 0 && tipoVisible('solicitud_cambio_area', grupo)
  const hayUrgente = areas.length > 0 || verSolicitudes || vencidas.length > 0
  const hayOrden = filasFichas.length > 0 || porActivar.length > 0 || sinCuenta.length > 0 || sinTurno.length > 0
  const nadaPendiente = filas.length === 0 && solicitudes.length === 0
  const total = resumen.personasTotal

  const resumenTexto = <Resumen resumen={resumen} />

  return (
    // No `titulo`: the h1 is the hero on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema breadcrumbs={<Migas />}>
      <div className="md:hidden">
        <TituloGrande titulo="Pendientes" nivel={2} resumen={resumenTexto} />
      </div>
      <div className="hidden min-w-0 md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Pendientes</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{resumenTexto}</p>
      </div>

      <section aria-label="Cómo está tu equipo" className="grid min-w-0 gap-2.5 md:gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
        <TarjetaSistema className="grid content-start gap-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">En orden</p>
          {resumen.porcentaje !== null ? (
            <>
              <p className="text-sm text-muted-foreground">
                <strong className="mr-1.5 font-mono text-3xl font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                  {resumen.porcentaje}%
                </strong>
                de tu equipo está en orden
              </p>
              <BarraEnOrden porcentaje={resumen.porcentaje} />
              <p className="text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{resumen.personasEnOrden}</span> de{' '}
                <span className="font-mono tabular-nums">{total}</span> personas sin ningún pendiente. Sube con cada uno que
                resuelves.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no hay personas en tu equipo.</p>
          )}
        </TarjetaSistema>
        {!nadaPendiente && (
          <MetricasAtencion
            etiqueta="Filtrar por grupo"
            onAlternar={filtrar}
            metricas={[
              {
                id: 'puestos',
                etiqueta: 'Puestos sin servidores',
                valor: resumen.areasSinServidores,
                total: resumen.areasTotal,
                pista: `${resumen.areasTotal - resumen.areasSinServidores} de ${resumen.areasTotal} puestos cubiertos`,
                tono: 'danger',
                activa: grupo === 'puestos',
              },
              {
                id: 'fichas',
                etiqueta: 'Fichas incompletas',
                valor: resumen.fichasIncompletas,
                total,
                pista: `${total - resumen.fichasIncompletas} de ${total} fichas completas`,
                tono: 'warning',
                activa: grupo === 'fichas',
              },
              {
                id: 'cuenta',
                etiqueta: 'Sin cuenta',
                valor: resumen.sinCuenta,
                total,
                pista: `${total - resumen.sinCuenta} de ${total} tienen cuenta`,
                tono: 'warning',
                activa: grupo === 'cuenta',
              },
              {
                id: 'turno',
                etiqueta: 'Sin turno',
                valor: resumen.sinTurno,
                total,
                pista: `${total - resumen.sinTurno} de ${total} tienen turno`,
                tono: 'danger',
                activa: grupo === 'turno',
              },
            ]}
          />
        )}
      </section>

      {nadaPendiente ? (
        <EstadoVacioSistema icono={ListChecks} titulo="Todo en orden" subtitulo="Cuando falte algo en tu equipo, lo verás aquí." />
      ) : !hayUrgente && !hayOrden ? (
        <EstadoVacioSistema
          icono={ListChecks}
          titulo="Nada pendiente en este grupo"
          subtitulo="Quita el filtro para ver todo lo demás."
          accion={
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => grupo && filtrar(grupo)}>
              Quitar filtro
            </BotonSistema>
          }
        />
      ) : null}

      {hayUrgente && (
        <Seccion id="pendientes-urgente" titulo="Urgente" pista="Afecta el próximo culto o ya venció" className="grid min-w-0 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {[
            areas.length > 0 ? (
              <GrupoPendientes
                key="areas"
                titulo={TITULO_PENDIENTE.area_sin_servidores}
                cantidad={areas.length}
                tono="danger"
                descripcion="Nadie sirve aquí. Asigna a alguien de tu equipo o registra a alguien nuevo."
                filas={areas}
                completo={completo}
              />
            ) : null,
            verSolicitudes ? (
              <SolicitudesCambioArea key="solicitudes" solicitudes={solicitudes} onResuelta={() => router.refresh()} toast={toast} />
            ) : null,
            vencidas.length > 0 ? (
              <GrupoPendientes
                key="vencidas"
                titulo={TITULO_PENDIENTE.invitacion_vencida}
                cantidad={vencidas.length}
                tono="warning"
                descripcion="Pasó el plazo sin que crearan su cuenta. Reenvía la invitación."
                filas={vencidas}
                completo={completo}
              />
            ) : null,
          ].filter((elemento): elemento is ReactElement => elemento !== null)}
        </Seccion>
      )}

      {hayOrden && (
        <Seccion
          id="pendientes-orden"
          titulo="Para mantener todo en orden"
          pista="Cada grupo trae su acción directa"
          className="grid min-w-0 items-start gap-3 lg:grid-cols-2"
        >
          {[
            filasFichas.length > 0 && tipoFicha ? (
              <GrupoPendientes
                key="fichas"
                titulo="Fichas incompletas"
                cantidad={resumen.fichasIncompletas}
                tono="warning"
                descripcion="Lo elemental para que la ficha sirva: cédula, fecha de nacimiento, teléfono, género y estado civil."
                filas={filasFichas}
                completo={completo}
                accion={
                  serieDeFichas.length > 0 ? (
                    <BotonSistema type="button" tamaño="sm" onClick={() => abrirSerie()}>
                      Completar una por una
                    </BotonSistema>
                  ) : null
                }
              >
                <GrupoPastillas etiqueta="Qué falta">
                  {tiposConFichas.map((tipo) => (
                    <PastillaFiltro
                      key={tipo}
                      etiqueta={TITULO_PENDIENTE[tipo]}
                      cantidad={fichasPorTipo.get(tipo)?.length ?? 0}
                      activa={tipo === tipoFicha}
                      onClick={() => setTipoFicha(tipo)}
                    />
                  ))}
                </GrupoPastillas>
              </GrupoPendientes>
            ) : null,
            porActivar.length > 0 ? (
              <GrupoPendientes
                key="por-activar"
                titulo={TITULO_PENDIENTE.por_activar}
                cantidad={porActivar.length}
                tono="info"
                descripcion="Postulados o en orientación. Cuando estén listos, pásalos a Activo."
                filas={porActivar}
                completo={completo}
              />
            ) : null,
            sinCuenta.length > 0 ? (
              <GrupoPendientes
                key="sin-cuenta"
                titulo={TITULO_PENDIENTE.sin_cuenta}
                cantidad={sinCuenta.length}
                tono="warning"
                descripcion="No ven sus turnos ni reciben recordatorios. Invítalos a crear su cuenta."
                filas={sinCuenta}
                completo={completo}
              />
            ) : null,
            sinTurno.length > 0 ? (
              <GrupoPendientes
                key="sin-turno"
                titulo={TITULO_PENDIENTE.sin_turno}
                cantidad={sinTurno.length}
                tono="danger"
                descripcion="Sirven en tu equipo pero no tienen culto asignado."
                filas={sinTurno}
                completo={completo}
              />
            ) : null,
          ].filter((elemento): elemento is ReactElement => elemento !== null)}
        </Seccion>
      )}

      {/* The existing actions; each one refreshes the page when it is done. */}
      {permisos.registrar && (
        <AsignadorServicioDialog
          abierto={accion?.tipo === 'asignar'}
          onClose={() => setAccion(null)}
          nodosPlanos={equiposAsignables}
          rolesPorEquipo={rolesPorEquipo}
          equipoIdInicial={accion?.tipo === 'asignar' ? accion.equipoId : undefined}
          onAsignado={hecho}
          toast={toast}
          soloRegistrar={rol !== 'director'}
        />
      )}

      {accion?.tipo === 'invitar' && (
        <InvitarCuentaPanel
          key={accion.personaId}
          personaId={accion.personaId}
          nombre={accion.nombre}
          abierto
          onAbiertoChange={cerrarAccion}
          onInvitada={hecho}
        />
      )}

      {accion?.tipo === 'etapa' && (
        <AvanceEtapaControl
          servicioId={accion.servicioId}
          estadoActual={accion.estado}
          version={accion.version}
          puedeEditar
          abierto
          onAbiertoChange={cerrarAccion}
          ocultarBoton
          onSuccess={hecho}
        />
      )}

      {accion?.tipo === 'turnos' && (
        <TurnosServicioDialog
          servicioId={accion.servicioId}
          nombre={accion.nombre}
          abierto
          onAbiertoChange={cerrarAccion}
          onGuardado={hecho}
        />
      )}

      {serie && personaSerie && (
        <EditarFichaPanel
          personaId={personaSerie.personaId}
          nombre={personaSerie.nombre}
          abierto={serie.abierta}
          onAbiertoChange={(abierta) => setSerie((actual) => (actual ? { ...actual, abierta } : null))}
          onGuardado={() => router.refresh()}
          toast={toast}
          serie={{
            origen: serie.origen,
            posicion: serie.indice + 1,
            total: serie.lista.length,
            onSiguiente:
              serie.indice + 1 < serie.lista.length
                ? () => setSerie((actual) => (actual ? { ...actual, indice: actual.indice + 1 } : null))
                : undefined,
          }}
        />
      )}
    </PaginaSistema>
  )
}
