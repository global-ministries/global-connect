'use client'

/**
 * Estudiantes › Grupos — "Crear grupo" / "Editar grupo" (artboard 08): a
 * `DetalleResponsivo` with a form (bottom sheet on phones, 480px panel from
 * md); the footer submits it.
 *
 * - Dónde: ámbito, sub-área (and campus when the sub-área is managed in more
 *   than one) from estudiantes_subareas_gestionables; read only when there is
 *   one choice or when editing (a group never changes sub-área or campus).
 * - Quiénes van: Transit / Inside Out pick the año from the campus scale
 *   (estudiantes_escala_campus, Q2); The Living Room takes a zona and the
 *   weekly day and hour (Q7), no año.
 * - Nombre: suggested from the año or zona and the sub-área ("… B" when
 *   taken) until the user types their own; checked before saving.
 * - Líderes (create only; the drawer changes them afterwards): the G9 list.
 *
 * After "Crear grupo" the new group's drawer opens, ready for "Agregar
 * integrante". The "Edades" of the artboard are not stored yet (no column in
 * estudiantes_grupos), so the form leaves them out.
 */
import { useId, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'

import { BotonSistema, InputSistema, SelectSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { crearGrupo, editarGrupo, type DatosGrupo } from '@/lib/actions/estudiantes-grupos.actions'
import { opcionesDonde, pistaEscala } from '@/lib/platform/estudiantes/gestion-grupo'
import type { GradoEscala, GrupoGestion, SubareaGestionable } from '@/lib/platform/estudiantes/grupos-datos'
import { DIAS_SEMANA } from '@/lib/platform/estudiantes/grupos-vista'
import { baseNombreGrupo, pistaNombre, sugerirNombreGrupo, validarNombreGrupo } from '@/lib/platform/estudiantes/nombre-grupo'

import { TituloSeccion } from '../filas-inset'
import { SelectorLideres } from './selector-lideres'
import { DatoClave } from './vista-grupo'

const FORM_GRUPO = 'formulario-grupo'
const SIN_DIA = ''

export type ModoFormulario = { readonly modo: 'crear'; readonly ambitoId: string | null; readonly subareaId: string | null } | { readonly modo: 'editar'; readonly grupo: GrupoGestion }

export interface FormularioGrupoProps {
  readonly modo: ModoFormulario
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly subareas: readonly SubareaGestionable[]
  readonly grupos: readonly GrupoGestion[]
  readonly escalas: Readonly<Record<string, readonly GradoEscala[]>>
  /** The campus chosen in the app: the default campus of a new group. */
  readonly campusPreferido: string | null
  /** After creating: opens the new group's drawer. */
  readonly onCreado: (grupoId: string) => void
}

interface Estado {
  readonly ambitoId: string
  readonly subareaId: string
  readonly campusId: string
  readonly anio: string
  readonly zona: string
  readonly dia: string
  readonly hora: string
  /** The name the user typed; `null` follows the suggestion. */
  readonly nombre: string | null
  readonly lideres: ReadonlySet<string>
}

export function FormularioGrupo({ modo, abierto, onCambioAbierto, subareas, grupos, escalas, campusPreferido, onCreado }: FormularioGrupoProps): ReactElement {
  const toast = useNotificaciones()
  const idPista = useId()
  const nombreRef = useRef<HTMLInputElement>(null)
  const opciones = useMemo(() => opcionesDonde(subareas), [subareas])
  const editar = modo.modo === 'editar' ? modo.grupo : null

  const [estado, setEstado] = useState<Estado>(() => {
    if (editar) {
      return {
        ambitoId: editar.ambitoId,
        subareaId: editar.subareaId,
        campusId: editar.campusId,
        anio: editar.anio === null ? '' : String(editar.anio),
        zona: editar.zona ?? '',
        dia: editar.diaSemana === null ? SIN_DIA : String(editar.diaSemana),
        hora: editar.hora?.slice(0, 5) ?? '',
        nombre: editar.nombre,
        lideres: new Set(),
      }
    }
    const ambito = opciones.find((a) => a.ambitoId === (modo.modo === 'crear' ? modo.ambitoId : null)) ?? opciones[0]
    const subarea = ambito?.subareas.find((s) => s.subareaId === (modo.modo === 'crear' ? modo.subareaId : null)) ?? ambito?.subareas[0]
    const campus = subarea?.campus.find((c) => c.campusId === campusPreferido) ?? subarea?.campus[0]
    return { ambitoId: ambito?.ambitoId ?? '', subareaId: subarea?.subareaId ?? '', campusId: campus?.campusId ?? '', anio: '', zona: '', dia: SIN_DIA, hora: '', nombre: null, lideres: new Set() }
  })
  const [error, setError] = useState<string | null>(null)
  const [errorAnio, setErrorAnio] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const ambito = opciones.find((a) => a.ambitoId === estado.ambitoId)
  const subarea = ambito?.subareas.find((s) => s.subareaId === estado.subareaId)
  const campus = subarea?.campus.find((c) => c.campusId === estado.campusId)
  const experiencia = ambito?.experiencia ?? editar?.experiencia ?? 'estudiantes'
  const tlr = experiencia === 'the_living_room'
  const nombreAmbito = ambito?.ambito ?? editar?.ambito ?? ''
  const nombreSubarea = subarea?.subarea ?? editar?.subarea ?? ''
  const nombreCampus = campus?.campus ?? ''

  const escala = escalas[estado.campusId] ?? []
  const aniosAmbito = escala.filter((g) => g.ambitoId === estado.ambitoId).sort((a, b) => a.numero - b.numero)
  const existentes = grupos
    .filter((g) => g.activo && g.subareaId === estado.subareaId && g.campusId === estado.campusId && g.id !== editar?.id)
    .map((g) => g.nombre)
  const base = baseNombreGrupo({
    experiencia,
    anioEtiqueta: aniosAmbito.find((g) => String(g.numero) === estado.anio)?.etiqueta ?? null,
    zona: estado.zona,
    subarea: nombreSubarea,
  })
  const sugerido = sugerirNombreGrupo(base, existentes)
  const nombre = estado.nombre ?? sugerido ?? ''
  const pista = pistaNombre({ experiencia, base, sugerido, editado: estado.nombre !== null && !editar })

  function cambiar(parche: Partial<Estado>): void {
    setEstado((actual) => ({ ...actual, ...parche }))
  }

  /** Another sub-área or campus is another Dream Team node: the chosen leaders go. */
  function cambiarDonde(parche: Partial<Pick<Estado, 'ambitoId' | 'subareaId' | 'campusId'>>): void {
    const ambitoId = parche.ambitoId ?? estado.ambitoId
    const nuevoAmbito = opciones.find((a) => a.ambitoId === ambitoId)
    const subareaId = nuevoAmbito?.subareas.some((s) => s.subareaId === (parche.subareaId ?? estado.subareaId))
      ? (parche.subareaId ?? estado.subareaId)
      : (nuevoAmbito?.subareas[0]?.subareaId ?? '')
    const nuevaSubarea = nuevoAmbito?.subareas.find((s) => s.subareaId === subareaId)
    const campusId = nuevaSubarea?.campus.some((c) => c.campusId === (parche.campusId ?? estado.campusId))
      ? (parche.campusId ?? estado.campusId)
      : (nuevaSubarea?.campus[0]?.campusId ?? '')
    cambiar({ ambitoId, subareaId, campusId, lideres: new Set(), ...(ambitoId !== estado.ambitoId ? { anio: '' } : {}) })
  }

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    const problema = validarNombreGrupo(nombre, existentes)
    if (problema) {
      setError(problema)
      nombreRef.current?.focus()
      return
    }
    if (!tlr && estado.anio === '') {
      setError(null)
      setErrorAnio('Elige el año escolar del grupo.')
      return
    }
    setError(null)
    setErrorAnio(null)
    const datos: DatosGrupo = {
      nombre: nombre.trim(),
      anio: tlr ? null : Number(estado.anio),
      zona: tlr ? estado.zona.trim() || null : null,
      diaSemana: tlr && estado.dia !== SIN_DIA ? Number(estado.dia) : null,
      hora: tlr && estado.dia !== SIN_DIA && estado.hora ? estado.hora : null,
    }
    setGuardando(true)
    try {
      if (editar) {
        const resultado = await editarGrupo({ grupoId: editar.id, ...datos })
        if (!resultado.ok) return mostrarError(resultado.message)
        toast.success('Cambios guardados')
        onCambioAbierto(false)
        return
      }
      const resultado = await crearGrupo({ subareaId: estado.subareaId, campusId: estado.campusId, lideres: [...estado.lideres], ...datos })
      if (!resultado.ok) return mostrarError(resultado.message)
      toast.success(`Creaste ${datos.nombre}`)
      if (resultado.data.aviso) toast.error(resultado.data.aviso)
      onCambioAbierto(false)
      onCreado(resultado.data.grupoId)
    } catch {
      toast.error('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function mostrarError(mensaje: string): void {
    // A name problem goes on the field; anything else is a toast.
    if (/nombre/i.test(mensaje)) {
      setError(mensaje)
      nombreRef.current?.focus()
    } else {
      toast.error(mensaje)
    }
  }

  const fijo = editar !== null || (opciones.length === 1 && (opciones[0]?.subareas.length ?? 0) === 1 && (opciones[0]?.subareas[0]?.campus.length ?? 0) === 1)
  const varios = (subarea?.campus.length ?? 0) > 1

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onCambioAbierto}
      titulo={editar ? 'Editar grupo' : 'Crear grupo'}
      descripcion={editar ? editar.nombre : 'Después agregas a los integrantes desde el grupo.'}
      pie={
        <>
          <BotonSistema type="button" variante="outline" onClick={() => onCambioAbierto(false)} disabled={guardando}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={FORM_GRUPO} cargando={guardando} disabled={guardando}>
            {editar ? 'Guardar cambios' : 'Crear grupo'}
          </BotonSistema>
        </>
      }
    >
      <form id={FORM_GRUPO} onSubmit={guardar} noValidate className="space-y-5">
        <section aria-labelledby="grupo-donde" className="space-y-3">
          <TituloSeccion id="grupo-donde" texto="Dónde" />
          {fijo ? (
            <TarjetaSistema className="space-y-3 p-4">
              <dl className="grid grid-cols-2 gap-3">
                <DatoClave etiqueta="Ámbito" valor={nombreAmbito} />
                <DatoClave etiqueta="Sub-área" valor={nombreSubarea} />
              </dl>
              <p className="text-[13px] text-muted-foreground">
                {editar ? 'Para cambiar de ámbito o sub-área, crea otro grupo y mueve a los integrantes.' : 'Creas grupos solo en tu sub-área.'}
              </p>
            </TarjetaSistema>
          ) : (
            <div className="space-y-3">
              {opciones.length > 1 && (
                <SelectSistema
                  label="Ámbito"
                  opciones={opciones.map((a) => ({ valor: a.ambitoId, etiqueta: a.ambito }))}
                  value={estado.ambitoId}
                  onValueChange={(ambitoId) => cambiarDonde({ ambitoId })}
                />
              )}
              {(ambito?.subareas.length ?? 0) > 1 && (
                <div className="space-y-2">
                  {/* The segmented control is named "Sub-área" itself; this is the visible label. */}
                  <span aria-hidden="true" className="block text-sm font-medium text-foreground">
                    Sub-área
                  </span>
                  <ControlSegmentado
                    etiqueta="Sub-área"
                    opciones={(ambito?.subareas ?? []).map((s) => ({ valor: s.subareaId, etiqueta: s.subarea }))}
                    valor={estado.subareaId}
                    onCambio={(subareaId) => cambiarDonde({ subareaId })}
                  />
                </div>
              )}
              {varios && (
                <SelectSistema
                  label="Campus"
                  opciones={(subarea?.campus ?? []).map((c) => ({ valor: c.campusId, etiqueta: c.campus }))}
                  value={estado.campusId}
                  onValueChange={(campusId) => cambiarDonde({ campusId })}
                />
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="grupo-quienes" className="space-y-3">
          <TituloSeccion id="grupo-quienes" texto="Quiénes van" />
          {tlr ? (
            <>
              <div className="space-y-2">
                <InputSistema label="Zona" autoComplete="off" maxLength={120} value={estado.zona} onChange={(e) => cambiar({ zona: e.target.value })} />
                <p className="text-[13px] text-muted-foreground">Donde viven sus integrantes.</p>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <SelectSistema
                  label="Se reúne cada"
                  opciones={[{ valor: SIN_DIA, etiqueta: 'Sin día fijo' }, ...DIAS_SEMANA.map((dia, i) => ({ valor: String(i), etiqueta: dia }))]}
                  value={estado.dia}
                  onValueChange={(dia) => cambiar({ dia, ...(dia === SIN_DIA ? { hora: '' } : {}) })}
                />
                <InputSistema
                  label="Hora"
                  type="time"
                  className="font-mono tabular-nums"
                  value={estado.hora}
                  disabled={estado.dia === SIN_DIA}
                  onChange={(e) => cambiar({ hora: e.target.value })}
                />
              </div>
              <p className="text-[13px] text-muted-foreground">
                Cada semana el líder marca la reunión y, si quiere, anota el lugar. El servicio en la iglesia no se marca aquí.
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <SelectSistema
                label="Año escolar"
                placeholder="Elige el año"
                opciones={aniosAmbito.map((g) => ({ valor: String(g.numero), etiqueta: g.etiqueta }))}
                value={estado.anio}
                error={errorAnio ?? undefined}
                onValueChange={(anio) => {
                  setErrorAnio(null)
                  cambiar({ anio })
                }}
              />
              <p className="text-[13px] text-muted-foreground">{pistaEscala(escala, nombreCampus || 'de este grupo', estado.ambitoId, nombreAmbito)}</p>
            </div>
          )}
        </section>

        <div className="space-y-2">
          <InputSistema
            ref={nombreRef}
            label="Nombre"
            autoComplete="off"
            maxLength={80}
            value={nombre}
            error={error ?? undefined}
            aria-describedby={error ? undefined : idPista}
            onChange={(e) => {
              setError(null)
              cambiar({ nombre: e.target.value })
            }}
            // Leaving the field empty goes back to the suggestion.
            onBlur={() => {
              if (!editar && estado.nombre?.trim() === '') cambiar({ nombre: null })
            }}
          />
          {!error && (
            <p id={idPista} className="text-[13px] text-muted-foreground">
              {editar ? 'El nombre debe ser único en la sub-área.' : pista}
            </p>
          )}
        </div>

        {!editar && estado.subareaId && estado.campusId && (
          <div className="space-y-2">
            <SelectorLideres
              subareaId={estado.subareaId}
              campusId={estado.campusId}
              grupos={grupos}
              grupoId={null}
              seleccion={estado.lideres}
              onCambio={(lideres) => cambiar({ lideres })}
              titulo="Líderes"
            />
            <p className="text-[13px] text-muted-foreground">
              {`Voluntarios del Dream Team de ${nombreSubarea} en ${nombreAmbito}. Puedes crearlo sin líder y asignarlo después.`}
            </p>
          </div>
        )}
      </form>
    </DetalleResponsivo>
  )
}
