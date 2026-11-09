'use client'

/**
 * Niños › Salones — the panel of one salón (artboard `.pl`, a
 * `DetalleResponsivo`: side panel from md, bottom sheet on phones). Estado
 * (Abierto · Cerrado), Nombre, Quién entra (age in months, grade, fecha de
 * corte and promoción), Cupo (regulars, visitors), Voluntarios (niños por
 * voluntario, minimum) and Opciones (pañal, merienda). Every field saves on
 * its own (Enter or leaving it; the switches at once); the name, quota and
 * ranges go to the table, the rest to ninos_salon_reglas_guardar. The panel
 * keeps the last saved values so the next field saves on top of them before
 * the server data comes back. A reader who may not configure the salón's
 * area sees the values without controls.
 */
import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'

import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { Interruptor } from '@/components/ui/interruptor'
import { PuntoEstado } from '@/components/ui/punto-estado'
import {
  MAX_EDAD_MESES,
  datosDe,
  leerDiaMes,
  reglasDe,
  textoDiaMes,
  textoEdad,
  textoGrado,
  validarDatosSalon,
  validarReglas,
  voluntariosNecesarios,
  type DatosSalon,
  type ReglasSalon,
  type SalonAdmin,
} from '@/lib/platform/ninos/salones-reglas'

import { CampoEnLinea } from './campo-en-linea'

const SOLO_NUMEROS = 'Escribe solo números.'
const NUMEROS_O_VACIO = 'Escribe solo números, o déjalo vacío para no poner límite.'
const FECHA_DIA_MES = 'Escribe la fecha como 1 dic o 15 ago, o déjala vacía.'

/** '' → null when optional; a whole number; undefined when the text is not one. */
function leerNumero(texto: string, opcional: boolean): number | null | undefined {
  if (texto === '') return opcional ? null : undefined
  return /^\d+$/.test(texto) ? Number(texto) : undefined
}

const aTexto = (n: number | null) => (n === null ? '' : String(n))

function Seccion({ titulo, nota, children }: { readonly titulo: string; readonly nota?: string; readonly children: ReactNode }): ReactElement {
  return (
    <section className="border-b border-border/60 py-3 last:border-b-0">
      <h3 className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {titulo}
        {nota && <span className="text-xs font-normal normal-case tracking-normal">{nota}</span>}
      </h3>
      {children}
    </section>
  )
}

