'use client'

import { useRef } from 'react'
import { AlertTriangle, ChevronDown, Plus, X } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import { GENEROS, GRADOS, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { LIMITES_MIS_HIJOS } from '@/lib/platform/ninos/mis-hijos'
import { aplicarNivel, gruposNivel, nivelSugerido, valorNivel, type SalonNivel } from '@/lib/platform/ninos/nivel'

type SiNo = boolean | null

/** 'equipo': the check-in team (level with rooms). 'padre': a parent in Mi Perfil (school grade, never a room). */
export type ModoCamposNino = 'equipo' | 'padre'

const OPCIONES_SI_NO = [
  { valor: '', etiqueta: 'Sin indicar' },
  { valor: 'si', etiqueta: 'Sí' },
  { valor: 'no', etiqueta: 'No' },
]

/** Gender options with an empty "Elige…" choice first (shared with the representative's form). */
export const OPCIONES_GENERO = [{ valor: '', etiqueta: 'Elige…' }, ...GENEROS.map((g) => ({ valor: g, etiqueta: g }))]

/** The school grade a parent can pick: "Sin indicar", PreK and 1º–6º. */
const OPCIONES_GRADO_PADRE = [
  { valor: '', etiqueta: 'Sin indicar' },
  ...GRADOS.filter((g) => g.valor !== '').map((g) => ({ valor: g.valor, etiqueta: g.label })),
]

function SelectSiNo({ id, label, value, onChange }: { id: string; label: string; value: SiNo; onChange: (v: SiNo) => void }) {
  return (
    <SelectSistema
      id={id}
      label={label}
      opciones={OPCIONES_SI_NO}
      value={value === null ? '' : value ? 'si' : 'no'}
      onValueChange={(v) => onChange(v === '' ? null : v === 'si')}
    />
  )
}

type SelectNivelProps = {
  id: string
  label: string
  value: string
  salones: readonly SalonNivel[]
  onValueChange: (valor: string) => void
}

/** The "Nivel" select grouped by area (native optgroups, styled like SelectSistema). */
function SelectNivel({ id, label, value, salones, onValueChange }: SelectNivelProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={`block min-h-[44px] w-full cursor-pointer appearance-none rounded-xl border border-border bg-card/50 px-3 py-3 pr-10 text-foreground transition-[border-color,box-shadow] duration-200 ease-expo focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 ${value ? '' : 'text-muted-foreground'}`}
        >
          <option value="">Sin indicar</option>
          {gruposNivel(salones).map((g) =>
            g.opciones.length === 0 ? null : (
              <optgroup key={g.grupo} label={g.grupo}>
                {g.opciones.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
      </div>
    </div>
  )
}

type CamposNinoProps = {
  indice: number
  hijo: HijoForm
  onChange: (h: HijoForm) => void
  /** The rooms of the campus: Waumba rooms become levels and drive the suggestion. */
  salones?: readonly SalonNivel[]
  /** Public pre-registration: the level is optional ("si lo sabes"). */
  publico?: boolean
  /** 'padre' (Mi Perfil → Mis hijos): the school grade instead of the level, never a room. Default 'equipo'. */
  modo?: ModoCamposNino
  /** False hides the name, birth date and gender (a child with an own account changes them there). */
  identidadEditable?: boolean
}

/** The child's personal data and ficha fields. */
export function CamposNino({ indice, hijo, onChange, salones = [], publico = false, modo = 'equipo', identidadEditable = true }: CamposNinoProps) {
  const n = indice + 1
  const esPadre = modo === 'padre'
  const set = <K extends keyof HijoForm>(k: K, v: HijoForm[K]) => onChange({ ...hijo, [k]: v })
  const id = (campo: string) => `nino-${n}-${campo}`
  // A parent's texts follow the SQL limit of ninos_mis_hijos_guardar.
  const maxTexto = esPadre ? LIMITES_MIS_HIJOS.texto : undefined
  // The level last preselected by the rules: a new birth date may replace it,
  // a level chosen by hand is never overridden.
  const nivelAuto = useRef<string | null>(null)
  const nivel = valorNivel(hijo, salones)
  const sinSugerencia = hijo.fechaNacimiento !== '' && nivel === '' && nivelSugerido(hijo, salones, hoyEnCaracas()) === ''

  function cambiarFecha(fechaNacimiento: string) {
    const siguiente = { ...hijo, fechaNacimiento }
    // A parent picks the grade by hand: the date never preselects a room.
    if (esPadre) {
      onChange(siguiente)
      return
    }
    const libre = (nivel === '' && hijo.salonPreferidoId === '') || (nivelAuto.current !== null && nivel === nivelAuto.current)
    if (!libre) {
      onChange(siguiente)
      return
    }
    const sugerido = nivelSugerido(siguiente, salones, hoyEnCaracas())
    nivelAuto.current = sugerido || null
    onChange(aplicarNivel(siguiente, sugerido))
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {identidadEditable ? (
        <>
          <InputSistema
            id={id('nombre')}
            label="Nombre"
            aria-label={`Nombre del niño ${n}`}
            value={hijo.nombre}
            onChange={(e) => set('nombre', e.target.value)}
          />
          <InputSistema
            id={id('apellido')}
            label="Apellido"
            aria-label={`Apellido del niño ${n}`}
            value={hijo.apellido}
            onChange={(e) => set('apellido', e.target.value)}
          />
          <InputSistema
            id={id('nacimiento')}
            label="Fecha de nacimiento"
            type="date"
            aria-label={`Fecha de nacimiento del niño ${n}`}
            value={hijo.fechaNacimiento}
            onChange={(e) => cambiarFecha(e.target.value)}
          />
          <SelectSistema
            id={id('genero')}
            label="Género"
            aria-label={`Género del niño ${n}`}
            opciones={OPCIONES_GENERO}
            value={hijo.genero}
            onValueChange={(v) => set('genero', v)}
          />
        </>
      ) : (
        <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground sm:col-span-2">
          {hijo.nombre} tiene su propia cuenta: su nombre, fecha de nacimiento y género se cambian desde ella.
        </p>
      )}
      {esPadre ? (
        <SelectSistema
          id={id('grado')}
          label="Grado escolar"
          aria-label={`Grado escolar del niño ${n}`}
          opciones={OPCIONES_GRADO_PADRE}
          value={hijo.grado}
          onValueChange={(v) => set('grado', v)}
        />
      ) : (
        <div className="space-y-2">
          <SelectNivel
            id={id('nivel')}
            label={publico ? 'Nivel (si lo sabes)' : 'Nivel'}
            value={nivel}
            salones={salones}
            onValueChange={(v) => {
              nivelAuto.current = null
              onChange(aplicarNivel(hijo, v))
            }}
          />
          {sinSugerencia && (
            <p className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {publico
                ? 'Si no lo sabes, lo asignamos en la mesa de check-in.'
                : 'Sin salón sugerido para esta edad: elige el nivel o asígnalo manualmente.'}
            </p>
          )}
        </div>
      )}
      <SelectSiNo id={id('escolarizado')} label="¿Escolarizado?" value={hijo.escolarizado} onChange={(v) => set('escolarizado', v)} />
      <SelectSiNo id={id('comer')} label="¿Puede comer merienda?" value={hijo.puedeComer} onChange={(v) => set('puedeComer', v)} />
      <SelectSiNo id={id('panal')} label="¿Necesita cambio de pañal?" value={hijo.cambioPanal} onChange={(v) => set('cambioPanal', v)} />
      <SelectSiNo id={id('imagen')} label="¿Autoriza fotos?" value={hijo.autorizaImagen} onChange={(v) => set('autorizaImagen', v)} />
      <div className="sm:col-span-2">
        <TextareaSistema
          id={id('alergias')}
          label="Alergias"
          filas={2}
          maxLength={maxTexto}
          value={hijo.alergias}
          onChange={(e) => set('alergias', e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <TextareaSistema
          id={id('nee')}
          label="Necesidades especiales"
          filas={2}
          maxLength={maxTexto}
          value={hijo.necesidadesEspeciales}
          onChange={(e) => set('necesidadesEspeciales', e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <TextareaSistema
          id={id('habitos')}
          label="Hábitos"
          filas={2}
          maxLength={maxTexto}
          value={hijo.habitos}
          onChange={(e) => set('habitos', e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <TextareaSistema
          id={id('notas')}
          label="Notas"
          filas={2}
          maxLength={maxTexto}
          value={hijo.notas}
          onChange={(e) => set('notas', e.target.value)}
        />
      </div>
    </div>
  )
}

type CamposAutorizadosProps = {
  autorizados: AutorizadoForm[]
  onChange: (a: AutorizadoForm[]) => void
  /** At most this many people (a parent's limit); no limit by default. */
  maximo?: number
}

/** The people allowed to pick the children up. */
export function CamposAutorizados({ autorizados, onChange, maximo }: CamposAutorizadosProps) {
  const set = (i: number, campo: keyof AutorizadoForm, v: string) =>
    onChange(autorizados.map((a, j) => (j === i ? { ...a, [campo]: v } : a)))
  const lleno = maximo !== undefined && autorizados.length >= maximo

  return (
    <div className="space-y-3">
      {autorizados.map((a, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
          <InputSistema aria-label={`Nombre del autorizado ${i + 1}`} placeholder="Nombre" value={a.nombre} onChange={(e) => set(i, 'nombre', e.target.value)} />
          <InputSistema
            aria-label={`Teléfono del autorizado ${i + 1}`}
            placeholder="Teléfono"
            inputMode="tel"
            value={a.telefono}
            onChange={(e) => set(i, 'telefono', e.target.value)}
          />
          <InputSistema
            aria-label={`Relación del autorizado ${i + 1}`}
            placeholder="Relación (ej. abuela)"
            value={a.relacion}
            onChange={(e) => set(i, 'relacion', e.target.value)}
          />
          <BotonSistema type="button" variante="ghost" tamaño="sm" icono={X} onClick={() => onChange(autorizados.filter((_, j) => j !== i))}>
            Quitar
          </BotonSistema>
        </div>
      ))}
      {lleno ? (
        <p className="text-sm text-muted-foreground">Máximo {maximo} personas.</p>
      ) : (
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={Plus}
          onClick={() => onChange([...autorizados, { nombre: '', telefono: '', relacion: '' }])}
        >
          Agregar persona autorizada
        </BotonSistema>
      )}
    </div>
  )
}
