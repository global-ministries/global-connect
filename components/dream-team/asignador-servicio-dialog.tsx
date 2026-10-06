'use client'

/**
 * Dream Team — the "Asignar servicio" side panel, shared by
 * /admin/dream-team/servidores (the pool) and /dream-team/mi-equipo.
 *
 * A right-side `Sheet` (full screen on phones) in three steps, with a step
 * indicator and a sticky footer; nothing is sent until the last step:
 *
 * 1. Persona — debounced search with `AbortController`, or "Registrar persona
 *    nueva" (DatosPersonaNuevaCampos). Only the volunteer coordinator of an
 *    area (and org.manage, admin, pastor) may register: the option shows only
 *    when GET /api/dream-team/usuarios/registrables lists some equipo.
 *    `soloRegistrar` opens straight into the form, for a registrar who may
 *    not assign existing people. A taken cedula is checked here, and the
 *    duplicates the database reports on submit ('existente', 'coincidencias')
 *    bring the panel back here to pick that person instead.
 * 2. Equipo y rol — a tree-aware picker ("Waumba Land › Desmontaje"). While
 *    registering it offers exactly the registrable equipos and their roles
 *    (the database enforces the same set). `equipoIdInicial` preselects one.
 * 3. Turno (optional, from `turnos`) and a summary, then "Asignar": POST
 *    /api/dream-team/usuarios (person + servicio in one transaction) or POST
 *    /api/dream-team/servicios (it starts in `postulado`); a chosen shift is
 *    then saved with PUT /api/dream-team/servicios/[id]/turnos, whose trigger
 *    rejects a shift the equipo does not serve (422, reported, the servicio
 *    stays assigned).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { ArrowLeft, Search } from 'lucide-react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BotonSistema, InputSistema, SelectSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import { rolLabel } from '@/components/dream-team/labels'
import { DatosPersonaNuevaCampos } from '@/components/dream-team/asignador/datos-persona-nueva'
import { IndicadorPasos } from '@/components/dream-team/asignador/indicador-pasos'
import { SelectorEquipo } from '@/components/dream-team/asignador/selector-equipo'
import {
  DATOS_VACIOS,
  PASOS,
  cuerpoAltaPersona,
  datosBasicosCompletos,
  rutaDeEquipo,
  textoRuta,
  type DatosPersonaNueva,
  type EquipoElegible,
  type Paso,
} from '@/components/dream-team/asignador/logica'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'
import type { AltaPersonaResultado, OpcionRegistro, PersonaCandidata } from '@/lib/platform/dream-team/alta-persona'

export interface NodoPlano {
  readonly id: string
  readonly etiqueta: string
  /** Labels from the top node down to this one; the picker shows them as "A › B". */
  readonly ruta?: readonly string[]
}

export interface TurnoOpcion {
  readonly id: string
  readonly label: string
}

interface UsuarioResult {
  readonly id: string
  readonly email: string | null
  readonly nombre: string | null
  readonly apellido: string | null
}

type Duplicado =
  | { readonly tipo: 'existente'; readonly id: string; readonly nombre: string }
  | { readonly tipo: 'coincidencias'; readonly candidatos: readonly PersonaCandidata[] }

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300
const SIN_TURNOS: readonly TurnoOpcion[] = []

function nombreCompleto(u: UsuarioResult): string {
  const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim()
  return nombre.length > 0 ? nombre : (u.email ?? 'Sin nombre')
}

function mensajeDe(body: unknown, porDefecto: string): string {
  const error = (body as { error?: unknown } | null)?.error
  return typeof error === 'string' && error !== '' ? error : porDefecto
}

