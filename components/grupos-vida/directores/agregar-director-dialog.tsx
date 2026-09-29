'use client'

/**
 * Directores — the "Agregar director general" dialog (admin and pastor).
 *
 * Two steps in one dialog: search a person by name (debounced, server action,
 * people who already are general directors are left out), then choose "Todos
 * los segmentos" (one row per existing segment, scope `segmento`) or pick the
 * segments. The role is added first and never replaces the person's other
 * roles; if the segments then fail, the person stays as a general director and
 * the error says so.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { asignarSegmentoDG } from '@/lib/actions/dg-segmentos.actions'
import {
  agregarDirectorGeneral,
  asignarTodosLosSegmentosDG,
  buscarPersonasParaDirectorGeneral,
  type PersonaBuscada,
} from '@/lib/actions/gdv-directores.actions'
import { cn } from '@/lib/utils'
import type { SegmentoEntrada } from '@/lib/platform/grupos-vida/directores-vista'
import { ANILLO } from './franja-por-ordenar'

export interface AgregarDirectorDialogProps {
  readonly abierto: boolean
  readonly onClose: () => void
  readonly segmentos: readonly SegmentoEntrada[]
}

const MIN_BUSQUEDA = 2
const RETRASO_MS = 300

type Modo = 'todos' | 'elegir'

const BOTON_BASE = cn(
  'inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  ANILLO,
)

export function AgregarDirectorDialog({ abierto, onClose, segmentos }: AgregarDirectorDialogProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<readonly PersonaBuscada[]>([])
  const [buscando, setBuscando] = useState(false)
  const [persona, setPersona] = useState<PersonaBuscada | null>(null)
  const [modo, setModo] = useState<Modo>('todos')
  const [elegidos, setElegidos] = useState<readonly string[]>([])
  const [guardando, setGuardando] = useState(false)
  const secuencia = useRef(0)

  useEffect(() => {
    if (!abierto) return
    setTexto('')
    setResultados([])
    setPersona(null)
    setModo('todos')
    setElegidos([])
    setGuardando(false)
  }, [abierto])

  useEffect(() => {
    const consulta = texto.trim()
    if (!abierto || persona || consulta.length < MIN_BUSQUEDA) {
      setResultados([])
      setBuscando(false)
      return
    }
    const actual = ++secuencia.current
    setBuscando(true)
    const temporizador = setTimeout(() => {
      void (async () => {
        try {
          const res = await buscarPersonasParaDirectorGeneral(consulta)
          if (actual === secuencia.current) setResultados(res.success ? (res.data ?? []) : [])
        } catch {
          if (actual === secuencia.current) setResultados([])
        } finally {
          if (actual === secuencia.current) setBuscando(false)
        }
      })()
    }, RETRASO_MS)
    return () => clearTimeout(temporizador)
  }, [texto, persona, abierto])

  const puedeAgregar = !!persona && !guardando && (modo === 'todos' || elegidos.length > 0)

  async function agregar(): Promise<void> {
    if (!persona || !puedeAgregar) return
    setGuardando(true)
    try {
      const rol = await agregarDirectorGeneral(persona.id)
      if (!rol.success) {
        toast.error(rol.error || 'No se pudo agregar al director general.')
        return
      }

      let error: string | undefined
      if (modo === 'todos') {
        const res = await asignarTodosLosSegmentosDG(persona.id)
        if (!res.success) error = res.error
      } else {
        for (const segmentoId of elegidos) {
          const res = await asignarSegmentoDG({ usuarioId: persona.id, segmentoId })
          if (!res.success && res.error !== 'Ya asignado') {
            error = res.error
            break
          }
        }
      }

      router.refresh()
      if (error !== undefined) {
        toast.error(`${persona.nombre} ya es director general, pero no se pudieron asignar los segmentos: ${error || 'error desconocido'}`)
        onClose()
        return
      }
      toast.success(`${persona.nombre} ahora es director general.`)
      onClose()
    } catch {
      toast.error('No se pudo agregar al director general.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar director general</DialogTitle>
          <DialogDescription>Busca a la persona y elige qué segmentos administra. Conserva los roles que ya tiene.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {persona ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <div className="min-w-0">
                <TextoSistema className="truncate font-medium">{persona.nombre}</TextoSistema>
                {persona.roles.length > 0 && (
                  <TextoSistema variante="sutil" tamaño="sm">
                    {persona.roles.join(', ')}
                  </TextoSistema>
                )}
              </div>
              <button
                type="button"
                disabled={guardando}
                onClick={() => setPersona(null)}
                className={cn(BOTON_BASE, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div>
              <InputSistema
                type="search"
                icono={Search}
                label="Buscar persona"
                placeholder="Nombre o apellido"
                autoComplete="off"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              {buscando && (
                <TextoSistema variante="sutil" tamaño="sm" className="mt-1">
                  Buscando…
                </TextoSistema>
              )}
              {!buscando && texto.trim().length >= MIN_BUSQUEDA && resultados.length === 0 && (
                <TextoSistema variante="sutil" tamaño="sm" className="mt-1">
                  Sin resultados.
                </TextoSistema>
              )}
              {resultados.length > 0 && (
                <ul className="mt-2 max-h-56 overflow-auto rounded-xl border border-border">
                  {resultados.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPersona(r)
                          setResultados([])
                        }}
                        className="flex min-h-[44px] w-full flex-col items-start justify-center px-3 py-2 text-left hover:bg-accent"
                      >
                        <span className="text-sm font-medium text-foreground">{r.nombre}</span>
                        {r.roles.length > 0 && <span className="text-xs text-muted-foreground">{r.roles.join(', ')}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {persona && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Segmentos</legend>
              {(
                [
                  ['todos', 'Todos los segmentos'],
                  ['elegir', 'Elegir segmentos'],
                ] as const
              ).map(([valor, etiqueta]) => (
                <label key={valor} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5">
                  <input
                    type="radio"
                    name="modo-segmentos"
                    checked={modo === valor}
                    onChange={() => setModo(valor)}
                    className="h-5 w-5 accent-[var(--brand-primary)]"
                  />
                  <span className="text-sm text-foreground">{etiqueta}</span>
                </label>
              ))}
              {modo === 'elegir' && (
                <div className="grid gap-2 pl-2">
                  {segmentos.map((segmento) => (
                    <label key={segmento.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5">
                      <input
                        type="checkbox"
                        checked={elegidos.includes(segmento.id)}
                        onChange={() =>
                          setElegidos((actuales) =>
                            actuales.includes(segmento.id) ? actuales.filter((id) => id !== segmento.id) : [...actuales, segmento.id],
                          )
                        }
                        className="h-5 w-5 accent-[var(--brand-primary)]"
                      />
                      <span className="text-sm text-foreground">{segmento.nombre}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={cn(BOTON_BASE, 'border border-border text-foreground hover:bg-accent')}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={!puedeAgregar}
              onClick={() => void agregar()}
              className={cn(BOTON_BASE, 'bg-[var(--brand-primary)] text-white hover:opacity-90')}
            >
              {guardando ? 'Agregando…' : 'Agregar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
