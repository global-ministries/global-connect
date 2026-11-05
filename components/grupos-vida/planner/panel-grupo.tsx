'use client'

/**
 * Planner — one group as a side panel (T6 of odd/tasks/planner-gdv.md;
 * artboard 02; S2–S5, S7, S10, S13, S22). Opened from a card (its name or
 * "Abrir"), from the alerts ("Ir al grupo") and from the bank (the person's
 * current group).
 *
 * Sections: Nombre (free name, "Usar sugerencia" from sugerirNombre, the
 * computed label and full name, S4), Localidad (selector, the suggestion of
 * sugerirLocalidad with its reason and "Usar <localidad>", where the members
 * live, S3, S5), Reunión (day, hour, capacity; the meeting address has no
 * field in the step RPC yet), Directores de etapa (the eligible ones of the
 * segment, a couple as one option, at most MAXIMO_DIRECTORES) and Integrantes
 * by role with each person's warning chips and the actions change role,
 * "Mover" (the Ubicar dialog) and back to the bank.
 *
 * There is no "Guardar": each field saves on blur or selection as one
 * planner_editar_grupo step with only the changed key, shows "Guardando…" in
 * place, the server's refusal in the field and announces both in the panel's
 * live region. Read-only (fields disabled, actions hidden) for a segment the
 * actor does not edit (S10); "Eliminar grupo" only while the group has not
 * started (S22). The sheet traps the focus, closes with Escape and returns
 * the focus to what opened it.
 */
import { useId, useMemo, useState, type ReactElement, type ReactNode } from 'react'

import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'
import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import {
  enLista,
  etiquetaGrupo,
  nombreCompleto,
  nombrePersona,
  personasDelGrupo,
  sugerirLocalidad,
  sugerirNombre,
  type Aviso,
  type Bloqueo,
  type GrupoTablero,
  type Localidad,
  type PersonaBanco,
  type PersonaGrupo,
  type SegmentoConDirectores,
} from '@/lib/platform/grupos-vida/planner'
import { DIAS_REUNION, LARGO_NOMBRE_GRUPO, MAXIMO_DIRECTORES, type DatosGrupo, type ResultadoAccion } from '@/lib/platform/grupos-vida/planner/acciones'
import { cn } from '@/lib/utils'

import type { Carga } from './contexto-pasos'
import { EtiquetaPlanner } from './etiqueta'
import {
  ETIQUETA_ROL,
  directoresElegibles,
  dondeViven,
  horaCorta,
  insigniasGrupo,
  insigniasPersona,
  puedeEliminarGrupo,
  rolEnGrupo,
  rolesGrupo,
  type DirectorElegible,
  type RolDestino,
  type RolGrupo,
} from './modelo'

const ROLES: readonly RolDestino[] = ['lider', 'aprendiz', 'miembro']

type Campo = 'nombre' | 'localidad' | 'dia' | 'hora' | 'capacidad' | 'directores'

/** What each field is called in the announcements ("Guardando el día…", "Guardaste el día de …"). */
const NOMBRE_CAMPO: Readonly<Record<Campo, string>> = {
  nombre: 'el nombre',
  localidad: 'la localidad',
  dia: 'el día',
  hora: 'la hora',
  capacidad: 'la capacidad',
  directores: 'los directores de etapa',
}

const ERROR_CAPACIDAD = 'La capacidad debe ser un número entero mayor que 0.'

export interface PanelGrupoProps {
  /** The open group (live, with the optimistic moves); null closes the panel. */
  readonly grupo: GrupoTablero | null
  /** S10: whether the actor edits the group's segment. */
  readonly editable: boolean
  /** Every group on the board, for the next free number of the name suggestion. */
  readonly grupos: readonly GrupoTablero[]
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly banco: readonly PersonaBanco[]
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  /** Empty when they could not be read: no suggestion, only "Sin localidad". */
  readonly localidades: readonly Localidad[]
  /** planner_temporadas.segmentos, each with its eligible directores de etapa. */
  readonly segmentos: readonly SegmentoConDirectores[]
  readonly onCerrar: () => void
  readonly onEditar: (grupo: GrupoTablero, cambios: Partial<DatosGrupo>, que: string) => Promise<ResultadoAccion<unknown>>
  readonly onMover: (usuarioIds: readonly string[], grupo: GrupoTablero | null, rol: RolDestino) => void
  readonly onPedirUbicar: (carga: Carga, inicial: { readonly grupoId: string; readonly rol: RolDestino }) => void
  readonly onEliminar: (grupo: GrupoTablero) => void
}

