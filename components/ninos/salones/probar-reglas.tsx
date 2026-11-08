'use client'

/**
 * Niños › Salones — «Probar reglas» (artboard `.pr`): describe a child (birth
 * date, grade, special needs, regular or visitor) and a service date, and
 * read where the desk would send them and why, with the salones that were
 * left out. Pure (probarReglas in lib/platform/ninos/salones-reglas.ts, the
 * rules of sugerirSalon): it never writes and follows every saved change.
 * The salones are empty, or as they are now (the children inside today).
 */
import { useId, useState, type ReactElement } from 'react'
import { Check, FlaskConical, X } from 'lucide-react'

import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { Interruptor } from '@/components/ui/interruptor'
import { InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { probarReglas, type CarpetaAdmin, type SalonAdmin } from '@/lib/platform/ninos/salones-reglas'

const GRADOS = [
  { valor: '', etiqueta: 'Sin grado' },
  { valor: '0', etiqueta: 'Preescolar' },
  ...[1, 2, 3, 4, 5, 6].map((g) => ({ valor: String(g), etiqueta: `${g}º grado` })),
]

export function ProbarReglas({
  salones,
  carpetas,
  fechaServicio,
  ocupadosHoy,
  onVerSalon,
}: {
  readonly salones: readonly SalonAdmin[]
  readonly carpetas: readonly CarpetaAdmin[]
  /** The default service date (today if Sunday, else the coming Sunday). */
  readonly fechaServicio: string
  /** Children inside each salón today. */
  readonly ocupadosHoy: Readonly<Record<string, number>>
  readonly onVerSalon: (id: string) => void
}): ReactElement {
  const id = useId()
  const [nacimiento, setNacimiento] = useState('')
  const [grado, setGrado] = useState('')
  const [necesidades, setNecesidades] = useState(false)
  const [tipo, setTipo] = useState<'regular' | 'visitante'>('regular')
  const [servicio, setServicio] = useState(fechaServicio)
  const [ocupacion, setOcupacion] = useState<'vacios' | 'ahora'>('vacios')

  const adentro = Object.values(ocupadosHoy).reduce((t, n) => t + n, 0)
  const r = probarReglas({
    fechaNacimiento: nacimiento || null,
    grado: grado === '' ? null : Number(grado),
    necesidadesEspeciales: necesidades,
    visitante: tipo === 'visitante',
    fechaServicio: servicio || fechaServicio,
    salones,
    carpetas,
    ocupados: ocupacion === 'ahora' ? ocupadosHoy : undefined,
  })

  return (
    <section aria-labelledby={`${id}-titulo`} className="grid min-w-0 overflow-hidden rounded-md border border-border bg-card lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="grid content-start gap-3 border-b border-border p-3 lg:border-b-0 lg:border-r">
        <h2 id={`${id}-titulo`} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <FlaskConical aria-hidden="true" className="size-3.5" />
          Probar reglas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <InputSistema label="Fecha de nacimiento" type="date" value={nacimiento} onChange={(e) => setNacimiento(e.target.value)} />
          <SelectSistema label="Grado" opciones={GRADOS} value={grado} onValueChange={setGrado} />
          <InputSistema label="Fecha del servicio" type="date" value={servicio} onChange={(e) => setServicio(e.target.value)} />
          <div className="grid content-start gap-2">
            <span id={`${id}-tipo`} className="text-sm font-medium text-foreground">
              Visita
            </span>
            <ControlSegmentado
              etiqueta="Regular o visitante"
              opciones={[
                { valor: 'regular', etiqueta: 'Regular' },
                { valor: 'visitante', etiqueta: 'Visitante' },
              ]}
              valor={tipo}
              onCambio={setTipo}
              className="flex [&>button]:flex-1"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Visitante: hasta su 3.ª visita; desde la 4.ª es regular.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <Interruptor activo={necesidades} onCambio={setNecesidades} aria-label="Necesidades especiales" />
            <span aria-hidden="true" className="text-[13px] text-foreground">
              Necesidades especiales
            </span>
          </span>
          <ControlSegmentado
            etiqueta="Niños en los salones"
            opciones={[
              { valor: 'vacios', etiqueta: 'Salones vacíos' },
              { valor: 'ahora', etiqueta: `Como están hoy (${adentro})` },
            ]}
            valor={ocupacion}
            onCambio={setOcupacion}
          />
        </div>
      </div>

      <div data-testid="resultado-prueba" aria-live="polite" className="grid min-w-0 content-start gap-3 p-3 sm:grid-cols-2">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-[15px] sm:col-span-2">
          {r.estado === 'asignado' && r.salon ? (
            <>
              <span>Va a</span>
              <strong className="inline-flex items-center rounded-full border border-brand/45 bg-brand-tint px-2.5 py-0.5 font-[650] text-foreground">
                {r.salon.nombre}
              </strong>
              {r.edad && <span className="text-muted-foreground">({r.edad})</span>}
              <button
                type="button"
                onClick={() => r.salon && onVerSalon(r.salon.id)}
                className="focus-ring rounded-md px-1 text-xs font-medium text-brand-text hover:underline pointer-coarse:min-h-11"
              >
                Ver salón
              </button>
            </>
          ) : (
            <span className={r.estado === 'faltan_datos' ? 'text-muted-foreground' : 'font-semibold text-foreground'}>
              {r.titulo}
              {r.edad && r.estado !== 'faltan_datos' && <span className="font-normal text-muted-foreground"> ({r.edad})</span>}
            </span>
          )}
        </p>
        {r.porque.length > 0 && (
          <div className="min-w-0">
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Por qué</h3>
            <ul className="grid gap-1">
              {r.porque.map((t) => (
                <li key={t} className="flex gap-1.5 text-[13px] leading-snug text-success-text">
                  <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.estado !== 'faltan_datos' && (
          <div className="min-w-0">
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Descartados</h3>
            {r.descartados.length ? (
              <ul className="grid gap-1">
                {r.descartados.map((t) => (
                  <li key={t} className="flex gap-1.5 text-[13px] leading-snug text-danger-text">
                    <X aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0">{t}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">Ningún otro salón de la carpeta.</p>
            )}
          </div>
        )}
        {r.queHacer && (
          <div className="min-w-0">
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Qué hacer</h3>
            <p className="text-[13px] text-foreground">{r.queHacer}</p>
          </div>
        )}
      </div>
    </section>
  )
}
