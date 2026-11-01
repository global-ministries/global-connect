'use client'

/**
 * Niños › Check-in — the family at the mesa (prototype 01 `.familia`):
 * parents, the children already marked with their salón, who may pick up,
 * and "Registrar ingreso · N niños". Nothing marked disables the button
 * ("Marca al menos un niño").
 */
import type { ReactElement } from 'react'

import { BotonSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { quienesRetiran, type Ingresados, type OcupacionSalon, type SalonDeHijo } from '@/lib/platform/ninos/checkin-vista'
import type { FamiliaEncontrada, HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'

import { FilaHijo } from './fila-hijo'
import { Avatar, PuedenRetirar } from './partes'

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

export interface TarjetaFamiliaProps {
  readonly familia: FamiliaEncontrada
  readonly fecha: string
  readonly salones: readonly SalonFila[]
  readonly ocupacion: ReadonlyMap<string, OcupacionSalon>
  readonly ingresados: Ingresados
  readonly marcados: ReadonlySet<string>
  readonly selectores: ReadonlySet<string>
  readonly salonDe: (h: HijoEncontrado) => SalonDeHijo
  readonly error: string | null
  readonly guardando: boolean
  readonly puedeRegistrar: boolean
  /** Shown when the search found several families. */
  readonly onOtraFamilia?: () => void
  readonly onMarcar: (hijoId: string, marcado: boolean) => void
  readonly onAbrirSelector: (hijoId: string) => void
  readonly onSalon: (hijoId: string, salonId: string) => void
  readonly onCompletar: (h: HijoEncontrado) => void
  readonly onRegistrar: () => void
}

export function TarjetaFamilia(p: TarjetaFamiliaProps): ReactElement {
  const { familia } = p
  const n = p.marcados.size
  const retiran = quienesRetiran(familia.padres, familia.hijos)
  const titulo = familia.padres.map((x) => `${x.nombre} ${x.apellido}`).join(' · ') || `${familia.nombre} ${familia.apellido}`

  return (
    <TarjetaSistema className="grid min-w-0 gap-3.5 p-4 md:p-5" aria-label={`Familia de ${titulo}`} role="region">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar nombre={familia.nombre} apellido={familia.apellido} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-foreground">{titulo}</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            <span className="font-mono tabular-nums">{familia.hijos.length}</span> {palabra(familia.hijos.length, 'niño', 'niños')}
          </p>
        </div>
        {p.onOtraFamilia && (
          <BotonSistema type="button" variante="ghost" tamaño="sm" className="pointer-coarse:min-h-11" onClick={p.onOtraFamilia}>
            Otra familia
          </BotonSistema>
        )}
      </div>

      {familia.hijos.length === 0 ? (
        <TextoSistema variante="sutil" tamaño="sm">
          Esta familia no tiene niños registrados.
        </TextoSistema>
      ) : (
        <ul aria-label="Niños de la familia" className="min-w-0 rounded-xl border border-border">
          {familia.hijos.map((h) => (
            <FilaHijo
              key={h.id}
              hijo={h}
              fecha={p.fecha}
              salones={p.salones}
              salon={p.salonDe(h)}
              ocupacion={p.ocupacion}
              codigo={p.ingresados[h.id]}
              marcado={p.marcados.has(h.id)}
              selectorAbierto={p.selectores.has(h.id)}
              onMarcar={(v) => p.onMarcar(h.id, v)}
              onAbrirSelector={() => p.onAbrirSelector(h.id)}
              onSalon={(v) => p.onSalon(h.id, v)}
              onCompletar={() => p.onCompletar(h)}
            />
          ))}
        </ul>
      )}

      <PuedenRetirar personas={retiran} />

      {p.error && (
        <p role="alert" className="text-sm text-danger-text">
          {p.error}
        </p>
      )}

      {familia.hijos.length > 0 && (
        <BotonSistema
          type="button"
          tamaño="lg"
          className="w-full"
          cargando={p.guardando}
          disabled={p.guardando || !p.puedeRegistrar || n === 0}
          onClick={p.onRegistrar}
        >
          {p.guardando ? 'Registrando…' : n === 0 ? 'Marca al menos un niño' : `Registrar ingreso · ${n} ${palabra(n, 'niño', 'niños')}`}
        </BotonSistema>
      )}
    </TarjetaSistema>
  )
}
