'use client'

/**
 * Dream Team — the "assign a servicio" dialog, shared by
 * /admin/dream-team/servidores (the pool) and /dream-team/mi-equipo.
 *
 * A `Dialog` following SelectLeaderModal.tsx: debounced persona search with
 * `AbortController`, an equipo selector, then a role selector for that equipo.
 * `equipoIdInicial` preselects the equipo each time the dialog opens; the
 * person still picks the role. Creating the servicio POSTs
 * /api/dream-team/servicios (it starts in `postulado`).
 *
 * When the person is not in the system yet, "Registrar persona nueva" swaps
 * the search for RegistrarPersonaForm (T7), which registers and assigns them
 * in one step with the equipo and rol chosen here.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, InputSistema, SelectSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import { rolLabel } from '@/components/dream-team/labels'
import { RegistrarPersonaForm } from '@/components/dream-team/registrar-persona-form'
import type { DreamTeamRol } from '@/lib/platform/dream-team/types'

export interface NodoPlano {
  readonly id: string
  readonly etiqueta: string
}

interface UsuarioResult {
  readonly id: string
  readonly email: string | null
  readonly nombre: string | null
  readonly apellido: string | null
}

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300

function nombreCompleto(u: UsuarioResult): string {
  const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim()
  return nombre.length > 0 ? nombre : (u.email ?? 'Sin nombre')
}

export interface AsignadorServicioDialogProps {
  readonly abierto: boolean
  readonly onClose: () => void
  readonly nodosPlanos: readonly NodoPlano[]
  readonly rolesPorEquipo: Readonly<Record<string, readonly DreamTeamRol[]>>
  readonly onAsignado: () => void
  readonly toast: ReturnType<typeof useNotificaciones>
  /** Equipo preselected every time the dialog opens (e.g. the team selected on Mi equipo). */
  readonly equipoIdInicial?: string
  /** Dialog title; defaults to "Asignar servicio" (the servidores pool wording). */
  readonly titulo?: string
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
}: AsignadorServicioDialogProps): ReactElement {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<UsuarioResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const [persona, setPersona] = useState<UsuarioResult | null>(null)
  const [equipoId, setEquipoId] = useState('')
  const [rolId, setRolId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [registrando, setRegistrando] = useState(false)

  const requestSeqRef = useRef(0)

  useEffect(() => {
    if (!abierto) return
    setQuery('')
    setResultados([])
    setPersona(null)
    setEquipoId(equipoIdInicial ?? '')
    setRolId('')
    setRegistrando(false)
  }, [abierto, equipoIdInicial])

  useEffect(() => {
    if (!abierto) return
    const q = query.trim()
    if (persona || q.length < MIN_QUERY_LENGTH) {
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
  }, [query, persona, abierto])

  const rolesDelNodo = equipoId ? (rolesPorEquipo[equipoId] ?? []) : []

  async function crear(): Promise<void> {
    if (!persona || !equipoId || !rolId || enviando) return
    setEnviando(true)
    try {
      const res = await fetch('/api/dream-team/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, equipoId, rolId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error((body && typeof body.error === 'string' && body.error) || 'No se pudo crear el servicio.')
        return
      }
      toast.success('Servicio asignado correctamente.')
      onAsignado()
    } catch {
      toast.error('No se pudo crear el servicio.')
    } finally {
      setEnviando(false)
    }
  }

  const selectores = (
    <>
      <SelectSistema
        label="Equipo"
        opciones={nodosPlanos.map((n) => ({ valor: n.id, etiqueta: n.etiqueta }))}
        placeholder="Elige un equipo"
        value={equipoId}
        onValueChange={(v) => {
          setEquipoId(v)
          setRolId('')
        }}
      />

      <SelectSistema
        label="Rol"
        opciones={rolesDelNodo.map((r) => ({ valor: r.id, etiqueta: rolLabel(r.label) }))}
        placeholder={equipoId ? 'Elige un rol' : 'Elige primero un equipo'}
        value={rolId}
        onValueChange={setRolId}
        disabled={!equipoId}
      />
    </>
  )

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Busca a la persona, elige el equipo y su rol.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {registrando ? (
            <>
              {selectores}
              <RegistrarPersonaForm
                equipoId={equipoId}
                rolId={rolId}
                toast={toast}
                onCreada={onAsignado}
                onCancelar={() => setRegistrando(false)}
                onElegir={(p) => {
                  setPersona(p)
                  setRegistrando(false)
                }}
              />
            </>
          ) : persona ? (
            <div className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
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
              {resultados.length > 0 && (
                <ul className="mt-2 max-h-56 overflow-auto rounded border border-border">
                  {resultados.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPersona(u)
                          setResultados([])
                        }}
                        className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                      >
                        <span className="text-sm font-medium">{nombreCompleto(u)}</span>
                        {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!buscando && (
                <BotonSistema
                  type="button"
                  variante="ghost"
                  tamaño="sm"
                  className="mt-1"
                  onClick={() => setRegistrando(true)}
                >
                  Registrar persona nueva
                </BotonSistema>
              )}
            </div>
          )}

          {!registrando && selectores}

        </div>

        {!registrando && (
          <div className="mt-4 flex justify-end gap-2">
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onClose}>
            Cancelar
          </BotonSistema>
          <BotonSistema
            type="button"
            tamaño="sm"
            disabled={!persona || !equipoId || !rolId || enviando}
            onClick={() => {
              void crear()
            }}
          >
            {enviando ? 'Creando…' : 'Crear'}
          </BotonSistema>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
