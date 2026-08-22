"use client"

/**
 * Cimiento 4 — Assign servicio form (client card).
 *
 * Lets a director/admin assign a persona as coordinador of an
 * abstract taller. Searches usuarios via the admin search endpoint, then
 * calls the `assignServicio` server action, which activates a dream_team
 * servicio (estado='activo') on the taller's equipo. The capability
 * auto-grant trigger materializes the scoped grants.
 *
 * When the taller has no equipo yet (equipoId === null) the card is purely
 * informational: the equipo is minted when the first edición is opened.
 */

import { useEffect, useRef, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Send, UserPlus, X } from 'lucide-react'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { assignServicio } from './actions'

interface UsuarioResult {
  readonly id: string
  readonly email: string | null
  readonly nombre: string | null
  readonly apellido: string | null
  readonly auth_id: string | null
}

interface Input {
  readonly tallerId: string
  /** The taller's single dream_team equipo. `null` ⇒ no equipo yet. */
  readonly equipoId: string | null
  /** Roles seeded on the equipo (filtered to coordinador). */
  readonly roles: ReadonlyArray<{ readonly id: string; readonly label: string }>
}

type AssignRol = 'coordinador' | 'director'

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300

const ROLE_LABELS: Record<AssignRol, string> = {
  coordinador: 'Coordinador',
  director: 'Director (del taller)',
}

function nombreCompleto(u: UsuarioResult): string {
  const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim()
  return nombre.length > 0 ? nombre : (u.email ?? 'Sin nombre')
}

export function AssignServicioForm({ tallerId, equipoId, roles }: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UsuarioResult[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<UsuarioResult | null>(null)
  const [rol, setRol] = useState<AssignRol>('coordinador')

  const requestSeqRef = useRef(0)

  // Debounced search — skipped once a persona is picked.
  useEffect(() => {
    const q = query.trim()
    if (picked || q.length < MIN_QUERY_LENGTH) {
      setResults([])
      setSearching(false)
      return
    }

    const seq = ++requestSeqRef.current
    const controller = new AbortController()
    setSearching(true)

    async function runSearch(): Promise<void> {
      try {
        const res = await fetch(
          `/api/talleres/admin/usuarios/buscar?q=${encodeURIComponent(q)}`,
          { cache: 'no-store', signal: controller.signal },
        )
        if (!res.ok) throw new Error('search failed')
        const data = (await res.json()) as UsuarioResult[]
        if (seq === requestSeqRef.current) setResults(data)
      } catch {
        if (seq === requestSeqRef.current) setResults([])
      } finally {
        if (seq === requestSeqRef.current) setSearching(false)
      }
    }

    const timer = setTimeout(() => {
      void runSearch()
    }, DEBOUNCE_MS)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, picked])

  const availableRoles = (['coordinador'] as const).filter((r) =>
    roles.some((role) => role.label === r),
  )

  function submit(): void {
    if (!picked || pending) return
    setError(null)
    setSuccess(null)
    const persona = picked
    startTransition(async () => {
      const result = await assignServicio({
        taller_id: tallerId,
        persona_id: persona.id,
        rol,
      })
      if (result.ok) {
        const label = ROLE_LABELS[rol]
        setSuccess(
          result.already
            ? `${nombreCompleto(persona)} ya estaba asignado como ${label}.`
            : `${nombreCompleto(persona)} fue asignado como ${label}.`,
        )
        setPicked(null)
        setQuery('')
        setResults([])
        router.refresh()
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  // No equipo yet → informational card, no form.
  if (equipoId === null) {
    return (
      <TarjetaSistema variante="outlined" className="p-5">
        <TextoSistema className="text-lg font-medium">
          Asignar coordinador
        </TextoSistema>
        <TextoSistema variante="sutil" className="mt-1 block text-sm">
          Este taller todavía no tiene equipo. Abrí una edición primero: al abrir
          la primera edición se crea el equipo del taller y después vas a poder
          asignar coordinadores acá.
        </TextoSistema>
      </TarjetaSistema>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
      >
        <UserPlus className="h-4 w-4" /> Asignar coordinador
      </button>
    )
  }

  return (
    <TarjetaSistema variante="elevated" className="p-5">
      <TextoSistema className="text-lg font-medium">
        Asignar coordinador
      </TextoSistema>
      <TextoSistema variante="sutil" className="mt-1 block text-sm">
        Buscá a la persona y confirmá. El coordinador queda al mando de este taller.
      </TextoSistema>

      <div className="mt-4 grid gap-4">
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded border px-3 py-2">
            <div className="min-w-0">
              <TextoSistema className="block truncate font-medium">
                {nombreCompleto(picked)}
              </TextoSistema>
              {picked.email && (
                <TextoSistema variante="sutil" className="block truncate text-sm">
                  {picked.email}
                </TextoSistema>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setPicked(null)
                setSuccess(null)
              }}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm"
            >
              <X className="h-4 w-4" /> Cambiar
            </button>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Persona *</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded border px-3 py-2 pl-8"
                placeholder="Buscar por nombre, apellido o email…"
              />
            </div>
            {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Escribí al menos {MIN_QUERY_LENGTH} caracteres.
              </span>
            )}
            {searching && (
              <span className="mt-1 block text-xs text-muted-foreground">Buscando…</span>
            )}
            {!searching && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Sin resultados.
              </span>
            )}
            {results.length > 0 && (
              <ul className="mt-2 max-h-56 overflow-auto rounded border">
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(u)
                        setResults([])
                        setError(null)
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                    >
                      <span className="font-medium">{nombreCompleto(u)}</span>
                      {u.email && (
                        <span className="text-sm text-muted-foreground">{u.email}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Rol *</span>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as AssignRol)}
            className="w-full rounded border px-3 py-2"
          >
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded border border-green-300 bg-green-50 p-2 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
            setSuccess(null)
          }}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!picked || pending}
          className="inline-flex items-center gap-1 rounded bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {pending ? 'Asignando…' : 'Asignar'}
        </button>
      </div>
    </TarjetaSistema>
  )
}
