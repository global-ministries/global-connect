'use client'

/**
 * Niños › Etiquetas — /ninos/etiquetas (odd/tasks/ninos-checkin-pco.md, T3b,
 * S10, S6; artboard design/ninos-checkin-pco/03-admin-etiquetas.html, its
 * «Reglas fijas», «Impresoras y estaciones» and «Reimpresiones de hoy» /
 * «Historial» cards; the label templates live in the print agent).
 *
 * Inside the app shell like Eventos and Salones: `PaginaSistema` with
 * breadcrumbs, hero with the summary line, the Eventos · Salones · Etiquetas
 * tabs. Who manages the campus (ninos_puede_configurar on a room of it)
 * creates stations, edits name / size / active and rotates the token in one
 * detail panel per station; the token is shown once. The connection status
 * follows the agent's last call: the page refreshes while visible. Every
 * write is an RPC as the user (lib/platform/ninos/impresion-vista.ts).
 */
import { useRouter } from 'next/navigation'
import { useState, type ReactElement } from 'react'
import { Plus, ShieldCheck } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { EncabezadoEventos, MigasEventos, Num, TarjetaDatos } from '@/components/ninos/eventos/partes'
import { PestanasAdmin } from '@/components/ninos/salones/pestanas-admin'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import {
  actualizarEstacion,
  conexionEstacion,
  crearEstacion,
  rotarTokenEstacion,
  type EstacionVista,
  type Reimpresion,
  type Resultado,
  type TokenEstacion as Token,
} from '@/lib/platform/ninos/impresion-vista'
import { createClient } from '@/lib/supabase/client'

import { useRefrescoVisible } from '../use-refresco'
import { HistorialReimpresiones, ListaReimpresiones } from './lista-reimpresiones'
import { ListaEstaciones } from './lista-estaciones'
import { PanelEstacion, type DatosEstacion } from './panel-estacion'
import { TokenEstacion } from './token-estacion'

export interface EtiquetasClientProps {
  /** Campuses where the caller configures some Niños area. */
  readonly campus: readonly { id: string; nombre: string }[]
  readonly campusId: string | null
  /** The stations of the campus (active and inactive). */
  readonly estaciones: readonly EstacionVista[]
  /** Today's reprints of the campus, newest first. */
  readonly reimpresionesHoy: readonly Reimpresion[]
  /** Today in Caracas (YYYY-MM-DD), the end of the history range. */
  readonly hoy: string
  /** The caller manages the stations of the campus (the RPCs check again). */
  readonly puedeAdministrar: boolean
  readonly errorLectura: string | null
}

type Panel = { tipo: 'nueva' } | { tipo: 'editar'; id: string } | { tipo: 'token'; token: Token }

const REGLAS = [
  'El recibo nunca muestra salón ni teléfono: si se pierde, nadie sabe dónde está el niño ni a quién llamar.',
  'La alergia va en la etiqueta del niño solo como marca, en negro. El detalle está en la app del salón.',
  'Las restricciones de custodia nunca salen en una etiqueta.',
  'El código es el mismo en la etiqueta y el recibo, y no cambia al reimprimir.',
] as const

const palabra = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

