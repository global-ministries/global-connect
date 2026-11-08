'use client'

/**
 * Niños › Salones — /ninos/salones (odd/tasks/ninos-checkin-pco.md, T1d, S5,
 * S8.3, S8.4; artboard design/ninos-checkin-pco/02-admin-salones.html). The
 * rules of the salones of a campus, the same for every event (S8.4): «Probar
 * reglas» on top, then one carpeta per area (Waumba Land, UpStreet) with its
 * distribution and its salones in fill order; a salón opens its panel, where
 * every field saves on its own (lib/actions/ninos-salones.actions.ts).
 *
 * Gating per salón: who configures its area's equipo (ninos_puede_configurar)
 * edits it; everyone else on the screen reads it (an area coordinator edits
 * only their area). Inside the app shell, like Eventos: `PaginaSistema` with
 * breadcrumbs, hero, the Eventos · Salones tabs and the autosave status.
 * URL: ?campus (router.push, new data) and ?salon (history.replaceState).
 */
import { useRouter } from 'next/navigation'
import { useState, type ReactElement } from 'react'
import { DoorClosed, Plus } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { EncabezadoEventos, EstadoGuardadoVista, MigasEventos, Num } from '@/components/ninos/eventos/partes'
import { useGuardado } from '@/components/ninos/eventos/use-guardado'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { crearSalon, guardarCarpeta, guardarDatosSalon, guardarReglasSalon } from '@/lib/actions/ninos-salones.actions'
import {
  AREAS,
  NOMBRE_AREA,
  carpetaDe,
  resumenSalones,
  type CarpetaAdmin,
  type DatosSalon,
  type ReglasSalon,
  type SalonAdmin,
} from '@/lib/platform/ninos/salones-reglas'

import { CarpetaSalones } from './carpeta-salones'
import { NuevoSalon } from './nuevo-salon'
import { PanelSalon } from './panel-salon'
import { PestanasAdmin } from './pestanas-admin'
import { ProbarReglas } from './probar-reglas'

export interface SalonesClientProps {
  /** Campuses where the caller configures some Niños area (ninos_puede_configurar_algun_area_campus). */
  readonly campus: readonly { id: string; nombre: string }[]
  readonly campusId: string | null
  /** The active salones of the campus, by orden. */
  readonly salones: readonly SalonAdmin[]
  readonly carpetas: readonly CarpetaAdmin[]
  /** Equipos where the caller passes ninos_puede_configurar. */
  readonly equiposEditables: readonly string[]
  /** Children inside each salón today. */
  readonly ocupadosHoy: Readonly<Record<string, number>>
  /** The default service date for «Probar reglas». */
  readonly fechaServicio: string
  /** Why the salones could not be read. */
  readonly errorLectura: string | null
  readonly salonInicial?: string
}

