'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { GENEROS, GRADOS, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'

export const SELECT_CLASS = 'h-11 w-full rounded-md border bg-background px-3 text-sm'

type SiNo = boolean | null

function SelectSiNo({ id, label, value, onChange }: { id: string; label: string; value: SiNo; onChange: (v: SiNo) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value === null ? '' : value ? 'si' : 'no'}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'si')}
      >
        <option value="">Sin indicar</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    </div>
  )
}

type CamposNinoProps = {
  indice: number
  hijo: HijoForm
  onChange: (h: HijoForm) => void
  /** Name, birth date and gender live in usuarios and are not editable here. */
  soloFicha?: boolean
}

/** The child's personal data and ficha fields. */
export function CamposNino({ indice, hijo, onChange, soloFicha }: CamposNinoProps) {
  const n = indice + 1
  const set = <K extends keyof HijoForm>(k: K, v: HijoForm[K]) => onChange({ ...hijo, [k]: v })
  const id = (campo: string) => `nino-${n}-${campo}`

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!soloFicha && (
        <>
          <div className="space-y-1">
            <Label htmlFor={id('nombre')}>Nombre</Label>
            <Input id={id('nombre')} aria-label={`Nombre del niño ${n}`} value={hijo.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id('apellido')}>Apellido</Label>
            <Input id={id('apellido')} aria-label={`Apellido del niño ${n}`} value={hijo.apellido} onChange={(e) => set('apellido', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id('nacimiento')}>Fecha de nacimiento</Label>
            <Input
              id={id('nacimiento')}
              type="date"
              aria-label={`Fecha de nacimiento del niño ${n}`}
              value={hijo.fechaNacimiento}
              onChange={(e) => set('fechaNacimiento', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id('genero')}>Género</Label>
            <select id={id('genero')} aria-label={`Género del niño ${n}`} className={SELECT_CLASS} value={hijo.genero} onChange={(e) => set('genero', e.target.value)}>
              <option value="">Elige…</option>
              {GENEROS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="space-y-1">
        <Label htmlFor={id('grado')}>Grado (UpStreet)</Label>
        <select id={id('grado')} className={SELECT_CLASS} value={hijo.grado} onChange={(e) => set('grado', e.target.value)}>
          {GRADOS.map((g) => (
            <option key={g.valor} value={g.valor}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      <SelectSiNo id={id('escolarizado')} label="¿Escolarizado?" value={hijo.escolarizado} onChange={(v) => set('escolarizado', v)} />
      <SelectSiNo id={id('comer')} label="¿Puede comer merienda?" value={hijo.puedeComer} onChange={(v) => set('puedeComer', v)} />
      <SelectSiNo id={id('panal')} label="¿Necesita cambio de pañal?" value={hijo.cambioPanal} onChange={(v) => set('cambioPanal', v)} />
      <SelectSiNo id={id('imagen')} label="¿Autoriza fotos?" value={hijo.autorizaImagen} onChange={(v) => set('autorizaImagen', v)} />
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id('alergias')}>Alergias</Label>
        <Textarea id={id('alergias')} rows={2} value={hijo.alergias} onChange={(e) => set('alergias', e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id('nee')}>Necesidades especiales</Label>
        <Textarea id={id('nee')} rows={2} value={hijo.necesidadesEspeciales} onChange={(e) => set('necesidadesEspeciales', e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id('habitos')}>Hábitos</Label>
        <Textarea id={id('habitos')} rows={2} value={hijo.habitos} onChange={(e) => set('habitos', e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id('notas')}>Notas</Label>
        <Textarea id={id('notas')} rows={2} value={hijo.notas} onChange={(e) => set('notas', e.target.value)} />
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
        <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-3">
          <Input aria-label={`Nombre del autorizado ${i + 1}`} placeholder="Nombre" value={a.nombre} onChange={(e) => set(i, 'nombre', e.target.value)} />
          <Input aria-label={`Teléfono del autorizado ${i + 1}`} placeholder="Teléfono" inputMode="tel" value={a.telefono} onChange={(e) => set(i, 'telefono', e.target.value)} />
          <div className="flex gap-2">
            <Input aria-label={`Relación del autorizado ${i + 1}`} placeholder="Relación (ej. abuela)" value={a.relacion} onChange={(e) => set(i, 'relacion', e.target.value)} />
            <button
              type="button"
              className="shrink-0 px-2 text-sm text-muted-foreground underline"
              onClick={() => onChange(autorizados.filter((_, j) => j !== i))}
            >
              Quitar
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-primary underline"
        onClick={() => onChange([...autorizados, { nombre: '', telefono: '', relacion: '' }])}
      >
        + Agregar persona autorizada
      </button>
    </div>
  )
}