export function EtiquetasClient({ campus, campusId, estaciones, reimpresionesHoy, hoy, puedeAdministrar, errorLectura }: EtiquetasClientProps): ReactElement {
  const router = useRouter()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [historial, setHistorial] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())

  useRefrescoVisible(() => {
    router.refresh()
    setAhora(new Date())
  }, 30_000)

  const nombreCampus = campus.find((c) => c.id === campusId)?.nombre ?? ''
  const activas = estaciones.filter((e) => e.activa)
  const sinConexion = activas.filter((e) => conexionEstacion(e.ultimaConexion, ahora).estado !== 'conectada').length
  const editando = panel?.tipo === 'editar' ? (estaciones.find((e) => e.id === panel.id) ?? null) : null
  const rpc = (nombre: string, args: Record<string, unknown>) => (createClient() as unknown as SupabaseClient).rpc(nombre, args)

  const abrir = (p: Panel) => {
    setError(null)
    setPanel(p)
  }

  async function ejecutar<T>(accion: () => Promise<Resultado<T>>, exito: (data: T) => void) {
    setGuardando(true)
    setError(null)
    const r = await accion()
    setGuardando(false)
    if (!r.ok) {
      setError(r.message)
      setAviso(r.message)
      return
    }
    exito(r.data)
    router.refresh()
  }

  const guardar = (d: DatosEstacion) => {
    if (!campusId) return
    if (editando) {
      void ejecutar(
        () => actualizarEstacion(rpc, { estacionId: editando.id, ...d }),
        () => {
          setAviso(`Guardaste ${d.nombre}.`)
          setPanel(null)
        },
      )
    } else {
      void ejecutar(
        () => crearEstacion(rpc, { campusId, ...d }),
        (token) => {
          setAviso(`Creaste ${token.nombre}. Copia su token.`)
          setPanel({ tipo: 'token', token })
        },
      )
    }
  }

  const rotar = () => {
    if (!editando) return
    void ejecutar(
      () => rotarTokenEstacion(rpc, editando.id),
      (token) => {
        setAviso(`Token nuevo para ${token.nombre}. Cópialo.`)
        setPanel({ tipo: 'token', token })
      },
    )
  }

  const resumen = (
    <>
      {nombreCampus && <>{nombreCampus} · </>}
      <Num>{activas.length}</Num> {palabra(activas.length, 'estación activa', 'estaciones activas')}, <Num>{sinConexion}</Num> sin conexión ·{' '}
      <Num>{reimpresionesHoy.length}</Num> {palabra(reimpresionesHoy.length, 'reimpresión hoy', 'reimpresiones hoy')}
    </>
  )

  const agregar = puedeAdministrar && campusId ? () => abrir({ tipo: 'nueva' }) : undefined

  const cuerpo = (): ReactElement => {
    if (!campusId) {
      return <EstadoVacioSistema icono={ShieldCheck} titulo="No hay campus para configurar" subtitulo="Las impresoras se configuran por campus, donde coordinas Niños." />
    }
    if (errorLectura) return <EstadoVacioSistema icono={ShieldCheck} titulo="No se pudieron cargar las impresoras" subtitulo={errorLectura} />
    return (
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="grid min-w-0 gap-4">
          <TarjetaDatos
            id="etiquetas-estaciones"
            titulo="Impresoras y estaciones"
            accion={
              agregar && (
                <BotonSistema type="button" variante="ghost" tamaño="sm" icono={Plus} aria-haspopup="dialog" className="pointer-coarse:min-h-11" onClick={agregar}>
                  Agregar estación
                </BotonSistema>
              )
            }
          >
            <ListaEstaciones
              estaciones={estaciones}
              ahora={ahora}
              onAbrir={puedeAdministrar ? (id) => abrir({ tipo: 'editar', id }) : undefined}
              actualId={editando?.id ?? null}
            />
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Cada mesa elige su impresora en el check-in. Si una no tiene conexión, el código queda en pantalla.
            </p>
          </TarjetaDatos>
          <TarjetaDatos id="etiquetas-reglas" titulo="Reglas fijas">
            <ul className="grid min-w-0 gap-2 p-3 text-[13px] text-foreground">
              {REGLAS.map((r) => (
                <li key={r} className="flex min-w-0 items-start gap-2">
                  <ShieldCheck aria-hidden="true" className="mt-px size-4 shrink-0 text-muted-foreground" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </TarjetaDatos>
        </div>
        <TarjetaDatos
          id="etiquetas-reimpresiones"
          titulo={
            <>
              Reimpresiones de hoy <span className="font-mono tabular-nums">{reimpresionesHoy.length}</span>
            </>
          }
          accion={
            <BotonSistema
              type="button"
              variante="ghost"
              tamaño="sm"
              aria-expanded={historial}
              className="pointer-coarse:min-h-11"
              onClick={() => setHistorial((v) => !v)}
            >
              Historial
            </BotonSistema>
          }
        >
          {reimpresionesHoy.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Hoy no hubo reimpresiones.</p>
          ) : (
            <ListaReimpresiones reimpresiones={reimpresionesHoy} etiqueta="Reimpresiones de hoy" />
          )}
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Cada reimpresión pide motivo y queda registrada con quién y cuándo.</p>
          {historial && <HistorialReimpresiones campusId={campusId} hoy={hoy} />}
        </TarjetaDatos>
      </div>
    )
  }

  const titulo = panel?.tipo === 'nueva' ? 'Nueva estación' : panel?.tipo === 'token' ? 'Token de la estación' : (editando?.nombre ?? 'Estación')

  return (
    <PaginaSistema
      breadcrumbs={<MigasEventos actual="Etiquetas" />}
      acciones={
        agregar ? (
          <BotonSistema type="button" tamaño="sm" icono={Plus} aria-haspopup="dialog" onClick={agregar}>
            Agregar estación
          </BotonSistema>
        ) : undefined
      }
      className="pb-28 md:pb-0"
    >
      <div className="grid min-w-0 gap-4 md:flex md:items-end md:justify-between">
        <EncabezadoEventos titulo="Etiquetas e impresoras" testId="resumen-etiquetas" resumen={resumen} />
        {campus.length > 1 && (
          <div className="md:w-[min(100%,280px)]">
            <SelectSistema
              label="Campus"
              opciones={campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
              value={campusId ?? ''}
              onValueChange={(id) => router.push(`/ninos/etiquetas?campus=${encodeURIComponent(id)}`)}
            />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <PestanasAdmin actual="etiquetas" campusId={campusId} />
        <span className="text-[13px] text-muted-foreground">Por cada niño, su etiqueta; por familia, un recibo con el mismo código.</span>
      </div>

      {cuerpo()}

      <p className="sr-only" role="status" aria-live="polite">
        {aviso}
      </p>

      <DetalleResponsivo
        abierto={panel !== null}
        onCambioAbierto={(a) => !a && setPanel(null)}
        titulo={titulo}
        descripcion={panel?.tipo === 'nueva' ? 'Una por cada laptop de la mesa con la impresora conectada.' : undefined}
      >
        {panel?.tipo === 'token' && <TokenEstacion token={panel.token} onListo={() => setPanel(null)} />}
        {(panel?.tipo === 'nueva' || editando) && (
          <PanelEstacion
            key={editando?.id ?? 'nueva'}
            estacion={editando}
            guardando={guardando}
            error={error}
            onGuardar={guardar}
            onRotarToken={editando ? rotar : undefined}
            onInvalido={setAviso}
          />
        )}
      </DetalleResponsivo>

      {agregar && <BotonFlotante onClick={agregar} icono={Plus} label="Agregar estación" />}
    </PaginaSistema>
  )
}
