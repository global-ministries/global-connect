"use client"

/**
 * The fields of a notice's text (R4b of odd/tasks/talleres-rediseno.md, S10;
 * design/talleres-avisos 02 and 04): «Asunto del correo» (one line, ≤ 200)
 * and «Mensaje» (≤ 1000) with their counters, the variable chips of
 * talleres_aviso_variables() for this kind (a tap inserts it where the
 * cursor was; the ones allowed in the subject are listed), and the errors of
 * the client validation (unknown variable → «Quitar {x}») or of the server.
 * Controlled: the panel owns the draft.
 */
import { AlertCircle } from 'lucide-react'
import { useId, useRef } from 'react'

import { InputSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import {
  descripcionVariable,
  errorDelAsunto,
  errorDelMensaje,
  largo,
  MAX_ASUNTO,
  MAX_MENSAJE,
  mensajeErrorTexto,
  type DefinicionVariables,
  type ErrorTexto,
} from '@/lib/platform/talleres/avisos-textos'

export interface EditorTextoAvisoProps {
  readonly tipo: string
  readonly nombreAviso: string
  readonly definicion: DefinicionVariables
  readonly asunto: string
  readonly mensaje: string
  readonly onAsunto: (valor: string) => void
  readonly onMensaje: (valor: string) => void
  readonly errores: readonly ErrorTexto[]
  readonly errorServidor: string | null
  readonly onQuitar: (variable: string) => void
  /** «Mensaje» or «Mensaje para la clase 2». */
  readonly etiquetaMensaje?: string
  readonly deshabilitado?: boolean
}

function Contador({ campo, valor, maximo }: { campo: string; valor: number; maximo: number }) {
  return (
    <span className={cn('font-mono text-xs tabular-nums', valor > maximo ? 'text-danger-text' : 'text-muted-foreground')}>
      <span data-contador={campo}>{valor}</span> / {maximo}
    </span>
  )
}

export function EditorTextoAviso({
  tipo,
  nombreAviso,
  definicion,
  asunto,
  mensaje,
  onAsunto,
  onMensaje,
  errores,
  errorServidor,
  onQuitar,
  etiquetaMensaje = 'Mensaje',
  deshabilitado = false,
}: EditorTextoAvisoProps) {
  const id = useId()
  const refAsunto = useRef<HTMLInputElement>(null)
  const refMensaje = useRef<HTMLTextAreaElement>(null)
  const ultimo = useRef<'asunto' | 'mensaje'>('mensaje')
  const idError = `${id}-error`
  const idAyuda = `${id}-ayuda`
  const idDatos = `${id}-datos`
  const hayError = errores.length > 0 || errorServidor !== null

  function insertar(variable: string) {
    const campo = ultimo.current === 'asunto' ? refAsunto.current : refMensaje.current
    const valor = ultimo.current === 'asunto' ? asunto : mensaje
    const texto = `{${variable}}`
    const inicio = campo?.selectionStart ?? valor.length
    const fin = campo?.selectionEnd ?? inicio
    const nuevo = valor.slice(0, inicio) + texto + valor.slice(fin)
    if (ultimo.current === 'asunto') onAsunto(nuevo)
    else onMensaje(nuevo)
    const cursor = inicio + texto.length
    requestAnimationFrame(() => {
      campo?.focus()
      campo?.setSelectionRange(cursor, cursor)
    })
  }

  const mensajes: { clave: string; texto: string; quitar?: string }[] = []
  for (const error of errores) {
    if (error.codigo === 'VARIABLE_DESCONOCIDA') {
      for (const variable of error.variables ?? []) {
        mensajes.push({
          clave: `d-${variable}`,
          texto: mensajeErrorTexto({ codigo: error.codigo, variables: [variable] }, nombreAviso),
          quitar: variable,
        })
      }
    } else mensajes.push({ clave: error.codigo, texto: mensajeErrorTexto(error, nombreAviso) })
  }
  if (errorServidor && mensajes.length === 0) mensajes.push({ clave: 'servidor', texto: errorServidor })

  return (
    <div className="grid gap-3.5">
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-asunto`} className="text-[13px] font-semibold">
            Asunto del correo
          </label>
          <Contador campo="asunto" valor={largo(asunto)} maximo={MAX_ASUNTO} />
        </div>
        <InputSistema
          ref={refAsunto}
          id={`${id}-asunto`}
          value={asunto}
          maxLength={MAX_ASUNTO}
          disabled={deshabilitado}
          onChange={(e) => onAsunto(e.target.value)}
          onFocus={() => {
            ultimo.current = 'asunto'
          }}
          aria-invalid={errores.some((e) => errorDelAsunto(e, asunto)) || undefined}
          aria-describedby={hayError ? idError : undefined}
        />
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-mensaje`} className="text-[13px] font-semibold">
            {etiquetaMensaje}
          </label>
          <Contador campo="mensaje" valor={largo(mensaje)} maximo={MAX_MENSAJE} />
        </div>
        <TextareaSistema
          ref={refMensaje}
          id={`${id}-mensaje`}
          value={mensaje}
          filas={7}
          disabled={deshabilitado}
          onChange={(e) => onMensaje(e.target.value)}
          onFocus={() => {
            ultimo.current = 'mensaje'
          }}
          className="min-h-40 text-sm leading-normal"
          aria-invalid={errores.some((e) => errorDelMensaje(e, mensaje)) || undefined}
          aria-describedby={[idAyuda, hayError ? idError : null].filter(Boolean).join(' ')}
        />
        <p id={idAyuda} className="text-xs leading-normal text-muted-foreground">
          Texto simple: cada salto de línea se respeta y una línea en blanco separa párrafos. El correo ya empieza con «¡Hola, {'{nombre}'}!».
          Si a una línea le falta un dato, esa línea no sale: pon cada dato que puede faltar en su propia línea.
        </p>
      </div>

      <div className="grid gap-2">
        <p id={idDatos} className="text-xs text-muted-foreground">
          Datos de este aviso. Toca uno para insertarlo donde está el cursor:
        </p>
        <div
          role="group"
          aria-labelledby={idDatos}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 max-md:flex-nowrap md:flex-wrap"
        >
          {definicion.variables.map((variable) => {
            const enAsunto = definicion.asunto.includes(variable)
            return (
              <button
                key={variable}
                type="button"
                disabled={deshabilitado}
                aria-label={`Insertar {${variable}}`}
                title={descripcionVariable(tipo, variable)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertar(variable)}
                className={cn(
                  'focus-ring min-h-9 shrink-0 rounded-full border px-2.5 font-mono text-xs transition-colors pointer-coarse:min-h-11',
                  enAsunto ? 'border-border bg-card hover:bg-accent' : 'border-brand/45 bg-brand-tint hover:bg-accent',
                )}
              >
                {`{${variable}}`}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          En el asunto solo puedes usar los datos que siempre existen: {definicion.asunto.map((v) => `{${v}}`).join(', ')}.
        </p>
      </div>

      {mensajes.length > 0 && (
        <div
          id={idError}
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 text-[13px] leading-normal"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" />
          <div className="min-w-0">
            <b className="font-semibold">{errores.length > 0 ? 'No se puede guardar todavía' : 'No se pudo guardar'}</b>
            <ul className="mt-1 grid gap-1">
              {mensajes.map((m) => (
                <li key={m.clave}>
                  {m.texto}
                  {m.quitar !== undefined && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => onQuitar(m.quitar!)}
                        className="focus-ring inline-flex min-h-8 items-center rounded-md px-1 font-medium text-brand-text hover:underline pointer-coarse:min-h-11"
                      >
                        Quitar {`{${m.quitar}}`}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
