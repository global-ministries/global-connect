'use client'

import { Plus, X } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import { GENEROS, GRADOS, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'

type SiNo = boolean | null

const OPCIONES_SI_NO = [
  { valor: '', etiqueta: 'Sin indicar' },
  { valor: 'si', etiqueta: 'Sí' },
  { valor: 'no', etiqueta: 'No' },
]

/** Gender options with an empty "Elige…" choice first (shared with the representative's form). */
export const OPCIONES_GENERO = [{ valor: '', etiqueta: 'Elige…' }, ...GENEROS.map((g) => ({ valor: g, etiqueta: g }))]

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

type CamposNinoProps = {
  indice: number
  hijo: HijoForm
  onChange: (h: HijoForm) => void
}

/** The child's personal data and ficha fields. */
export function CamposNino({ indice, hijo, onChange }: CamposNinoProps) {
  const n = indice + 1
  const set = <K extends keyof HijoForm>(k: K, v: HijoForm[K]) => onChange({ ...hijo, [k]: v })
  const id = (campo: string) => `nino-${n}-${campo}`

  return (
    <div className="grid gap-4 sm:grid-cols-2">
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
        onChange={(e) => set('fechaNacimiento', e.target.value)}
      />
      <SelectSistema
        id={id('genero')}
        label="Género"
        aria-label={`Género del niño ${n}`}
        opciones={OPCIONES_GENERO}
        value={hijo.genero}
        onValueChange={(v) => set('genero', v)}
      />
      <SelectSistema
        id={id('grado')}
        label="Grado (UpStreet)"
        opciones={GRADOS.map((g) => ({ valor: g.valor, etiqueta: g.label }))}
        value={hijo.grado}
        onValueChange={(v) => set('grado', v)}
      />
      <SelectSiNo id={id('escolarizado')} label="¿Escolarizado?" value={hijo.escolarizado} onChange={(v) => set('escolarizado', v)} />
      <SelectSiNo id={id('comer')} label="¿Puede comer merienda?" value={hijo.puedeComer} onChange={(v) => set('puedeComer', v)} />
      <SelectSiNo id={id('panal')} label="¿Necesita cambio de pañal?" value={hijo.cambioPanal} onChange={(v) => set('cambioPanal', v)} />
      <SelectSiNo id={id('imagen')} label="¿Autoriza fotos?" value={hijo.autorizaImagen} onChange={(v) => set('autorizaImagen', v)} />
      <div className="sm:col-span-2">
        <TextareaSistema id={id('alergias')} label="Alergias" filas={2} value={hijo.alergias} onChange={(e) => set('alergias', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <TextareaSistema
          id={id('nee')}
          label="Necesidades especiales"
          filas={2}
          value={hijo.necesidadesEspeciales}
          onChange={(e) => set('necesidadesEspeciales', e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <TextareaSistema id={id('habitos')} label="Hábitos" filas={2} value={hijo.habitos} onChange={(e) => set('habitos', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <TextareaSistema id={id('notas')} label="Notas" filas={2} value={hijo.notas} onChange={(e) => set('notas', e.target.value)} />
      </div>
    </div>
  )
}

type CamposAutorizadosProps = {
  autorizados: AutorizadoForm[]
  onChange: (a: AutorizadoForm[]) => void
}

/** The people allowed to pick the children up. */
export function CamposAutorizados({ autorizados, onChange }: CamposAutorizadosProps) {
  const set = (i: number, campo: keyof AutorizadoForm, v: string) =>
    onChange(autorizados.map((a, j) => (j === i ? { ...a, [campo]: v } : a)))

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
      <BotonSistema
        type="button"
        variante="outline"
        tamaño="sm"
        icono={Plus}
        onClick={() => onChange([...autorizados, { nombre: '', telefono: '', relacion: '' }])}
      >
        Agregar persona autorizada
      </BotonSistema>
    </div>
  )
}
