'use client'

/**
 * Estudiantes — the "Año escolar" row of a person detail (C6b4 of
 * odd/tasks/estudiantes-fase-b.md, S16), shared by the leader list and the
 * member view of Grupos. It reads the ficha (año actual, año final, scale of
 * the campus) when it mounts; "Editar" turns the row into two selects (Año
 * actual / Termina el colegio en) with Guardar / Cancelar. On success: toast
 * and refresh, so the header and the list show the new year.
 *
 * Hidden when the database says the person has no school year (The Living
 * Room, `anio_no_aplica`) or the caller cannot read it; a graduate shows the
 * year with no "Editar".
 */
import { useEffect, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'

import { BotonSistema, SelectSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { guardarFicha, leerFicha } from '@/lib/actions/estudiantes-ficha.actions'
import {
  borradorInicial,
  cambiarAnioActual,
  opcionesAnioActual,
  opcionesAnioFinal,
  resumenFicha,
  sinCambios,
  validarFicha,
  type BorradorFicha,
  type FichaEstudiante,
} from '@/lib/platform/estudiantes/ficha'

type Estado =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'oculto' }
  | { readonly tipo: 'error'; readonly mensaje: string }
  | { readonly tipo: 'listo'; readonly ficha: FichaEstudiante }

const SIN_CARGAR = 'No se pudo cargar el año escolar.'

export interface AnioEscolarProps {
  readonly personaId: string
  /** For the toast and the button label. */
  readonly nombre: string
}

export function AnioEscolar({ personaId, nombre }: AnioEscolarProps): ReactElement | null {
  const router = useRouter()
  const toast = useNotificaciones()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  /** `null` while not editing. */
  const [borrador, setBorrador] = useState<BorradorFicha | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    leerFicha(personaId).then(
      (r) => {
        if (!vigente) return
        if (r.ok) setEstado({ tipo: 'listo', ficha: r.data })
        else if (r.codigo === 'anio_no_aplica' || r.codigo === 'sin_autoridad') setEstado({ tipo: 'oculto' })
        else setEstado({ tipo: 'error', mensaje: r.message })
      },
      () => vigente && setEstado({ tipo: 'error', mensaje: SIN_CARGAR }),
    )
    return () => {
      vigente = false
    }
  }, [personaId])

  if (estado.tipo === 'oculto') return null

  if (estado.tipo !== 'listo') {
    return (
      <TarjetaSistema className="p-4" aria-busy={estado.tipo === 'cargando'}>
        <p className="text-xs text-muted-foreground">Año escolar</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{estado.tipo === 'cargando' ? 'Cargando…' : estado.mensaje}</p>
      </TarjetaSistema>
    )
  }

  const { ficha } = estado

  function editar(): void {
    setBorrador(borradorInicial(ficha))
    setError(null)
  }

  function cancelar(): void {
    setBorrador(null)
    setError(null)
  }

  async function guardar(b: BorradorFicha): Promise<void> {
    const v = validarFicha(ficha, b)
    if (!v.ok) {
      setError(v.mensaje)
      return
    }
    setError(null)
    setGuardando(true)
    try {
      const r = await guardarFicha(personaId, v.anioActual, v.anioFinal)
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      setEstado({ tipo: 'listo', ficha: { ...ficha, anioActual: v.anioActual, anioFinal: v.anioFinal } })
      setBorrador(null)
      toast.success(`Año escolar de ${nombre} guardado`)
      router.refresh()
    } catch {
      toast.error('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  if (!borrador) {
    return (
      <TarjetaSistema className="flex min-w-0 items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Año escolar</p>
          <p className="mt-0.5 truncate text-sm font-medium text-foreground">{resumenFicha(ficha)}</p>
        </div>
        {ficha.puedeEditar && (
          <BotonSistema type="button" variante="outline" icono={Pencil} onClick={editar} aria-label={`Editar el año escolar de ${nombre}`}>
            Editar
          </BotonSistema>
        )}
      </TarjetaSistema>
    )
  }

  return (
    <TarjetaSistema className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">Año escolar</p>
      <SelectSistema
        label="Año actual"
        placeholder="Elige el año"
        opciones={opcionesAnioActual(ficha)}
        value={borrador.anioActual}
        onValueChange={(valor) => setBorrador(cambiarAnioActual(ficha, borrador, valor))}
        disabled={guardando}
      />
      <SelectSistema
        label="Termina el colegio en"
        placeholder="Elige el año"
        opciones={opcionesAnioFinal(ficha, borrador.anioActual)}
        value={borrador.anioFinal}
        onValueChange={(valor) => setBorrador({ ...borrador, anioFinal: valor })}
        error={error ?? undefined}
        disabled={guardando}
      />
      <div className="grid grid-cols-2 gap-2">
        <BotonSistema type="button" variante="outline" onClick={cancelar} disabled={guardando}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="button" cargando={guardando} disabled={guardando || sinCambios(ficha, borrador)} onClick={() => void guardar(borrador)}>
          Guardar
        </BotonSistema>
      </div>
    </TarjetaSistema>
  )
}
