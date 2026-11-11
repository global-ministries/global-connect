/**
 * T8 (odd/tasks/proximo-paso.md; design/proximo-paso 01–03, 06) — the
 * screens of /proximo-paso before the code: the public landing (01), the
 * signed-in one-tap landing (06), «Elegir fecha» (02, only with several
 * open ediciones) and «Tus datos» (03). Presentational: the flow, the
 * state and the server actions live in registro-proximo-paso.tsx.
 */
import type { FormEvent, ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight, Eye, EyeOff, HandHeart, Zap } from 'lucide-react'

import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { domingosDe } from '@/lib/platform/proximo-paso/formato'
import { fechaDomingo, type CampoRegistro, type EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'
import { cn } from '@/lib/utils'

import { BarraInferior, Cabecera, DiaCalendario, EncabezadoPaso, LineaDomingos, Num, TarjetaEdicion, TituloSeccion } from './partes'

export const enlace = 'inline-flex min-h-11 items-center rounded-md px-1 font-medium text-brand-text underline-offset-4 hover:underline focus-ring'

export const empieza = (e: Pick<EdicionProximoPaso, 'fechaInicio'>) => `Empieza el domingo ${fechaDomingo(e.fechaInicio)}`

export function textoCuposLargo(cupoRestante: number | null): string | null {
  if (cupoRestante === null) return null
  if (cupoRestante === 0) return 'Sin cupos'
  return cupoRestante === 1 ? 'Queda 1 cupo' : `Quedan ${cupoRestante} cupos`
}

/** «Las 4 clases» / «Tus 4 domingos»: a labelled section with the line of Sundays. */
export function SeccionClases({ id, titulo, edicion }: { readonly id: string; readonly titulo: string; readonly edicion: EdicionProximoPaso }): ReactElement | null {
  if (edicion.clases.length === 0) return null
  return (
    <section aria-labelledby={id}>
      <TituloSeccion id={id}>{titulo}</TituloSeccion>
      <LineaDomingos clases={edicion.clases} />
    </section>
  )
}

const COMO_FUNCIONA = [
  { icono: Zap, titulo: 'Te inscribes en un minuto', texto: 'Con tu nombre, tu correo y una contraseña creas tu cuenta en Global.' },
  { icono: CalendarDays, titulo: 'Vienes cuatro domingos seguidos', texto: 'Una clase por domingo, en este orden.' },
  { icono: HandHeart, titulo: 'Eliges dónde servir', texto: 'Al terminar puedes unirte a un equipo de Dream Team.' },
] as const

function ComoFunciona(): ReactElement {
  return (
    <section aria-labelledby="proximo-paso-como">
      <TituloSeccion id="proximo-paso-como">Cómo funciona</TituloSeccion>
      <ul className="rounded-2xl bg-card px-3.5">
        {COMO_FUNCIONA.map(({ icono: Icono, titulo, texto }, i) => (
          <li key={titulo} className={cn('grid grid-cols-[36px_minmax(0,1fr)] items-start gap-3 py-3', i > 0 && 'border-t border-border/60')}>
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-brand-tint text-brand-text">
              <Icono className="size-5" />
            </span>
            <span className="min-w-0">
              <b className="block text-[15px] font-semibold text-foreground">{titulo}</b>
              <span className="block text-[13px] text-muted-foreground">{texto}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 01 · The public landing: what it is, the next edición, the 4 Sundays, the sticky CTA. */
export function InicioPublico({
  edicion,
  fechasConCupo,
  loginHref,
  onInscribirme,
  onVerFechas,
}: {
  readonly edicion: EdicionProximoPaso
  readonly fechasConCupo: number
  readonly loginHref: string
  readonly onInscribirme: () => void
  readonly onVerFechas: () => void
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <Cabecera ceja="Próximo Paso" titulo="Tu primer paso en Global" id="proximo-paso-titulo">
        Cuatro domingos para conocer la iglesia, crecer y descubrir dónde servir.
      </Cabecera>
      <TarjetaEdicion edicion={edicion}>
        {fechasConCupo > 1 && (
          <p className="mt-2.5 flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Hay <Num>{fechasConCupo}</Num> fechas con cupo
            </span>
            <button type="button" onClick={onVerFechas} className={enlace}>
              Ver fechas
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </p>
        )}
      </TarjetaEdicion>
      <SeccionClases id="proximo-paso-clases" titulo="Las 4 clases" edicion={edicion} />
      <ComoFunciona />
      <BarraInferior>
        <BotonSistema type="button" tamaño="lg" className="w-full" onClick={onInscribirme}>
          Quiero inscribirme
        </BotonSistema>
        <p className="flex items-center justify-center gap-0.5 text-sm text-muted-foreground">
          ¿Ya tienes cuenta?
          <Link href={loginHref} className={enlace}>
            Inicia sesión
          </Link>
        </p>
      </BarraInferior>
    </div>
  )
}

/** 06 · Signed in: the edición, «Tus 4 domingos» and one tap. */
export function InicioConSesion({
  nombre,
  edicion,
  puedeCambiar,
  enviando,
  aviso,
  onCambiarFecha,
  onInscribirme,
}: {
  readonly nombre: string | null
  readonly edicion: EdicionProximoPaso
  readonly puedeCambiar: boolean
  readonly enviando: boolean
  readonly aviso?: ReactNode
  readonly onCambiarFecha: () => void
  readonly onInscribirme: () => void
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <Cabecera ceja="Próximo Paso" titulo={nombre ? `Hola, ${nombre}` : 'Inscríbete con tu cuenta'} id="proximo-paso-titulo">
        Ya tienes cuenta: te inscribes con un toque.
      </Cabecera>
      <TarjetaEdicion
        edicion={edicion}
        accion={
          puedeCambiar && (
            <button type="button" onClick={onCambiarFecha} className={cn(enlace, 'min-h-8 text-sm')}>
              Cambiar fecha
            </button>
          )
        }
      />
      <SeccionClases id="proximo-paso-clases" titulo="Tus 4 domingos" edicion={edicion} />
      {aviso}
      <BarraInferior>
        <BotonSistema type="button" tamaño="lg" className="w-full" cargando={enviando} onClick={onInscribirme}>
          Inscribirme
        </BotonSistema>
      </BarraInferior>
    </div>
  )
}

/** The radio cards of the open ediciones (02 and the «Cambiar fecha» sheet). */
export function OpcionesFecha({
  ediciones,
  elegida,
  onElegir,
  etiquetadoPor,
  disponible,
}: {
  readonly ediciones: readonly EdicionProximoPaso[]
  readonly elegida: string | null
  readonly onElegir: (id: string) => void
  readonly etiquetadoPor: string
  readonly disponible: (e: EdicionProximoPaso) => boolean
}): ReactElement {
  return (
    <fieldset aria-labelledby={etiquetadoPor} className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
      {ediciones.map((e) => {
        const libre = disponible(e)
        const cupos = libre ? textoCuposLargo(e.cupoRestante) : 'Sin cupos'
        const idCupo = `proximo-paso-cupo-${e.id}`
        const marcada = elegida === e.id
        return (
          <label
            key={e.id}
            className={cn(
              'relative grid min-w-0 grid-cols-[minmax(0,1fr)_24px] items-center gap-3 rounded-2xl border-[1.5px] border-transparent bg-card px-4 py-3.5 transition-colors',
              libre ? 'cursor-pointer' : 'cursor-not-allowed',
              marcada && 'border-brand bg-brand-tint',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand',
            )}
          >
            <input
              type="radio"
              name="edicion"
              value={e.id}
              checked={marcada}
              disabled={!libre}
              onChange={() => onElegir(e.id)}
              aria-describedby={cupos ? idCupo : undefined}
              className="sr-only"
            />
            <span className="min-w-0">
              <span className={cn('block text-[19px] font-[650] tracking-[-0.01em]', libre ? 'text-foreground' : 'text-muted-foreground')}>{e.nombre}</span>
              <span className={cn('mt-0.5 block text-sm', libre ? 'text-foreground' : 'text-muted-foreground')}>
                {domingosDe(e.clases) ?? empieza(e)}
              </span>
              {cupos && (
                <span
                  id={idCupo}
                  className={cn(
                    'mt-2 inline-flex items-center gap-[7px] text-[13px] font-medium',
                    !libre ? 'text-muted-foreground' : e.cupoRestante !== null && e.cupoRestante <= 10 ? 'text-warning-text' : 'text-success-text',
                  )}
                >
                  {cupos}
                </span>
              )}
            </span>
            <span
              aria-hidden="true"
              className={cn('grid size-6 place-items-center rounded-full border-2', marcada ? 'border-brand' : 'border-border', !libre && 'bg-muted')}
            >
              {marcada && <span className="size-3 rounded-full bg-brand" />}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/** 02 · «¿Cuándo quieres empezar?» — only with several open ediciones. */
export function ElegirFecha({
  ediciones,
  elegida,
  disponible,
  onElegir,
  onContinuar,
}: {
  readonly ediciones: readonly EdicionProximoPaso[]
  readonly elegida: EdicionProximoPaso | null
  readonly disponible: (e: EdicionProximoPaso) => boolean
  readonly onElegir: (id: string) => void
  readonly onContinuar: () => void
}): ReactElement {
  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault()
        if (elegida) onContinuar()
      }}
      className="flex min-w-0 flex-1 flex-col gap-5"
    >
      <EncabezadoPaso paso={1} total={3} etiqueta="Fecha" />
      <Cabecera titulo="¿Cuándo quieres empezar?" id="proximo-paso-fecha">
        Cada fecha son cuatro domingos seguidos, una clase por domingo.
      </Cabecera>
      <OpcionesFecha ediciones={ediciones} elegida={elegida?.id ?? null} onElegir={onElegir} etiquetadoPor="proximo-paso-fecha" disponible={disponible} />
      <p className="px-1 text-[13px] text-muted-foreground">Las fechas sin cupo se ven pero no se pueden elegir. La más cercana con cupo ya viene marcada.</p>
      <BarraInferior>
        <BotonSistema type="submit" tamaño="lg" className="w-full" disabled={!elegida}>
          Continuar
        </BotonSistema>
        {elegida && (
          <p aria-live="polite" className="text-center text-[13px] text-muted-foreground">
            Empiezas el domingo {fechaDomingo(elegida.fechaInicio)}
          </p>
        )}
      </BarraInferior>
    </form>
  )
}

export type CamposRegistro = Record<CampoRegistro, string>

/** One field with its hint under it; the error replaces nothing, it adds a line. */
function Campo({
  campo,
  label,
  hint,
  valor,
  error,
  onCambio,
  deshabilitado,
  ...input
}: {
  readonly campo: CampoRegistro
  readonly label: string
  readonly hint?: string
  readonly valor: string
  readonly error?: string
  readonly onCambio: (valor: string) => void
  readonly deshabilitado: boolean
} & Omit<React.ComponentProps<typeof InputSistema>, 'value' | 'onChange' | 'error' | 'label'>): ReactElement {
  const id = `proximo-paso-${campo}`
  const describe = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="min-w-0 py-3">
      <InputSistema
        id={id}
        name={campo}
        label={label}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        error={error}
        disabled={deshabilitado}
        aria-describedby={describe}
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/** 03 · «Tus datos»: two short groups, errors in line, the sticky «Continuar». */
export function TusDatos({
  edicion,
  paso,
  puedeCambiar,
  campos,
  errores,
  enviando,
  verContrasena,
  loginHref,
  aviso,
  onCambiarFecha,
  onCampo,
  onVerContrasena,
  onEnviar,
}: {
  readonly edicion: EdicionProximoPaso
  readonly paso: { readonly numero: number; readonly total: number }
  readonly puedeCambiar: boolean
  readonly campos: CamposRegistro
  readonly errores: Partial<Record<CampoRegistro, string>>
  readonly enviando: boolean
  readonly verContrasena: boolean
  readonly loginHref: string
  readonly aviso?: ReactNode
  readonly onCambiarFecha: () => void
  readonly onCampo: (campo: CampoRegistro, valor: string) => void
  readonly onVerContrasena: () => void
  readonly onEnviar: (evento: FormEvent<HTMLFormElement>) => void
}): ReactElement {
  const campo = (c: CampoRegistro) => ({ campo: c, valor: campos[c], error: errores[c], onCambio: (v: string) => onCampo(c, v), deshabilitado: enviando })
  return (
    <form onSubmit={onEnviar} noValidate className="flex min-w-0 flex-1 flex-col gap-5">
      <EncabezadoPaso paso={paso.numero} total={paso.total} etiqueta="Tus datos" />
      <Cabecera titulo="Tus datos" id="proximo-paso-datos">
        Con esto creamos tu cuenta en Global. Ahí verás tus clases.
      </Cabecera>
      {aviso}

      <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-card py-3 pr-1.5 pl-3.5">
        <DiaCalendario fecha={edicion.fechaInicio} tono="marca" className="h-11 w-10" />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-semibold text-foreground">Próximo Paso · {edicion.nombre}</b>
          <span className="block truncate text-[13px] text-muted-foreground">{empieza(edicion)}</span>
        </span>
        {puedeCambiar && (
          <button type="button" onClick={onCambiarFecha} className={enlace}>
            Cambiar
          </button>
        )}
      </div>

      <section aria-labelledby="proximo-paso-sobre-ti">
        <TituloSeccion id="proximo-paso-sobre-ti">Sobre ti</TituloSeccion>
        <div className="rounded-2xl bg-card px-3.5 [&>*+*]:border-t [&>*+*]:border-border/60">
          <div className="grid grid-cols-2 gap-2.5">
            <Campo {...campo('nombre')} label="Nombre" autoComplete="given-name" />
            <Campo {...campo('apellido')} label="Apellido" autoComplete="family-name" />
          </div>
          <Campo
            {...campo('telefono')}
            label="Teléfono"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0412 123 4567"
            hint="Para escribirte por WhatsApp si hace falta."
          />
        </div>
      </section>

      <section aria-labelledby="proximo-paso-cuenta">
        <TituloSeccion id="proximo-paso-cuenta">Tu cuenta</TituloSeccion>
        <div className="rounded-2xl bg-card px-3.5 [&>*+*]:border-t [&>*+*]:border-border/60">
          <Campo
            {...campo('email')}
            label="Correo"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            hint="Te enviamos un código para confirmarlo."
          />
          <Campo
            {...campo('password')}
            label="Contraseña"
            type={verContrasena ? 'text' : 'password'}
            autoComplete="new-password"
            hint="Mínimo 8 caracteres. La usas para entrar a la app."
            accesorio={
              <BotonSistema
                type="button"
                variante="ghost"
                tamaño="sm"
                soloIcono
                icono={verContrasena ? EyeOff : Eye}
                aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={verContrasena}
                onClick={onVerContrasena}
              />
            }
          />
        </div>
      </section>

      <p className="flex items-center justify-center gap-0.5 text-sm text-muted-foreground">
        ¿Ya tienes cuenta?
        <Link href={loginHref} className={enlace}>
          Inicia sesión
        </Link>
      </p>

      <BarraInferior>
        <BotonSistema type="submit" tamaño="lg" className="w-full" cargando={enviando}>
          Continuar
        </BotonSistema>
        <p className="text-center text-[13px] text-muted-foreground">Después te pedimos el código que llega a tu correo.</p>
      </BarraInferior>
    </form>
  )
}
