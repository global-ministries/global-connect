'use client'

/**
 * "Agregar familiar" (S15 decisions 2–4; prototype `renderHoja`): one sheet,
 * a side panel from md and a bottom sheet below (DetalleResponsivo). The
 * relation comes first; hijo/hija asks "Ir a Mis hijos" or "Tiene 13 años o
 * más"; then "Sí, buscarlo" or "No tiene cuenta". Once a path is chosen the
 * relation is summarized with "Cambiar".
 */
import { AlertCircle, Search, UserPlus, UserRound } from 'lucide-react'
import type { ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { RELACIONES_FAMILIA, etiquetaTipo, type CaminoHoja } from '@/lib/platform/usuarios/familia-vista'
import { cn } from '@/lib/utils'

import { CLASE_PULSADO, PasoBuscar } from './paso-buscar'
import { PasoSinCuenta } from './paso-sin-cuenta'
import type { HojaFamiliar } from './use-hoja-familiar'

const CAMINOS: readonly { valor: CaminoHoja; titulo: string; texto: string; icono: typeof Search }[] = [
  { valor: 'buscar', titulo: 'Sí, buscarlo', texto: 'Por su nombre, en tu campus', icono: Search },
  { valor: 'sincuenta', titulo: 'No tiene cuenta', texto: 'Lo agregas con sus datos básicos', icono: UserPlus },
]

const Paso = ({ id, children }: { readonly id: string; readonly children: string }) => (
  <p id={id} className="text-[13px] font-medium text-muted-foreground">{children}</p>
)

export interface HojaAgregarFamiliarProps {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly h: HojaFamiliar
  readonly campus: string | null
  readonly hoy: string
  readonly onIrAMisHijos: () => void
}

export function HojaAgregarFamiliar({ abierto, onCambioAbierto, h, campus, hoy, onIrAMisHijos }: HojaAgregarFamiliarProps): ReactElement {
  const conCamino = h.paso === 'buscar' || h.paso === 'sincuenta'
  const pie = conCamino ? (
    <>
      <BotonSistema type="button" variante="outline" onClick={() => onCambioAbierto(false)}>
        Cancelar
      </BotonSistema>
      <BotonSistema type="button" cargando={h.enviando} disabled={!h.puedeEnviar} onClick={() => void h.enviar()}>
        {h.paso === 'sincuenta' ? 'Enviar para revisión' : 'Enviar solicitud'}
      </BotonSistema>
    </>
  ) : undefined

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onCambioAbierto}
      titulo="Agregar familiar"
      descripcion="Queda pendiente hasta que la otra persona o tu campus lo confirme"
      pie={pie}
    >
      <div className="grid gap-4">
        <Paso id="mf-p-rel">1 · ¿Qué es para ti?</Paso>
        {conCamino && h.relacion ? (
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <span className="min-w-0 flex-1 text-[15px] font-semibold text-foreground">{etiquetaTipo(h.relacion)}</span>
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={h.cambiarRelacion} aria-label="Cambiar la relación">
              Cambiar
            </BotonSistema>
          </div>
        ) : (
          <div role="group" aria-labelledby="mf-p-rel" className="grid grid-cols-2 gap-2">
            {RELACIONES_FAMILIA.map((r) => (
              <BotonSistema
                key={r.valor}
                type="button"
                variante="outline"
                aria-pressed={h.relacion === r.valor}
                onClick={() => h.elegirRelacion(r.valor)}
                className={cn('justify-start text-[15px]', CLASE_PULSADO)}
              >
                {r.etiqueta}
              </BotonSistema>
            ))}
          </div>
        )}

        {h.paso === 'hijo' && (
          <AvisoFormulario tono="info" className="flex items-start gap-3">
            <UserRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info-text" />
            <div>
              <p className="font-semibold">¿Tiene menos de 13 años?</p>
              <p className="mt-0.5 text-muted-foreground">
                Regístralo en Mis hijos: ahí van sus datos de Niños (alergias, quién puede retirarlo) y queda listo para el domingo.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <BotonSistema type="button" tamaño="sm" icono={UserRound} onClick={onIrAMisHijos}>
                  Ir a Mis hijos
                </BotonSistema>
                <BotonSistema type="button" variante="outline" tamaño="sm" onClick={h.confirmarHijoMayor}>
                  Tiene 13 años o más
                </BotonSistema>
              </div>
            </div>
          </AvisoFormulario>
        )}

        {h.relacion && h.paso !== 'hijo' && (
          <>
            <Paso id="mf-p-cam">2 · ¿Tiene cuenta en Global Connect?</Paso>
            <div role="group" aria-labelledby="mf-p-cam" className="grid gap-2 sm:grid-cols-2">
              {CAMINOS.map((c) => (
                <BotonSistema
                  key={c.valor}
                  type="button"
                  variante="outline"
                  icono={c.icono}
                  aria-pressed={h.camino === c.valor}
                  onClick={() => h.elegirCamino(c.valor)}
                  className={cn('h-auto min-h-16 justify-start gap-3 px-3.5 py-2.5 text-left', CLASE_PULSADO)}
                >
                  <span className="grid gap-0.5">
                    <span className="text-[15px] font-semibold">{c.titulo}</span>
                    <span className="text-[13px] font-normal text-muted-foreground">{c.texto}</span>
                  </span>
                </BotonSistema>
              ))}
            </div>
          </>
        )}

        {h.paso === 'buscar' && <PasoBuscar h={h} campus={campus} />}
        {h.paso === 'sincuenta' && <PasoSinCuenta h={h} hoy={hoy} onIrAMisHijos={onIrAMisHijos} />}

        {h.error && (
          <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-[1.35] text-danger-text">
            <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
            <span>{h.error}</span>
          </p>
        )}
      </div>
    </DetalleResponsivo>
  )
}
