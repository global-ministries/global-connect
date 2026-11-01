'use client'

/**
 * Niños › Check-in — LLEGANDO, the first section of the desk
 * (prototype 01 `.cola-item`): who said "Voy en camino", first notice on
 * top, each child already marked with its suggested salón and alerts.
 * "Llegaron" checks the family in through the usual path in one tap; a full
 * salón warns ("Lleno 12/12") and "Cambiar" opens the family at the mesa to
 * pick another one. A QR pre-registration has no ficha yet: "Revisar" opens
 * its review.
 */
import { useState, type ReactElement } from 'react'
import { Car, Check, QrCode } from 'lucide-react'

import { BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { alertasDeHijo } from '@/lib/platform/ninos/checkin'
import { edadCorta, estadoCupo, salonDeHijo, type ItemCola, type OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import type { FamiliaLlegando, PreregistroLlegando } from '@/lib/platform/ninos/precheck'

import { Alertas } from './alertas'
import { Avatar, CLASE_LINEA_INSET, EtiquetaLleno, ListaInset, TituloSeccion } from './partes'

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

export interface ColaLlegandoProps {
  readonly cola: readonly ItemCola[]
  readonly salones: readonly SalonFila[]
  readonly fecha: string
  readonly ocupacion: ReadonlyMap<string, OcupacionSalon>
  /** Checks the family in; resolves to an error message, or null when done. */
  readonly onLlegaron: (f: FamiliaLlegando) => Promise<string | null>
  /** Opens the family at the mesa to change a child's salón. */
  readonly onCambiarSalon: (f: FamiliaLlegando, hijoId: string) => void
  /** Opens the review of a QR pre-registration on its way. */
  readonly onRevisar: (preregistroId: string) => void
}

function ItemFamilia({ f, props }: { readonly f: FamiliaLlegando; readonly props: ColaLlegandoProps }): ReactElement {
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nombre = `${f.padre.nombre} ${f.padre.apellido}`.trim()
  const avisado = horaEnCaracas(f.avisadoAt || null)
  const n = f.hijos.length

  async function llegaron() {
    setProcesando(true)
    setError(null)
    const e = await props.onLlegaron(f)
    setProcesando(false)
    if (e) setError(e)
  }

  return (
    <li data-testid={`llegando-${f.padre.id}`} className={`${CLASE_LINEA_INSET} grid min-w-0 gap-2.5 px-3.5 pt-3 pb-3.5`}>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar nombre={f.padre.nombre} apellido={f.padre.apellido} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-foreground">{nombre}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
            {avisado && (
              <>
                Avisó a las <span className="font-mono tabular-nums">{avisado}</span> ·{' '}
              </>
            )}
            {n} {palabra(n, 'niño', 'niños')}
          </span>
        </span>
        <BotonSistema
          type="button"
          tamaño="sm"
          className="shrink-0 pointer-coarse:min-h-11"
          aria-label={`Llegaron: ${nombre}, ${n} ${palabra(n, 'niño', 'niños')}`}
          disabled={procesando}
          onClick={() => void llegaron()}
        >
          {procesando ? 'Registrando…' : 'Llegaron'}
        </BotonSistema>
      </div>
      <ul className="grid min-w-0 gap-2 pl-[52px]">
        {f.hijos.map((h) => {
          const salon = salonDeHijo(h, props.salones, props.fecha)
          const nombreSalon = props.salones.find((s) => s.id === salon.salonId)?.nombre
          const cupo = salon.salonId ? props.ocupacion.get(salon.salonId) : undefined
          const lleno = cupo !== undefined && estadoCupo(cupo.presentes, cupo.capacidad) === 'lleno'
          const edad = edadCorta(h.fecha_nacimiento, props.fecha)
          return (
            <li key={h.id} className="grid min-w-0 gap-1 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <Check aria-hidden="true" className="size-4 shrink-0 text-success-text" strokeWidth={2.4} />
                <b className="truncate font-medium text-foreground">
                  {h.nombre} {h.apellido}
                </b>
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                <span className="min-w-0 truncate">{[nombreSalon ?? 'Sin salón sugerido', edad].filter(Boolean).join(' · ')}</span>
                {lleno && cupo && <EtiquetaLleno ocupacion={cupo} />}
                {(lleno || !salon.salonId) && (
                  <BotonSistema
                    type="button"
                    variante="ghost"
                    tamaño="sm"
                    className="ml-auto pointer-coarse:min-h-11"
                    aria-label={`Cambiar salón de ${h.nombre} ${h.apellido}`}
                    onClick={() => props.onCambiarSalon(f, h.id)}
                  >
                    Cambiar
                  </BotonSistema>
                )}
              </span>
              {h.desde_casa && (
                <span>
                  <BadgeSistema variante="info" tamaño="sm">
                    Registrado desde casa
                  </BadgeSistema>
                </span>
              )}
              <Alertas alertas={alertasDeHijo(h)} />
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </li>
  )
}

function ItemPreregistro({ p, onRevisar }: { readonly p: PreregistroLlegando; readonly onRevisar: (id: string) => void }): ReactElement {
  const nombre = `${p.padre.nombre} ${p.padre.apellido}`.trim()
  const avisado = horaEnCaracas(p.avisadoAt || null)
  return (
    <li data-testid={`llegando-pre-${p.preregistroId}`} className={`${CLASE_LINEA_INSET} grid min-w-0 gap-2.5 px-3.5 pt-3 pb-3.5`}>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar nombre={p.padre.nombre} apellido={p.padre.apellido} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-foreground">{nombre}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            <BadgeSistema variante="info" tamaño="sm" className="gap-1">
              <QrCode aria-hidden="true" className="size-3" />
              Pre-registro QR
            </BadgeSistema>
            {avisado && (
              <span>
                Avisó <span className="font-mono tabular-nums">{avisado}</span>
              </span>
            )}
          </span>
        </span>
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          className="shrink-0 pointer-coarse:min-h-11"
          aria-label={`Revisar registro: ${nombre}`}
          onClick={() => onRevisar(p.preregistroId)}
        >
          Revisar
        </BotonSistema>
      </div>
      <ul className="grid min-w-0 gap-2 pl-[52px]">
        {p.hijos.map((h, i) => (
          <li key={i} className="grid min-w-0 gap-1 text-sm">
            <b className="truncate font-medium text-foreground">
              {h.nombre} {h.apellido}
            </b>
            <span className="text-[13px] text-muted-foreground">Sin ficha todavía · confirma sus datos al revisar</span>
            <Alertas alertas={h.alertas} />
          </li>
        ))}
      </ul>
    </li>
  )
}

export function ColaLlegando(props: ColaLlegandoProps): ReactElement {
  const { cola } = props
  return (
    <section aria-label="Llegando" className="grid min-w-0 gap-2">
      <TituloSeccion
        id="checkin-llegando"
        texto="Llegando"
        cantidad={cola.length}
        etiquetaCantidad={`${cola.length} ${palabra(cola.length, 'familia', 'familias')}`}
        pista="Avisaron «Voy en camino»"
      />
      {cola.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card">
          <EstadoVacioSistema
            icono={Car}
            className="py-8"
            titulo="Nadie en camino por ahora"
            subtitulo="Cuando una familia toque «Voy en camino», aparece aquí con sus niños listos. Mientras, busca por teléfono o nombre."
          />
        </div>
      ) : (
        <ListaInset etiqueta="Familias en camino">
          {cola.map((item) =>
            item.tipo === 'familia' ? (
              <ItemFamilia key={item.clave} f={item.familia} props={props} />
            ) : (
              <ItemPreregistro key={item.clave} p={item.preregistro} onRevisar={props.onRevisar} />
            ),
          )}
        </ListaInset>
      )}
    </section>
  )
}