export interface AsignadorServicioDialogProps {
  readonly abierto: boolean
  readonly onClose: () => void
  readonly nodosPlanos: readonly NodoPlano[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly onAsignado: () => void
  readonly toast: ReturnType<typeof useNotificaciones>
  /** Equipo preselected every time the panel opens (e.g. the team selected on Mi equipo). */
  readonly equipoIdInicial?: string
  /** Panel title; defaults to "Asignar servicio" (the servidores pool wording). */
  readonly titulo?: string
  /** Opens straight into "Registrar persona nueva" (a registrar who may not assign existing people). */
  readonly soloRegistrar?: boolean
  /** The shifts of the campus in use; step 3 offers them (optional). */
  readonly turnos?: readonly TurnoOpcion[]
}

async function cargarOpcionesRegistro(signal: AbortSignal): Promise<OpcionRegistro[]> {
  try {
    const res = await fetch('/api/dream-team/usuarios/registrables', { cache: 'no-store', signal })
    if (!res.ok) return []
    const body = (await res.json()) as { equipos?: OpcionRegistro[] }
    return Array.isArray(body.equipos) ? body.equipos : []
  } catch {
    return []
  }
}

/** The person holding a cedula, or `null` (also when the lookup fails: the database checks again). */
async function personaConCedula(cedula: string): Promise<{ id: string; nombre: string; apellido: string } | null> {
  try {
    const res = await fetch(`/api/dream-team/usuarios/cedula?cedula=${encodeURIComponent(cedula)}`, { cache: 'no-store' })
    if (!res.ok) return null
    const body = (await res.json()) as { persona?: { id: string; nombre: string; apellido: string } | null }
    return body.persona ?? null
  } catch {
    return null
  }
}

export function AsignadorServicioDialog({
  abierto,
  onClose,
  nodosPlanos,
  rolesPorEquipo,
  onAsignado,
  toast,
  equipoIdInicial,
  titulo = 'Asignar servicio',
  soloRegistrar = false,
  turnos = SIN_TURNOS,
}: AsignadorServicioDialogProps): ReactElement {
  const [paso, setPaso] = useState<Paso>(1)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<UsuarioResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const [persona, setPersona] = useState<UsuarioResult | null>(null)
  const [registrando, setRegistrando] = useState(false)
  const [datos, setDatos] = useState<DatosPersonaNueva>(DATOS_VACIOS)
  const [duplicado, setDuplicado] = useState<Duplicado | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [equipoId, setEquipoId] = useState('')
  const [rolId, setRolId] = useState('')
  const [turnoId, setTurnoId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [opcionesRegistro, setOpcionesRegistro] = useState<readonly OpcionRegistro[] | null>(null)

  const requestSeqRef = useRef(0)
  const tituloPasoRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!abierto) return
    setPaso(1)
    setQuery('')
    setResultados([])
    setPersona(null)
    setDatos(DATOS_VACIOS)
    setDuplicado(null)
    setEquipoId(equipoIdInicial ?? '')
    setRolId('')
    setTurnoId('')
    setRegistrando(soloRegistrar)
  }, [abierto, equipoIdInicial, soloRegistrar])

  useEffect(() => {
    if (!abierto) return
    const controller = new AbortController()
    setOpcionesRegistro(null)
    void cargarOpcionesRegistro(controller.signal).then((opciones) => {
      if (!controller.signal.aborted) setOpcionesRegistro(opciones)
    })
    return () => controller.abort()
  }, [abierto])

  // While registering, the equipo must be one the actor may register into.
  useEffect(() => {
    if (!registrando || equipoId === '' || opcionesRegistro === null) return
    if (!opcionesRegistro.some((o) => o.id === equipoId)) {
      setEquipoId('')
      setRolId('')
    }
  }, [registrando, equipoId, opcionesRegistro])

  useEffect(() => {
    if (!abierto) return
    const q = query.trim()
    if (persona || registrando || q.length < MIN_QUERY_LENGTH) {
      setResultados([])
      setBuscando(false)
      return
    }

    const seq = ++requestSeqRef.current
    const controller = new AbortController()
    setBuscando(true)

    async function ejecutar(): Promise<void> {
      try {
        const res = await fetch(`/api/dream-team/usuarios/buscar?q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('search failed')
        const data = (await res.json()) as UsuarioResult[]
        if (seq === requestSeqRef.current) setResultados(data)
      } catch {
        if (seq === requestSeqRef.current) setResultados([])
      } finally {
        if (seq === requestSeqRef.current) setBuscando(false)
      }
    }

    const timer = setTimeout(() => {
      void ejecutar()
    }, DEBOUNCE_MS)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, persona, registrando, abierto])

  // Move focus to the new step's heading so keyboard and screen reader users follow along.
  useEffect(() => {
    if (abierto) tituloPasoRef.current?.focus()
  }, [paso, abierto])

  const puedeRegistrar = (opcionesRegistro?.length ?? 0) > 0

  const rutasPorId = useMemo(() => new Map(nodosPlanos.map((n) => [n.id, rutaDeEquipo(n)])), [nodosPlanos])
  const equipos: readonly EquipoElegible[] = useMemo(
    () =>
      registrando
        ? (opcionesRegistro ?? []).map((o) => ({ id: o.id, ruta: rutasPorId.get(o.id) ?? rutaDeEquipo(o) }))
        : nodosPlanos.map((n) => ({ id: n.id, ruta: rutasPorId.get(n.id) ?? [] })),
    [registrando, opcionesRegistro, nodosPlanos, rutasPorId],
  )
  const rolesDelEquipo: readonly { readonly id: string; readonly label: string }[] = !equipoId
    ? []
    : registrando
      ? (opcionesRegistro?.find((o) => o.id === equipoId)?.roles ?? [])
      : (rolesPorEquipo[equipoId] ?? [])

  const equipoElegido = equipos.find((e) => e.id === equipoId)
  const rolElegido = rolesDelEquipo.find((r) => r.id === rolId)
  const turnoElegido = turnos.find((t) => t.id === turnoId)

  const pasoUnoListo = registrando ? datosBasicosCompletos(datos) && duplicado === null : persona !== null
  const pasoDosListo = equipoElegido !== undefined && rolElegido !== undefined

  function elegirExistente(p: UsuarioResult): void {
    setPersona(p)
    setRegistrando(false)
    setDuplicado(null)
  }

  async function siguiente(): Promise<void> {
    if (paso === 1) {
      if (!pasoUnoListo || verificando) return
      const cedula = datos.cedula.trim()
      if (registrando && cedula !== '') {
        setVerificando(true)
        const existente = await personaConCedula(cedula)
        setVerificando(false)
        if (existente) {
          setDuplicado({ tipo: 'existente', id: existente.id, nombre: `${existente.nombre} ${existente.apellido}`.trim() })
          return
        }
      }
      setPaso(2)
    } else if (paso === 2 && pasoDosListo) {
      setPaso(3)
    }
  }

  async function guardarTurno(servicioId: string | undefined): Promise<void> {
    if (!turnoId || !servicioId) return
    try {
      const res = await fetch(`/api/dream-team/servicios/${encodeURIComponent(servicioId)}/turnos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnoIds: [turnoId] }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(`El servicio quedó asignado, pero no se guardó el turno: ${mensajeDe(body, 'error al guardar.')}`)
      }
    } catch {
      toast.error('El servicio quedó asignado, pero no se guardó el turno.')
    }
  }

  async function asignar(): Promise<void> {
    if (!pasoDosListo || enviando) return
    if (!registrando && !persona) return
    setEnviando(true)
    try {
      if (registrando) {
        const res = await fetch('/api/dream-team/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpoAltaPersona(datos, equipoId, rolId)),
        })
        const body = (await res.json().catch(() => null)) as (AltaPersonaResultado & { error?: string }) | null
        if (!res.ok || !body) {
          toast.error(mensajeDe(body, 'No se pudo registrar a la persona.'))
          return
        }
        if (body.resultado === 'creada') {
          await guardarTurno(body.servicioId)
          toast.success(`${body.nombre} registrada y asignada.`)
          onAsignado()
          return
        }
        setDuplicado(
          body.resultado === 'existente'
            ? { tipo: 'existente', id: body.personaId, nombre: body.nombre }
            : { tipo: 'coincidencias', candidatos: body.candidatos },
        )
        setPaso(1)
        return
      }

      const res = await fetch('/api/dream-team/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona?.id, equipoId, rolId }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(mensajeDe(body, 'No se pudo crear el servicio.'))
        return
      }
      await guardarTurno((body as { servicio?: { id?: string } } | null)?.servicio?.id)
      toast.success('Servicio asignado correctamente.')
      onAsignado()
    } catch {
      toast.error(registrando ? 'No se pudo registrar a la persona.' : 'No se pudo crear el servicio.')
    } finally {
      setEnviando(false)
    }
  }

  const tituloPaso = PASOS.find((p) => p.paso === paso)?.titulo ?? ''
  const pista =
    paso === 1 && !pasoUnoListo && duplicado === null
      ? registrando
        ? 'Completa los datos básicos para continuar.'
        : 'Elige a una persona para continuar.'
      : paso === 2 && !pasoDosListo
        ? 'Elige el equipo y el rol para continuar.'
        : null

  const avisoDuplicado = duplicado && (
    <div role="alert" className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
      {duplicado.tipo === 'existente' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TextoSistema tamaño="sm">{`Ya existe: ${duplicado.nombre}`}</TextoSistema>
          <BotonSistema
            type="button"
            tamaño="sm"
            onClick={() => elegirExistente({ id: duplicado.id, nombre: duplicado.nombre, apellido: null, email: null })}
          >
            Usar esta persona
          </BotonSistema>
        </div>
      ) : (
        <>
          <TextoSistema tamaño="sm">Ya hay personas con el mismo nombre y fecha de nacimiento:</TextoSistema>
          <ul className="rounded-md border border-border bg-background">
            {duplicado.candidatos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-b-0">
                <span className="text-sm">{`${c.nombre} ${c.apellido}`}</span>
                <BotonSistema
                  type="button"
                  variante="outline"
                  tamaño="sm"
                  onClick={() => elegirExistente({ id: c.id, nombre: c.nombre, apellido: c.apellido, email: null })}
                >
                  Usar
                </BotonSistema>
              </li>
            ))}
          </ul>
          <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setDuplicado(null)}>
            No es ninguna, registrar igual
          </BotonSistema>
        </>
      )}
    </div>
  )

  const pasoPersona = registrando ? (
    <div className="grid gap-4">
      {avisoDuplicado}
      <DatosPersonaNuevaCampos
        valor={datos}
        onCambio={(v) => {
          setDatos(v)
          if (duplicado?.tipo === 'existente' && v.cedula !== datos.cedula) setDuplicado(null)
        }}
        toast={toast}
      />
      {!soloRegistrar && (
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          className="justify-self-start"
          onClick={() => {
            setRegistrando(false)
            setDuplicado(null)
          }}
        >
          Volver a buscar
        </BotonSistema>
      )}
    </div>
  ) : persona ? (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <TextoSistema className="min-w-0 truncate font-medium">{nombreCompleto(persona)}</TextoSistema>
      <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setPersona(null)}>
        Cambiar
      </BotonSistema>
    </div>
  ) : (
    <div>
      <InputSistema
        icono={Search}
        label="Buscar persona"
        placeholder="Buscar por nombre, apellido o email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div aria-live="polite">
        {buscando && (
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1">
            Buscando…
          </TextoSistema>
        )}
        {!buscando && query.trim().length >= MIN_QUERY_LENGTH && resultados.length === 0 && (
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1">
            Sin resultados.
          </TextoSistema>
        )}
      </div>
      {resultados.length > 0 && (
        <ul className="mt-2 max-h-[50vh] overflow-auto rounded-md border border-border">
          {resultados.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => {
                  setPersona(u)
                  setResultados([])
                }}
                className="flex w-full flex-col items-start border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="text-sm font-medium">{nombreCompleto(u)}</span>
                {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!buscando && puedeRegistrar && (
        <BotonSistema type="button" variante="ghost" tamaño="sm" className="mt-2" onClick={() => setRegistrando(true)}>
          Registrar persona nueva
        </BotonSistema>
      )}
    </div>
  )

  const pasoEquipo = (
    <div className="grid gap-4">
      <SelectorEquipo
        equipos={equipos}
        valor={equipoId}
        onCambio={(v) => {
          if (v === equipoId) return
          setEquipoId(v)
          setRolId('')
        }}
      />
      <SelectSistema
        label="Rol"
        opciones={rolesDelEquipo.map((r) => ({ valor: r.id, etiqueta: rolLabel(r.label) }))}
        placeholder={equipoId ? 'Elige un rol' : 'Elige primero un equipo'}
        value={rolId}
        onValueChange={setRolId}
        disabled={!equipoId}
      />
    </div>
  )

  const nombrePersona = registrando ? `${datos.nombre} ${datos.apellido}`.trim() : persona ? nombreCompleto(persona) : ''
  const pasoTurno = (
    <div className="grid gap-4">
      {turnos.length > 0 ? (
        <SelectSistema
          label="Turno (opcional)"
          opciones={[{ valor: '', etiqueta: 'Sin turno' }, ...turnos.map((t) => ({ valor: t.id, etiqueta: t.label }))]}
          value={turnoId}
          onValueChange={setTurnoId}
        />
      ) : (
        <TextoSistema variante="sutil" tamaño="sm">
          No hay turnos para elegir; puedes asignarlo luego desde el equipo.
        </TextoSistema>
      )}
      <section aria-labelledby="asignador-resumen" className="rounded-md border border-border p-3">
        <h3 id="asignador-resumen" className="mb-2 text-sm font-medium">
          Resumen
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Persona</dt>
          <dd className="min-w-0 break-words">
            {nombrePersona}
            {registrando && <span className="text-muted-foreground"> (nueva)</span>}
          </dd>
          <dt className="text-muted-foreground">Equipo</dt>
          <dd className="min-w-0 break-words">{equipoElegido ? textoRuta(equipoElegido.ruta) : '—'}</dd>
          <dt className="text-muted-foreground">Rol</dt>
          <dd>{rolElegido ? rolLabel(rolElegido.label) : '—'}</dd>
          <dt className="text-muted-foreground">Turno</dt>
          <dd>{turnoElegido?.label ?? 'Sin turno'}</dd>
        </dl>
      </section>
    </div>
  )

  return (
    <Sheet open={abierto} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="h-dvh w-full max-w-none gap-0 p-0 sm:w-[520px] sm:max-w-[520px]">
        <SheetHeader className="gap-3 border-b border-border pr-12">
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription>Elige a la persona, su equipo y su rol, y opcionalmente su turno.</SheetDescription>
          <IndicadorPasos actual={paso} />
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h3 ref={tituloPasoRef} tabIndex={-1} className="mb-3 text-sm font-semibold focus:outline-none">
            {`Paso ${paso} de ${PASOS.length}: ${tituloPaso}`}
          </h3>
          {paso === 1 && pasoPersona}
          {paso === 1 && !registrando && avisoDuplicado}
          {paso === 2 && pasoEquipo}
          {paso === 3 && pasoTurno}
        </div>

        <div className="sticky bottom-0 grid gap-2 border-t border-border bg-background p-4">
          {pista && (
            <TextoSistema variante="sutil" tamaño="sm" id="asignador-pista">
              {pista}
            </TextoSistema>
          )}
          <div className="flex items-center justify-between gap-2">
            {paso === 1 ? (
              <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onClose}>
                Cancelar
              </BotonSistema>
            ) : (
              <BotonSistema
                type="button"
                variante="outline"
                tamaño="sm"
                icono={ArrowLeft}
                onClick={() => setPaso((p) => (p === 3 ? 2 : 1))}
                disabled={enviando}
              >
                Atrás
              </BotonSistema>
            )}
            {paso < 3 ? (
              <BotonSistema
                type="button"
                tamaño="sm"
                aria-describedby={pista ? 'asignador-pista' : undefined}
                disabled={(paso === 1 ? !pasoUnoListo : !pasoDosListo) || verificando}
                onClick={() => void siguiente()}
              >
                {verificando ? 'Verificando…' : 'Siguiente'}
              </BotonSistema>
            ) : (
              <BotonSistema type="button" tamaño="sm" disabled={enviando} onClick={() => void asignar()}>
                {enviando ? 'Asignando…' : 'Asignar'}
              </BotonSistema>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
