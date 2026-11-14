/**
 * Live preview of a notice's text (R4b of odd/tasks/talleres-rediseno.md,
 * S10 S11; design/talleres-avisos 02 `.mail` / `.bell`): the email with the
 * same structure as emails/taller-aviso.tsx (brand line, automatic title,
 * «¡Hola, nombre!», the message in paragraphs with its line breaks, the
 * automatic data rows, the button and the footer) and the bell notice, both
 * with sample data. Values are highlighted; an unknown variable stays
 * marked where it is; lines that would not go out are counted.
 */
import { Bell, Mail, Smartphone } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

import {
  fichaEjemplo,
  renderAsunto,
  renderPrevio,
  type DatosAviso,
  type PlantillaAviso,
  type Segmento,
} from '@/lib/platform/talleres/avisos-textos'

function Segmentos({ segmentos }: { segmentos: readonly Segmento[] }) {
  return (
    <>
      {segmentos.map((s, i) =>
        s.tipo === 'texto' ? (
          <Fragment key={i}>{s.texto}</Fragment>
        ) : s.tipo === 'valor' ? (
          <span key={i} className="rounded-sm bg-brand-tint px-0.5">
            {s.texto}
          </span>
        ) : (
          <mark key={i} className="rounded-sm bg-danger/15 px-0.5 font-mono text-[0.92em] text-danger-text underline decoration-wavy">
            {s.texto}
          </mark>
        ),
      )}
    </>
  )
}

function Lineas({ lineas }: { lineas: readonly (readonly Segmento[])[] }) {
  return (
    <>
      {lineas.map((linea, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <Segmentos segmentos={linea} />
        </Fragment>
      ))}
    </>
  )
}

function Etiqueta({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return <p className="mt-4 mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">{icono}{children}</p>
}

export interface VistaPreviaAvisoProps {
  readonly asunto: string
  readonly mensaje: string
  readonly plantilla: PlantillaAviso
  readonly variables: readonly string[]
  readonly datos: DatosAviso
  readonly tallerNombre: string
}

export function VistaPreviaAviso({ asunto, mensaje, plantilla, variables, datos, tallerNombre }: VistaPreviaAvisoProps) {
  const cuerpo = renderPrevio(mensaje, datos, variables)
  const titulo = renderPrevio(asunto, datos, variables)
  const asuntoTexto = renderAsunto(asunto, datos)
  const ficha = fichaEjemplo(plantilla, datos)
  const nombre = datos.nombre

  return (
    <div>
      <Etiqueta icono={<Mail aria-hidden="true" className="size-3" />}>Correo</Etiqueta>
      <section aria-label="Vista previa del correo" className="overflow-hidden rounded-2xl border border-border bg-background">
        <div className="flex min-w-0 items-center gap-2 border-b border-border px-3.5 py-2.5 text-[13px]">
          <Mail aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Asunto</span>
          <b className="min-w-0 truncate font-semibold" title={asuntoTexto}>
            {titulo.parrafos.length > 0 ? <Lineas lineas={titulo.parrafos.flat()} /> : <span className="text-muted-foreground">(sin asunto)</span>}
          </b>
        </div>
        <div className="px-5 pt-4.5 pb-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Iglesia Global · Grupos de Corto Plazo</p>
          <p className="mt-1.5 mb-3 text-xl font-bold tracking-[-0.01em]">{plantilla.titulo}</p>
          <div className="grid gap-2.5 text-sm leading-relaxed">
            {nombre && <p className="text-muted-foreground">¡Hola, {nombre}!</p>}
            {cuerpo.parrafos.map((lineas, i) => (
              <p key={i}>
                <Lineas lineas={lineas} />
              </p>
            ))}
            {cuerpo.caidas > 0 && (
              <p className="text-xs text-muted-foreground italic">
                {cuerpo.caidas === 1 ? '1 línea no sale' : `${cuerpo.caidas} líneas no salen`}: les falta un dato en este ejemplo.
              </p>
            )}
          </div>
          {ficha.length > 0 && (
            <ul aria-label="Ficha automática" className="mt-3 mb-3.5 divide-y divide-border/60 rounded-xl bg-muted px-3.5 py-1">
              {ficha.map(([etiqueta, valor]) => (
                <li key={etiqueta} className="py-2 text-[13px]">
                  <small className="block text-xs text-muted-foreground">{etiqueta}</small>
                  <span className="whitespace-pre-line">{valor}</span>
                </li>
              ))}
            </ul>
          )}
          {plantilla.cta && (
            <span className="inline-flex min-h-10 items-center rounded-xl bg-brand-strong px-4 text-sm font-semibold text-brand-foreground">{plantilla.cta}</span>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Recibes este correo porque te inscribiste en {tallerNombre} o pediste que te avisáramos. Si no fuiste tú, puedes ignorarlo.
          </p>
        </div>
      </section>

      <Etiqueta icono={<Smartphone aria-hidden="true" className="size-3" />}>En la app · campana</Etiqueta>
      <section aria-label="Vista previa de la campana" className="flex gap-3 rounded-2xl border border-border bg-card p-3.5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text">
          <Bell className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-sm font-semibold">{plantilla.titulo}</b>
          <span className="mt-0.5 block text-[13px] leading-normal">
            {cuerpo.parrafos.map((lineas, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                <Lineas lineas={lineas} />
              </Fragment>
            ))}
          </span>
          <small className="mt-1.5 block text-xs text-muted-foreground">Ahora · {tallerNombre}</small>
        </span>
      </section>
    </div>
  )
}