interface Borrador {
  /** The value the board data has now. */
  readonly servidor: string
  /** The last value the server accepted (the board refreshes later). */
  readonly guardado: string
  readonly valor: string
}

/**
 * A field's draft: starts from the board data and starts over whenever the
 * board data changes (a refresh after the step, an undo, another director).
 */
function useBorrador(servidor: string) {
  const [estado, setEstado] = useState<Borrador>({ servidor, guardado: servidor, valor: servidor })
  const actual = estado.servidor === servidor ? estado : { servidor, guardado: servidor, valor: servidor }
  if (actual !== estado) setEstado(actual)
  return {
    valor: actual.valor,
    guardado: actual.guardado,
    cambiar: (valor: string) => setEstado((e) => ({ ...e, valor })),
    confirmar: (valor: string) => setEstado((e) => ({ ...e, guardado: valor, valor })),
    revertir: () => setEstado((e) => ({ ...e, valor: e.guardado })),
  }
}

const claveIds = (ids: readonly string[]): string => ids.join('|')
const idsDe = (clave: string): string[] => (clave ? clave.split('|') : [])

function Seccion({ titulo, extra, children }: { readonly titulo: string; readonly extra?: ReactNode; readonly children: ReactNode }): ReactElement {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-3 border-b border-border pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold text-foreground">
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

const Guardando = ({ activo }: { readonly activo: boolean }): ReactElement | null =>
  activo ? <p className="text-xs text-muted-foreground">Guardando…</p> : null

function FilaIntegrante({
  persona,
  grupo,
  rol,
  editable,
  ficha,
  bloqueos,
  avisos,
  onMover,
  onPedirUbicar,
}: {
  readonly persona: PersonaGrupo
  readonly grupo: GrupoTablero
  readonly rol: RolDestino
  readonly editable: boolean
  readonly ficha: PersonaBanco | undefined
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly onMover: PanelGrupoProps['onMover']
  readonly onPedirUbicar: PanelGrupoProps['onPedirUbicar']
}): ReactElement {
  const idNombre = useId()
  const nombre = nombrePersona(persona)
  const datos = [ficha?.edad !== null && ficha?.edad !== undefined ? `${ficha.edad} años` : null, ficha?.municipio_nombre].filter(Boolean)
  const marcas = insigniasPersona(persona.usuario_id, grupo.grupo_id, bloqueos, avisos)
  return (
    <li aria-labelledby={idNombre} className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 border-b border-border py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1 basis-48">
        <p id={idNombre} className="truncate text-sm font-medium text-foreground" title={nombre}>
          {nombre}
        </p>
        {datos.length > 0 && <p className="truncate text-xs text-muted-foreground">{datos.join(' · ')}</p>}
        {marcas.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {marcas.map((m) => (
              <EtiquetaPlanner key={m.etiqueta} tono={m.tono}>
                {m.etiqueta}
              </EtiquetaPlanner>
            ))}
          </div>
        )}
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-1">
          <div className="w-32">
            <SelectSistema
              aria-label={`Rol de ${nombre}`}
              opciones={ROLES.map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }))}
              value={rol}
              onValueChange={(v) => {
                const nuevo = ROLES.find((r) => r === v)
                if (nuevo && nuevo !== rol) onMover([persona.usuario_id], grupo, nuevo)
              }}
            />
          </div>
          <BotonSistema
            type="button"
            variante="ghost"
            tamaño="sm"
            aria-label={`Mover a ${nombre}`}
            onClick={() => onPedirUbicar({ ids: [persona.usuario_id], nombre, desdeGrupo: true }, { grupoId: grupo.grupo_id, rol })}
          >
            Mover
          </BotonSistema>
          <BotonSistema type="button" variante="ghost" tamaño="sm" aria-label={`Devolver a ${nombre} al banco`} onClick={() => onMover([persona.usuario_id], null, rol)}>
            Al banco
          </BotonSistema>
        </div>
      )}
    </li>
  )
}