export function SalonesClient({
  campus,
  campusId,
  salones,
  carpetas,
  equiposEditables,
  ocupadosHoy,
  fechaServicio,
  errorLectura,
  salonInicial,
}: SalonesClientProps): ReactElement {
  const router = useRouter()
  const guardado = useGuardado()
  const [abiertoId, setAbiertoId] = useState<string | null>(salonInicial ?? null)
  const [nuevo, setNuevo] = useState(false)

  const nombreCampus = campus.find((c) => c.id === campusId)?.nombre ?? ''
  const editables = new Set(equiposEditables)
  const puedeEditar = (s: SalonAdmin) => editables.has(s.equipoId)
  const areas = AREAS.filter((a) => salones.some((s) => s.area === a))
  const areasEditables = areas.filter((a) => salones.some((s) => s.area === a && puedeEditar(s)))
  const abierto = salones.find((s) => s.id === abiertoId) ?? null
  const ocupado = guardado.estado === 'guardando'
  const resumen = resumenSalones(salones)

  const url = (salonId: string | null) => {
    const q = new URLSearchParams()
    if (campusId) q.set('campus', campusId)
    if (salonId) q.set('salon', salonId)
    window.history.replaceState(null, '', `/ninos/salones${q.size ? `?${q.toString()}` : ''}`)
  }

  const abrir = (id: string) => {
    setAbiertoId(id)
    url(id)
    const s = salones.find((x) => x.id === id)
    if (s) guardado.anunciar(`Editando ${s.nombre}.`)
  }

  const cerrar = () => {
    setAbiertoId(null)
    url(null)
  }

  const datos = async (s: SalonAdmin, d: DatosSalon, aviso: string) =>
    (await guardado.guardar(() => guardarDatosSalon({ salonId: s.id, datos: d }), () => aviso)).ok

  const reglas = async (s: SalonAdmin, r: ReglasSalon, aviso: string) =>
    (await guardado.guardar(() => guardarReglasSalon({ salonId: s.id, reglas: r }), () => aviso)).ok

  const carpeta = (c: CarpetaAdmin) => {
    if (!campusId) return
    const nombre = NOMBRE_AREA[c.area]
    void guardado.guardar(
      () => guardarCarpeta({ campusId, ...c }),
      () =>
        `${nombre}: ${c.distribucion === 'en_orden' ? 'en orden, llena hasta el cupo' : 'equilibrada, al salón de menos niños'}; ${
          c.mantenerRegulares ? 'mantiene a los regulares en su salón' : 'no mantiene a los regulares'
        }.`,
    )
  }

  const textoResumen = (
    <>
      {nombreCampus && <>{nombreCampus} · </>}
      <Num>{resumen.salones}</Num> {resumen.salones === 1 ? 'salón' : 'salones'} en <Num>{resumen.carpetas}</Num>{' '}
      {resumen.carpetas === 1 ? 'carpeta' : 'carpetas'} · cupo <Num>{resumen.regulares}</Num> regulares + <Num>{resumen.visitantes}</Num> visitantes
      {resumen.cerrados > 0 && (
        <>
          {' '}
          · <Num>{resumen.cerrados}</Num> {resumen.cerrados === 1 ? 'cerrado' : 'cerrados'}
        </>
      )}
    </>
  )

  const cuerpo = (): ReactElement => {
    if (campus.length === 0 || (!errorLectura && salones.length === 0)) {
      return (
        <EstadoVacioSistema
          icono={DoorClosed}
          titulo="No hay salones de Niños"
          subtitulo="Los salones se configuran por campus; este campus todavía no tiene salones activos."
        />
      )
    }
    if (errorLectura) {
      return <EstadoVacioSistema icono={DoorClosed} titulo="No se pudieron cargar los salones" subtitulo={errorLectura} />
    }
    return (
      <div className="grid min-w-0 gap-4">
        <ProbarReglas salones={salones} carpetas={carpetas} fechaServicio={fechaServicio} ocupadosHoy={ocupadosHoy} onVerSalon={abrir} />
        {areas.map((a) => (
          <CarpetaSalones
            key={a}
            carpeta={carpetaDe(carpetas, a)}
            salones={salones.filter((s) => s.area === a)}
            editable={areasEditables.includes(a)}
            actualId={abierto?.id ?? null}
            ocupado={ocupado}
            onAbrir={abrir}
            onCarpeta={carpeta}
          />
        ))}
      </div>
    )
  }

  return (
    <PaginaSistema
      breadcrumbs={<MigasEventos actual="Salones" />}
      acciones={
        areasEditables.length ? (
          <BotonSistema type="button" tamaño="sm" icono={Plus} aria-haspopup="dialog" onClick={() => setNuevo(true)}>
            Nuevo salón
          </BotonSistema>
        ) : undefined
      }
      className="pb-28 md:pb-0"
    >
      <div className="grid min-w-0 gap-4 md:flex md:items-end md:justify-between">
        <EncabezadoEventos titulo="Salones de check-in" testId="resumen-salones" resumen={textoResumen} />
        {campus.length > 1 && (
          <div className="md:w-[min(100%,280px)]">
            <SelectSistema
              label="Campus"
              opciones={campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
              value={campusId ?? ''}
              onValueChange={(id) => router.push(`/ninos/salones?campus=${encodeURIComponent(id)}`)}
            />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <PestanasAdmin actual="salones" campusId={campusId} />
        <span className="text-[13px] text-muted-foreground">Las reglas valen para todos los eventos.</span>
        <span className="ml-auto">
          <EstadoGuardadoVista estado={guardado.estado} error={guardado.error} />
        </span>
      </div>

      {salones.length > 0 && !errorLectura && areasEditables.length < areas.length && (
        <AvisoFormulario tono="info">
          {areasEditables.length
            ? `Puedes cambiar los salones de ${areasEditables.map((a) => NOMBRE_AREA[a]).join(' y ')}; los demás son de solo lectura.`
            : 'Puedes ver los salones de este campus. Solo quien coordina un área puede cambiar sus salones.'}
        </AvisoFormulario>
      )}

      {cuerpo()}

      <p className="sr-only" role="status" aria-live="polite">
        {guardado.aviso}
      </p>

      <DetalleResponsivo
        abierto={abierto !== null}
        onCambioAbierto={(a) => !a && cerrar()}
        titulo={abierto?.nombre ?? 'Salón'}
        descripcion={abierto ? `${puedeEditar(abierto) ? 'Editar salón' : 'Salón'} · ${NOMBRE_AREA[abierto.area]}` : undefined}
        pie={
          <span className="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {abierto && puedeEditar(abierto) ? 'Los cambios se guardan solos' : 'Solo lectura'}
            <EstadoGuardadoVista estado={guardado.estado} error={guardado.error} />
          </span>
        }
      >
        {abierto && (
          <PanelSalon
            key={abierto.id}
            salon={abierto}
            editable={puedeEditar(abierto)}
            ocupado={ocupado}
            onInvalido={guardado.anunciar}
            onDatos={(d, aviso) => datos(abierto, d, aviso)}
            onReglas={(r, aviso) => reglas(abierto, r, aviso)}
          />
        )}
      </DetalleResponsivo>

      {areasEditables.length > 0 && campusId && (
        <>
          <BotonFlotante onClick={() => setNuevo(true)} icono={Plus} label="Nuevo salón" />
          <NuevoSalon
            abierto={nuevo}
            areas={areasEditables}
            onCerrar={() => setNuevo(false)}
            onCrear={async ({ area, nombre }) => {
              const r = await guardado.guardar(
                () => crearSalon({ campusId, area, nombre }),
                () => `Creaste ${nombre.trim()}. Ahora ponle edades y cupo.`,
              )
              if (r.ok) setAbiertoId(r.data.id)
              return r
            }}
          />
        </>
      )}
    </PaginaSistema>
  )
}
