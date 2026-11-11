'use client'

/**
 * R3b (odd/tasks/talleres-rediseno.md, S5) — «Crear temporada» inside a
 * `DetalleResponsivo` (artboards design/talleres-interior/26 `#crear` and 27
 * `#crear`), replacing the /talleres/temporadas/crear page form. Same rules
 * and the same server action (`createTemporada` → talleres_crear_temporada):
 * pick a dirección (preselected when only one), name, apertura and cierre,
 * and the checklist of that dirección's talleres (régimen=temporada checked by
 * default, régimen=cadencia shown disabled: they open by their own cadencia).
 *
 * «Editar» (name and dates) of the artboards is NOT here: no existing action
 * or RPC updates a temporada's name or dates (only its estado), and this
 * slice adds no migrations.
 */

import { useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { CalendarRange, Plus } from 'lucide-react'

import { BotonSistema, CamposSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { createTemporada } from '@/app/(auth)/talleres/temporadas/actions'
import type { TallerParaTemporada } from '@/lib/platform/talleres/temporadas'

import { formatearFecha, plural } from './vista-temporadas'

export interface DireccionParaCrear {
  readonly id: string
  readonly label: string
  readonly talleres: readonly TallerParaTemporada[]
}

interface Props {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly direcciones: readonly DireccionParaCrear[]
  /** Called with the new temporada's id once it exists. */
  readonly onCreada: (temporadaId: string) => void
}

const ID_FORMULARIO = 'formulario-crear-temporada'

function porTemporada(talleres: readonly TallerParaTemporada[]): Set<string> {
  return new Set(talleres.filter((t) => t.regimen === 'temporada').map((t) => t.id))
}

export function FormularioTemporada({ abierto, onCambioAbierto, direcciones, onCreada }: Props): ReactElement {
  const toast = useNotificaciones()
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [direccionId, setDireccionId] = useState(direcciones.length === 1 ? direcciones[0]!.id : '')
  const [nombre, setNombre] = useState('')
  const [apertura, setApertura] = useState('')
  const [cierre, setCierre] = useState('')
  const direccion = direcciones.find((d) => d.id === direccionId) ?? null
  const [seleccionados, setSeleccionados] = useState<Set<string>>(() => porTemporada(direccion?.talleres ?? []))

  function elegirDireccion(id: string): void {
    setDireccionId(id)
    setSeleccionados(porTemporada(direcciones.find((d) => d.id === id)?.talleres ?? []))
  }

  function alternar(id: string, marcado: boolean): void {
    setSeleccionados((previos) => {
      const siguientes = new Set(previos)
      if (marcado) siguientes.add(id)
      else siguientes.delete(id)
      return siguientes
    })
  }

  const listo = !pendiente && direccionId !== '' && nombre.trim().length >= 2 && apertura !== '' && cierre !== ''

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault()
    if (!listo) return
    setError(null)
    startTransition(async () => {
      const resultado = await createTemporada({
        equipoId: direccionId,
        nombre: nombre.trim(),
        fecha_apertura: apertura,
        fecha_cierre: cierre,
        tallerIds: Array.from(seleccionados),
      })
      if (resultado.ok && resultado.temporadaId) {
        const n = resultado.edicionesCreadas ?? 0
        toast.success(`Creamos «${nombre.trim()}» en borrador con ${n} ${plural(n, 'edición', 'ediciones')}.`)
        setNombre('')
        setApertura('')
        setCierre('')
        onCreada(resultado.temporadaId)
      } else if (!resultado.ok) {
        setError(resultado.message ?? 'No se pudo crear la temporada.')
      }
    })
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onCambioAbierto}
      titulo="Crear temporada"
      descripcion="Agrupa qué talleres abren inscripción a la vez en una dirección."
      pie={
        <div className="flex w-full items-center justify-end gap-2">
          <BotonSistema type="button" variante="outline" onClick={() => onCambioAbierto(false)}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={ID_FORMULARIO} icono={Plus} cargando={pendiente} disabled={!listo}>
            Crear temporada
          </BotonSistema>
        </div>
      }
    >
      <form id={ID_FORMULARIO} onSubmit={enviar} className="grid gap-5">
        <SelectSistema
          label="Dirección"
          value={direccionId}
          onValueChange={elegirDireccion}
          placeholder="Elige una dirección"
          opciones={direcciones.map((d) => ({ valor: d.id, etiqueta: d.label }))}
        />
        <div className="grid gap-1.5">
          <InputSistema
            label="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
            aria-describedby="nombre-temporada-ayuda"
          />
          <p id="nombre-temporada-ayuda" className="text-xs text-muted-foreground">
            Ej. Temporada 2027-II. Así la ve el equipo en el catálogo y en los reportes.
          </p>
        </div>
        <CamposSistema>
          <InputSistema label="Fecha de apertura" type="date" value={apertura} onChange={(e) => setApertura(e.target.value)} />
          <InputSistema label="Fecha de cierre" type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} />
        </CamposSistema>

        {direccion && (
          <fieldset className="grid min-w-0 gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">Talleres que abren en esta temporada</legend>
            {direccion.talleres.length === 0 ? (
              <p className="text-sm text-muted-foreground">Esta dirección todavía no tiene talleres.</p>
            ) : (
              direccion.talleres.map((taller) => {
                const porTemporadaTaller = taller.regimen === 'temporada'
                return (
                  <label
                    key={taller.id}
                    className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-border p-3 has-[:disabled]:text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={porTemporadaTaller && seleccionados.has(taller.id)}
                      disabled={!porTemporadaTaller}
                      onChange={(e) => alternar(taller.id, e.target.checked)}
                      className="focus-ring size-5 shrink-0 accent-[var(--brand-strong)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{taller.nombre}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {porTemporadaTaller ? taller.nodoLabel : 'Abre por su propia cadencia'}
                      </span>
                    </span>
                  </label>
                )
              })
            )}
          </fieldset>
        )}

        {direccion && apertura && (
          <p className="text-sm text-muted-foreground">
            Se crearán <strong className="font-mono font-semibold text-foreground tabular-nums">{seleccionados.size}</strong>{' '}
            {plural(seleccionados.size, 'edición', 'ediciones')} con primera clase el{' '}
            <strong className="font-semibold text-foreground">{formatearFecha(apertura)}</strong>. Después ajustas hora, lugar
            y cupo en cada una.
          </p>
        )}

        <AvisoFormulario tono="marca" className="flex items-start gap-2">
          <CalendarRange aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Se crea en <strong>borrador</strong>. La abres cuando sus ediciones estén listas.
          </span>
        </AvisoFormulario>

        {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      </form>
    </DetalleResponsivo>
  )
}