function SeccionRol(props: {
  readonly rol: RolGrupo
  readonly grupo: GrupoTablero
  readonly editable: boolean
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly bloqueos: readonly Bloqueo[]
  readonly avisos: readonly Aviso[]
  readonly onMover: PanelGrupoProps['onMover']
  readonly onPedirUbicar: PanelGrupoProps['onPedirUbicar']
}): ReactElement {
  const { rol, grupo, fichas } = props
  const falta = rol.id === 'lideres' && rol.personas.length === 0
  return (
    <section aria-label={rol.titulo}>
      <h4 className={cn('text-xs font-medium uppercase tracking-[0.08em]', falta ? 'text-danger-text' : 'text-muted-foreground')}>
        {rol.titulo} <span className="font-mono tabular-nums">{rol.personas.length}</span>
      </h4>
      {rol.personas.length === 0 ? (
        <p className={cn('py-2 text-sm', falta ? 'text-danger-text' : 'text-muted-foreground')}>{falta ? 'Falta el Líder' : 'Nadie todavía'}</p>
      ) : (
        <ul>
          {rol.personas.map((persona) => (
            <FilaIntegrante
              key={persona.usuario_id}
              {...props}
              persona={persona}
              rol={rolEnGrupo(grupo, persona.usuario_id) ?? 'miembro'}
              ficha={fichas.get(persona.usuario_id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function Formulario({
  grupo,
  editable,
  grupos,
  bloqueos,
  avisos,
  banco,
  fichas,
  localidades,
  segmentos,
  onEditar,
  onMover,
  onPedirUbicar,
}: Omit<PanelGrupoProps, 'grupo' | 'onCerrar' | 'onEliminar'> & { readonly grupo: GrupoTablero }): ReactElement {
  const nombre = useBorrador(grupo.nombre)
  const localidad = useBorrador(grupo.localidad_id ?? '')
  const dia = useBorrador(grupo.dia_reunion ?? '')
  const hora = useBorrador(horaCorta(grupo.hora_reunion))
  const capacidad = useBorrador(grupo.capacidad_maxima === null ? '' : String(grupo.capacidad_maxima))
  const directores = useBorrador(claveIds(grupo.directores.map((d) => d.usuario_id)))
  const [guardando, setGuardando] = useState<ReadonlySet<Campo>>(() => new Set())
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [anuncio, setAnuncio] = useState('')

  const fallar = (campo: Campo, mensaje: string) => {
    setErrores((e) => ({ ...e, [campo]: mensaje }))
    setAnuncio(mensaje)
  }

  /** One step with only `cambios`; true when the server accepted it. */
  const guardar = async (campo: Campo, cambios: Partial<DatosGrupo>): Promise<boolean> => {
    const que = NOMBRE_CAMPO[campo]
    setErrores((e) => ({ ...e, [campo]: undefined }))
    setGuardando((g) => new Set(g).add(campo))
    setAnuncio(`Guardando ${que}…`)
    const resultado = await onEditar(grupo, cambios, que)
    setGuardando((g) => {
      const siguiente = new Set(g)
      siguiente.delete(campo)
      return siguiente
    })
    if (resultado.ok) setAnuncio(`Guardaste ${que}`)
    else fallar(campo, resultado.mensaje)
    return resultado.ok
  }

  const guardarNombre = async (valor: string) => {
    const limpio = valor.replace(/\s+/g, ' ').trim()
    if (limpio === nombre.guardado.replace(/\s+/g, ' ').trim()) return
    if (!limpio) return fallar('nombre', 'El grupo debe tener nombre.')
    if (await guardar('nombre', { nombre: limpio })) nombre.confirmar(limpio)
  }

  /** A select saves at once; on a refusal it shows the saved value again, with the error. */
  const guardarSeleccion = async (borrador: ReturnType<typeof useBorrador>, campo: Campo, valor: string, cambios: Partial<DatosGrupo>) => {
    if (valor === borrador.guardado) return
    borrador.cambiar(valor)
    if (await guardar(campo, cambios)) borrador.confirmar(valor)
    else borrador.revertir()
  }

  const guardarHora = async () => {
    if (hora.valor === hora.guardado) return
    if (await guardar('hora', { hora_reunion: hora.valor || null })) hora.confirmar(hora.valor)
  }

  const guardarCapacidad = async () => {
    const texto = capacidad.valor.trim()
    if (texto === capacidad.guardado) return
    const cupo = Number(texto)
    if (texto !== '' && (!Number.isInteger(cupo) || cupo <= 0)) return fallar('capacidad', ERROR_CAPACIDAD)
    if (await guardar('capacidad', { capacidad_maxima: texto === '' ? null : cupo })) capacidad.confirmar(texto)
  }

  // Nombre (S4): the suggestion uses the chosen localidad or, without one, the suggested.
  const sugerencia = useMemo(() => (localidades.length > 0 ? sugerirLocalidad(grupo, banco, localidades) : null), [grupo, banco, localidades])
  const localidadElegida = localidades.find((l) => l.id === localidad.valor) ?? null
  const otrosNombres = grupos.filter((g) => g.segmento_id === grupo.segmento_id && g.grupo_id !== grupo.grupo_id).map((g) => g.nombre)
  const nombreSugerido = sugerirNombre(localidadElegida?.nombre ?? sugerencia?.nombre ?? null, grupo.segmento_nombre, otrosNombres)
  const vista = { nombre: nombre.valor, segmento_nombre: grupo.segmento_nombre, localidad_nombre: localidadElegida?.nombre ?? null }
  const lugares = dondeViven(grupo, fichas)

  // Directores de etapa: the eligible ones of the segment, plus any current one no longer eligible.
  const elegidos = idsDe(directores.valor)
  const opcionesDirectores = useMemo((): DirectorElegible[] => {
    const elegibles = directoresElegibles(segmentos.find((s) => s.id === grupo.segmento_id), fichas)
    const ofrecidos = new Set(elegibles.flatMap((d) => d.usuarioIds))
    const actuales = grupo.directores
      .filter((d) => !ofrecidos.has(d.usuario_id))
      .map((d): DirectorElegible => ({ clave: d.usuario_id, usuarioIds: [d.usuario_id], nombre: nombrePersona(d) }))
    return [...elegibles, ...actuales]
  }, [segmentos, grupo.segmento_id, grupo.directores, fichas])

  const alternarDirector = (usuarioIds: readonly string[]) => {
    const quitar = usuarioIds.every((id) => elegidos.includes(id))
    const siguientes = quitar ? elegidos.filter((id) => !usuarioIds.includes(id)) : [...elegidos, ...usuarioIds.filter((id) => !elegidos.includes(id))]
    if (siguientes.length > MAXIMO_DIRECTORES) return fallar('directores', `Un grupo puede tener hasta ${MAXIMO_DIRECTORES} directores de etapa.`)
    void guardarSeleccion(directores, 'directores', claveIds(siguientes), { director_etapa_ids: siguientes })
  }

  const cantidad = personasDelGrupo(grupo).length

  return (
    <div className="space-y-5">
      {!editable && (
        <AvisoFormulario tono="info" role="note" className="py-3">
          Solo lectura: {grupo.segmento_nombre} no es de tus segmentos.
        </AvisoFormulario>
      )}
      <ul aria-label="Alertas del grupo" className="flex flex-wrap gap-1">
        {insigniasGrupo(grupo, bloqueos, avisos).map((insignia) => (
          <li key={insignia.etiqueta} className="min-w-0 max-w-full">
            <EtiquetaPlanner tono={insignia.tono}>{insignia.etiqueta}</EtiquetaPlanner>
          </li>
        ))}
      </ul>

      <Seccion titulo="Nombre">
        <InputSistema
          label="Nombre del grupo"
          value={nombre.valor}
          onChange={(e) => nombre.cambiar(e.target.value)}
          onBlur={(e) => void guardarNombre(e.target.value)}
          maxLength={LARGO_NOMBRE_GRUPO}
          disabled={!editable}
          error={errores.nombre}
          autoComplete="off"
        />
        <Guardando activo={guardando.has('nombre')} />
        {editable && nombreSugerido && nombreSugerido !== nombre.valor.trim() && (
          <BotonSistema
            type="button"
            variante="ghost"
            tamaño="sm"
            onClick={() => {
              nombre.cambiar(nombreSugerido)
              void guardarNombre(nombreSugerido)
            }}
          >
            Usar sugerencia: {nombreSugerido}
          </BotonSistema>
        )}
        <p className="text-xs text-muted-foreground">El segmento y la localidad no se escriben en el nombre: se agregan solos.</p>
        <dl className="grid gap-1 text-sm @md:grid-cols-[auto_minmax(0,1fr)] @md:gap-x-4">
          <dt className="text-muted-foreground">Etiqueta</dt>
          <dd className={cn('min-w-0 truncate', localidadElegida ? 'text-foreground' : 'text-danger-text')}>{etiquetaGrupo(vista)}</dd>
          <dt className="text-muted-foreground">Nombre completo</dt>
          <dd className="min-w-0 text-foreground">{nombreCompleto(vista)}</dd>
        </dl>
      </Seccion>

      <Seccion titulo="Localidad">
        {sugerencia && sugerencia.localidadId !== localidad.valor && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
            <p className="min-w-0 flex-1 text-sm text-foreground">
              Sugerido: {sugerencia.nombre} — {sugerencia.motivo}
            </p>
            {editable && (
              <BotonSistema
                type="button"
                variante="outline"
                tamaño="sm"
                onClick={() => void guardarSeleccion(localidad, 'localidad', sugerencia.localidadId, { localidad_id: sugerencia.localidadId })}
              >
                Usar {sugerencia.nombre}
              </BotonSistema>
            )}
          </div>
        )}
        {!sugerencia && !localidad.valor && localidades.length > 0 && (
          <p className="text-xs text-muted-foreground">Sin sugerencia: elige la localidad a mano.</p>
        )}
        <SelectSistema
          label="Localidad del grupo"
          opciones={[{ valor: '', etiqueta: 'Sin localidad' }, ...localidades.map((l) => ({ valor: l.id, etiqueta: l.nombre }))]}
          value={localidad.valor}
          onValueChange={(v) => void guardarSeleccion(localidad, 'localidad', v, { localidad_id: v || null })}
          disabled={!editable}
          error={errores.localidad}
        />
        <Guardando activo={guardando.has('localidad')} />
        {!localidad.valor && <p className="text-xs text-danger-text">Sin localidad no se puede publicar la temporada.</p>}
        {lugares.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Dónde viven</p>
            <ul aria-label="Dónde viven los integrantes" className="text-sm">
              {lugares.map((l) => (
                <li key={l.clave} className="flex justify-between gap-3 py-0.5">
                  <span className="min-w-0 truncate text-foreground">{l.etiqueta}</span>
                  <span className="shrink-0 text-muted-foreground">
                    <span className="font-mono tabular-nums text-foreground">{l.cantidad}</span>
                    {l.conLideres ? ', con los líderes' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Reunión">
        <div className="grid gap-3 @md:grid-cols-3">
          <SelectSistema
            label="Día"
            opciones={[{ valor: '', etiqueta: 'Sin día' }, ...DIAS_REUNION.map((d) => ({ valor: d, etiqueta: d }))]}
            value={dia.valor}
            onValueChange={(v) => void guardarSeleccion(dia, 'dia', v, { dia_reunion: v || null })}
            disabled={!editable}
            error={errores.dia}
          />
          <InputSistema
            label="Hora"
            type="time"
            value={hora.valor}
            onChange={(e) => hora.cambiar(e.target.value)}
            onBlur={() => void guardarHora()}
            disabled={!editable}
            error={errores.hora}
          />
          <InputSistema
            label="Capacidad"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={capacidad.valor}
            onChange={(e) => capacidad.cambiar(e.target.value)}
            onBlur={() => void guardarCapacidad()}
            disabled={!editable}
            error={errores.capacidad}
            className="font-mono tabular-nums"
          />
        </div>
        <Guardando activo={guardando.has('dia') || guardando.has('hora') || guardando.has('capacidad')} />
      </Seccion>

      <Seccion titulo="Directores de etapa">
        {editable ? (
          opcionesDirectores.length > 0 ? (
            <div role="group" aria-label="Directores de etapa" className="flex flex-wrap gap-2">
              {opcionesDirectores.map((d) => (
                <PastillaFiltro
                  key={d.clave}
                  etiqueta={d.nombre}
                  activa={d.usuarioIds.every((id) => elegidos.includes(id))}
                  onClick={() => alternarDirector(d.usuarioIds)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{grupo.segmento_nombre} no tiene directores de etapa todavía.</p>
          )
        ) : (
          <p className="text-sm text-foreground">{grupo.directores.length > 0 ? enLista(grupo.directores.map(nombrePersona)) : 'Sin director de etapa'}</p>
        )}
        <Guardando activo={guardando.has('directores')} />
        {errores.directores && (
          <p role="alert" className="text-sm text-danger-text">
            {errores.directores}
          </p>
        )}
        {elegidos.length === 0 && <p className="text-xs text-danger-text">Sin director de etapa no se puede publicar.</p>}
        {editable && <p className="text-xs text-muted-foreground">Un matrimonio es una sola opción; hasta {MAXIMO_DIRECTORES} directores.</p>}
      </Seccion>

      <Seccion
        titulo="Integrantes"
        extra={
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {cantidad}
            {grupo.capacidad_maxima !== null && ` / ${grupo.capacidad_maxima}`}
          </span>
        }
      >
        {rolesGrupo(grupo).map((rol) => (
          <SeccionRol
            key={rol.id}
            rol={rol}
            grupo={grupo}
            editable={editable}
            fichas={fichas}
            bloqueos={bloqueos}
            avisos={avisos}
            onMover={onMover}
            onPedirUbicar={onPedirUbicar}
          />
        ))}
        {editable && <p className="text-xs text-muted-foreground">Para agregar personas, arrastra desde el banco o usa «Ubicar».</p>}
      </Seccion>

      <p role="status" aria-live="polite" aria-label="Cambios del grupo" className="sr-only">
        {anuncio}
      </p>
    </div>
  )
}

export function PanelGrupo(props: PanelGrupoProps): ReactElement {
  const { grupo, editable, onCerrar, onEliminar } = props
  return (
    <PanelLateralSistema
      abierto={grupo !== null}
      onAbiertoChange={(abierto) => !abierto && onCerrar()}
      tamaño="lg"
      titulo={grupo ? grupo.nombre.trim() || etiquetaGrupo(grupo) : 'Grupo'}
      descripcion={grupo ? etiquetaGrupo(grupo) : undefined}
      pie={
        grupo && (
          <>
            {editable && (
              <p className="text-xs text-muted-foreground sm:mr-auto">Cada cambio se guarda solo como un paso; puedes deshacerlo con «Deshacer».</p>
            )}
            {editable && puedeEliminarGrupo(grupo) && (
              <BotonSistema type="button" variante="peligro" tamaño="sm" onClick={() => onEliminar(grupo)}>
                Eliminar grupo
              </BotonSistema>
            )}
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onCerrar}>
              Cerrar
            </BotonSistema>
          </>
        )
      }
    >
      {/* Keyed so each group starts from its own data and save state. */}
      {grupo && <Formulario key={grupo.grupo_id} {...props} grupo={grupo} />}
    </PanelLateralSistema>
  )
}