function Ayuda({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="mt-1 text-xs leading-snug text-muted-foreground">{children}</p>
}

function Linea({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">{children}</p>
}

function Valor({ children }: { readonly children: ReactNode }): ReactElement {
  return <span className="font-mono font-semibold tabular-nums text-foreground">{children}</span>
}

export interface PanelSalonProps {
  readonly salon: SalonAdmin
  readonly editable: boolean
  /** Saves the name, quota and ranges; `aviso` is the sentence for the live region. */
  readonly onDatos: (datos: DatosSalon, aviso: string) => Promise<boolean>
  /** Saves every rule; `aviso` is the sentence for the live region. */
  readonly onReglas: (reglas: ReglasSalon, aviso: string) => Promise<boolean>
  readonly onInvalido: (mensaje: string) => void
  readonly ocupado: boolean
}

export function PanelSalon({ salon, editable, onDatos, onReglas, onInvalido, ocupado }: PanelSalonProps): ReactElement {
  const [datos, setDatos] = useState<DatosSalon>(() => datosDe(salon))
  const [reglas, setReglas] = useState<ReglasSalon>(() => reglasDe(salon))
  const nombre = datos.nombre

  const guardarDatos = async (cambios: Partial<DatosSalon>, aviso: (d: DatosSalon) => string) => {
    const siguiente = { ...datos, ...cambios }
    const ok = await onDatos(siguiente, aviso(siguiente))
    if (ok) setDatos(siguiente)
    return ok
  }

  const guardarReglas = async (cambios: Partial<ReglasSalon>, aviso: (r: ReglasSalon) => string) => {
    const siguiente = { ...reglas, ...cambios }
    const ok = await onReglas(siguiente, aviso(siguiente))
    if (ok) setReglas(siguiente)
    return ok
  }

  /** An inline number of the table data (name, quota, ranges). */
  const numeroDatos = (clave: Exclude<keyof DatosSalon, 'nombre'>, etiqueta: string, aviso: (d: DatosSalon) => string, opcional = true) => (
    <CampoEnLinea
      etiqueta={etiqueta}
      numerico
      valor={aTexto(datos[clave])}
      className="w-16"
      onInvalido={onInvalido}
      validar={(t) => {
        const n = leerNumero(t, opcional)
        return n === undefined ? (opcional ? NUMEROS_O_VACIO : SOLO_NUMEROS) : validarDatosSalon({ ...datos, [clave]: n })
      }}
      onGuardar={(t) => guardarDatos({ [clave]: leerNumero(t, opcional) as number | null }, aviso)}
    />
  )

  /** An inline number of the rules. */
  const numeroReglas = (
    clave: 'cupoVisitantes' | 'ninosPorVoluntario' | 'minVoluntarios',
    etiqueta: string,
    aviso: (r: ReglasSalon) => string,
    opcional = false,
  ) => (
    <CampoEnLinea
      etiqueta={etiqueta}
      numerico
      valor={aTexto(reglas[clave])}
      className="w-16"
      onInvalido={onInvalido}
      validar={(t) => {
        const n = leerNumero(t, opcional)
        return n === undefined ? (opcional ? NUMEROS_O_VACIO : SOLO_NUMEROS) : validarReglas({ ...reglas, [clave]: n })
      }}
      onGuardar={(t) => guardarReglas({ [clave]: leerNumero(t, opcional) as number | null }, aviso)}
    />
  )

  /** "1 dic" fields of the fecha de corte and the promoción; empty removes the rule. */
  const diaMes = (tipo: 'corte' | 'promocion', etiqueta: string) => {
    const mes = tipo === 'corte' ? 'corteMes' : 'promocionMes'
    const dia = tipo === 'corte' ? 'corteDia' : 'promocionDia'
    const leer = (t: string) => (t === '' ? { mes: null, dia: null } : leerDiaMes(t))
    return (
      <CampoEnLinea
        etiqueta={etiqueta}
        valor={textoDiaMes(reglas[mes], reglas[dia])}
        placeholder="1 dic"
        className="w-20 text-center"
        onInvalido={onInvalido}
        validar={(t) => {
          const f = leer(t)
          return f ? validarReglas({ ...reglas, [mes]: f.mes, [dia]: f.dia }) : FECHA_DIA_MES
        }}
        onGuardar={(t) => {
          const f = leer(t) as { mes: number | null; dia: number | null }
          return guardarReglas({ [mes]: f.mes, [dia]: f.dia }, (r) => {
            const valor = textoDiaMes(r[mes], r[dia])
            return `${tipo === 'corte' ? 'Fecha de corte' : 'Fecha de promoción'} de ${nombre}: ${valor || 'sin fecha'}.`
          })
        }}
      />
    )
  }

  const lleno = datos.capacidad + reglas.cupoVisitantes
  const necesarios = voluntariosNecesarios(reglas, lleno)
  const rangoEdad =
    datos.edadMinMeses !== null || datos.edadMaxMeses !== null
      ? `${textoEdad(datos.edadMinMeses ?? 0)} a ${textoEdad(datos.edadMaxMeses ?? MAX_EDAD_MESES)}`
      : 'Sin límite de edad'
  const grado = textoGrado(datos.gradoMin, datos.gradoMax)

  if (!editable) {
    return (
      <div>
        <p className="mb-1 rounded-md border border-border bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          Solo quien coordina esta área puede cambiar este salón.
        </p>
        <Seccion titulo="Estado">
          <PuntoEstado tono={reglas.abierto ? 'success' : 'muted'} etiqueta={reglas.abierto ? 'Abierto' : 'Cerrado'} />
        </Seccion>
        <Seccion titulo="Quién entra">
          {salon.esNecesidadesEspeciales ? (
            <Linea>Por asignación del coordinador: necesidades especiales.</Linea>
          ) : (
            <>
              <Linea>Edad: {rangoEdad}</Linea>
              <Linea>Grado: {grado || 'sin grado'}</Linea>
              <Linea>
                Fecha de corte: {textoDiaMes(reglas.corteMes, reglas.corteDia) || 'sin fecha'} · pasa de salón el{' '}
                {textoDiaMes(reglas.promocionMes, reglas.promocionDia) || 'sin fecha'}
              </Linea>
            </>
          )}
        </Seccion>
        <Seccion titulo="Cupo">
          <Linea>
            Regulares <Valor>{datos.capacidad}</Valor> · visitantes <Valor>{reglas.cupoVisitantes}</Valor>
          </Linea>
        </Seccion>
        <Seccion titulo="Voluntarios">
          <Linea>
            Niños por voluntario <Valor>{reglas.ninosPorVoluntario ?? '—'}</Valor> · mínimo <Valor>{reglas.minVoluntarios}</Valor>
          </Linea>
        </Seccion>
        <Seccion titulo="Opciones">
          <Linea>
            Usa pañal: {reglas.opcionPanal ? 'sí' : 'no'} · puede merendar: {reglas.opcionMerienda ? 'sí' : 'no'}
          </Linea>
        </Seccion>
      </div>
    )
  }

  return (
    <div>
      <Seccion titulo="Estado">
        <ControlSegmentado
          etiqueta="Estado del salón"
          opciones={[
            { valor: 'abierto', etiqueta: 'Abierto' },
            { valor: 'cerrado', etiqueta: 'Cerrado' },
          ]}
          valor={reglas.abierto ? 'abierto' : 'cerrado'}
          onCambio={(v) => {
            if ((v === 'abierto') !== reglas.abierto && !ocupado) {
              void guardarReglas({ abierto: v === 'abierto' }, (r) => `${nombre}: ${r.abierto ? 'abierto' : 'cerrado'}.`)
            }
          }}
        />
        <Ayuda>Cerrado, la mesa no manda niños aquí; sirve para un domingo sin maestros o un salón en obras.</Ayuda>
      </Seccion>

      <Seccion titulo="Nombre">
        <CampoEnLinea
          etiqueta="Nombre del salón"
          valor={datos.nombre}
          className="w-full text-[15px] font-semibold"
          onInvalido={onInvalido}
          validar={(t) => validarDatosSalon({ ...datos, nombre: t })}
          onGuardar={(t) => guardarDatos({ nombre: t }, (d) => `Nombre del salón: ${d.nombre}.`)}
        />
      </Seccion>

      <Seccion titulo="Quién entra" nota={salon.esNecesidadesEspeciales ? undefined : 'se cumplen todos'}>
        {salon.esNecesidadesEspeciales ? (
          <Ayuda>Este salón no recibe niños por edad ni grado: va un niño con necesidades especiales de la edad de Waumba Land.</Ayuda>
        ) : (
          <div className="grid gap-3">
            <div>
              <Linea>
                <span className="w-24 font-semibold text-foreground">Edad</span>
                de {numeroDatos('edadMinMeses', 'Edad desde, en meses', (d) => `${nombre}: edad desde ${aTexto(d.edadMinMeses) || 'sin límite'} meses.`)} a{' '}
                {numeroDatos('edadMaxMeses', 'Edad hasta, en meses', (d) => `${nombre}: edad hasta ${aTexto(d.edadMaxMeses) || 'sin límite'} meses.`)} meses
              </Linea>
              <Ayuda>{rangoEdad}. Vacío: sin límite.</Ayuda>
            </div>
            <div>
              <Linea>
                <span className="w-24 font-semibold text-foreground">Grado</span>
                de {numeroDatos('gradoMin', 'Grado desde', (d) => `${nombre}: ${textoGrado(d.gradoMin, d.gradoMax) || 'sin grado'}.`)} a{' '}
                {numeroDatos('gradoMax', 'Grado hasta', (d) => `${nombre}: ${textoGrado(d.gradoMin, d.gradoMax) || 'sin grado'}.`)}
              </Linea>
              <Ayuda>{grado ? `${grado}. ` : ''}0 es preescolar; vacío, el grado no cuenta.</Ayuda>
            </div>
            <div>
              <Linea>
                <span className="w-24 font-semibold text-foreground">Fecha de corte</span>
                cumple antes del {diaMes('corte', 'Cumple antes del')} · pasa de salón el {diaMes('promocion', 'Pasa de salón el')}
              </Linea>
              <Ayuda>La edad se cuenta en la fecha de corte del año que empieza al pasar de salón: un niño que cumple después no sube a mitad de año.</Ayuda>
            </div>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Cupo">
        <Linea>
          Regulares {numeroDatos('capacidad', 'Cupo de regulares', (d) => `Cupo de regulares de ${nombre}: ${d.capacidad}.`, false)} · visitantes{' '}
          {numeroReglas('cupoVisitantes', 'Cupo de visitantes', (r) => `Cupo de visitantes de ${nombre}: ${r.cupoVisitantes}.`)}
        </Linea>
        <Ayuda>
          Los puestos de visitantes se guardan para quien viene hasta su 3.ª visita. Lleno, la mesa ofrece el siguiente salón que le sirva.
        </Ayuda>
      </Seccion>

      <Seccion titulo="Voluntarios">
        <Linea>
          1 voluntario cada{' '}
          {numeroReglas(
            'ninosPorVoluntario',
            'Niños por voluntario',
            (r) => `Niños por voluntario en ${nombre}: ${r.ninosPorVoluntario ?? 'sin regla'}.`,
            true,
          )}{' '}
          niños · mínimo {numeroReglas('minVoluntarios', 'Mínimo de voluntarios', (r) => `Mínimo de voluntarios de ${nombre}: ${r.minVoluntarios}.`)}
        </Linea>
        <Ayuda>
          Con el cupo lleno (<span className="font-mono tabular-nums">{lleno}</span> niños) hacen falta{' '}
          <strong className="font-mono font-semibold tabular-nums text-foreground">{necesarios}</strong>{' '}
          {necesarios === 1 ? 'voluntario' : 'voluntarios'}.
        </Ayuda>
      </Seccion>

      <Seccion titulo="Opciones">
        <ul>
          {(
            [
              { clave: 'opcionPanal', titulo: 'Usa pañal', descripcion: 'La mesa pide la pañalera.' },
              { clave: 'opcionMerienda', titulo: 'Puede merendar', descripcion: 'Se avisa si el niño tiene alergias.' },
            ] as const
          ).map((o) => (
            <li key={o.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-foreground">{o.titulo}</span>
                <span className="block text-xs text-muted-foreground">{o.descripcion}</span>
              </span>
              <Interruptor
                activo={reglas[o.clave]}
                aria-label={o.titulo}
                disabled={ocupado}
                onCambio={(v) => void guardarReglas({ [o.clave]: v }, () => `${nombre}: ${o.titulo.toLowerCase()} ${v ? 'sí' : 'no'}.`)}
              />
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  )
}
