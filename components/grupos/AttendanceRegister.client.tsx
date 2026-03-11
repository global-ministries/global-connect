"use client"
import { useMemo, useState, useEffect } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  TextareaSistema,
} from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { useRouter } from 'next/navigation'

type Miembro = { id: string; nombre: string; apellido: string; rol?: string }

type InitialData = {
  fecha?: string
  hora?: string | null
  tema?: string | null
  notas?: string | null
  estado?: Record<string, { presente: boolean; motivo?: string }>
}

export default function AttendanceRegister({ grupoId, miembros, initialData, isEdit }: { grupoId: string; miembros: Miembro[]; initialData?: InitialData; isEdit?: boolean }) {
  const router = useRouter()
  const toast = useNotificaciones()
  const [fecha, setFecha] = useState<string>(() => initialData?.fecha || new Date().toISOString().slice(0, 10))
  // Guardamos internamente hora en formato 24h (HH:MM) pero UI usa 12h + AM/PM
  const [hora, setHora] = useState<string>(() => (initialData?.hora ? initialData.hora.slice(0, 5) : ''))
  const parseToUi = (h24: string): { h: string; m: string; ap: 'AM' | 'PM' } => {
    if (!h24) return { h: '', m: '', ap: 'AM' }
    const [HH, MM] = h24.split(':')
    let hh = parseInt(HH, 10)
    const ap = hh >= 12 ? 'PM' : 'AM'
    if (hh === 0) hh = 12
    else if (hh > 12) hh = hh - 12
    return { h: String(hh), m: MM, ap: ap as 'AM' | 'PM' }
  }
  const initialUi = parseToUi(hora)
  const [hora12, setHora12] = useState<string>(initialUi.h)
  const [minutos, setMinutos] = useState<string>(initialUi.m)
  const [amPm, setAmPm] = useState<'AM' | 'PM'>(initialUi.ap as 'AM' | 'PM')
  const [tema, setTema] = useState<string>(() => initialData?.tema || '')
  const [notas, setNotas] = useState<string>(() => initialData?.notas || '')
  const [saving, setSaving] = useState<boolean>(false)
  const [estado, setEstado] = useState<Record<string, { presente: boolean; motivo?: string }>>(() => {
    if (initialData?.estado) return initialData.estado
    const map: Record<string, { presente: boolean; motivo?: string }> = {}
    for (const m of miembros) map[m.id] = { presente: true }
    return map
  })

  useEffect(() => {
    if (initialData) {
      setFecha(initialData.fecha || new Date().toISOString().slice(0, 10))
      const hRaw = initialData.hora ? initialData.hora.slice(0, 5) : ''
      setHora(hRaw)
      const ui = parseToUi(hRaw)
      setHora12(ui.h)
      setMinutos(ui.m)
      setAmPm(ui.ap as 'AM' | 'PM')
      setTema(initialData.tema || '')
      setNotas(initialData.notas || '')
      if (initialData.estado) setEstado(initialData.estado)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialData)])

  const totalPresentes = useMemo(() => Object.values(estado).filter(v => v.presente).length, [estado])

  const rolLabel = (rol?: string) => {
    if (!rol) return 'Miembro'
    // Soporta variantes con/sin acento
    if (rol === 'Colíder' || rol === 'Colider') return 'Aprendiz'
    return rol
  }

  const marcarTodos = (presente: boolean) => {
    const map: Record<string, { presente: boolean; motivo?: string }> = {}
    for (const m of miembros) map[m.id] = { presente }
    setEstado(map)
  }

  const to24h = (h: string, m: string, ap: 'AM' | 'PM'): string | null => {
    if (!h || !m) return null
    let hh = parseInt(h, 10)
    if (isNaN(hh) || hh < 1 || hh > 12) return null
    if (ap === 'AM') {
      if (hh === 12) hh = 0
    } else { // PM
      if (hh !== 12) hh += 12
    }
    const HH = String(hh).padStart(2, '0')
    const MM = m.padStart(2, '0')
    return `${HH}:${MM}`
  }

  const guardar = async () => {
    try {
      setSaving(true)
      const asistencias = miembros.map(m => ({
        usuario_id: m.id,
        presente: !!estado[m.id]?.presente,
        motivo_inasistencia: estado[m.id]?.presente ? null : (estado[m.id]?.motivo || null),
      }))
      const horaFinal = to24h(hora12, minutos, amPm)
      const res = await fetch(`/api/grupos/${encodeURIComponent(grupoId)}/asistencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, hora: horaFinal, tema, notas, asistencias })
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudo registrar la asistencia')
      toast.success(isEdit ? 'Asistencia actualizada' : 'Asistencia registrada')
      if (json.eventoId) {
        router.push(`/dashboard/grupos/${grupoId}/asistencia/${json.eventoId}`)
      } else {
        router.push(`/dashboard/grupos/${grupoId}`)
      }
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error registrando asistencia')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Fecha</label>
          <InputSistema type="date" value={fecha} onChange={e => setFecha(e.target.value)} disabled={!!isEdit} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Hora</label>
          <div className="flex items-center gap-2">
            <SelectSistema
              value={hora12}
              onValueChange={setHora12}
              opciones={[
                { valor: '', etiqueta: 'HH' },
                ...Array.from({ length: 12 }).map((_, i) => ({ valor: String(i + 1), etiqueta: String(i + 1) }))
              ]}
            />
            <span className="text-sm text-muted-foreground">:</span>
            <SelectSistema
              value={minutos}
              onValueChange={setMinutos}
              opciones={[
                { valor: '', etiqueta: 'MM' },
                ...Array.from({ length: 60 }).map((_, i) => ({ valor: String(i).padStart(2, '0'), etiqueta: String(i).padStart(2, '0') }))
              ]}
            />
            <SelectSistema
              value={amPm}
              onValueChange={(v: string) => setAmPm(v as 'AM' | 'PM')}
              opciones={[
                { valor: 'AM', etiqueta: 'AM' },
                { valor: 'PM', etiqueta: 'PM' },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Tema</label>
          <InputSistema value={tema} onChange={e => setTema(e.target.value)} placeholder="Opcional" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-1">Notas</label>
          <TextareaSistema
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Opcional"
            rows={3}
          />
        </div>
        <div className="flex items-end pb-1 text-xs text-muted-foreground">{hora12 && minutos ? `Hora seleccionada: ${hora12.padStart(2, '0')}:${minutos} ${amPm}` : 'Sin hora'}</div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <BotonSistema variante="outline" onClick={() => marcarTodos(true)} className="flex-1 sm:flex-none">
          <span className="sm:hidden">✓ Todos presentes</span>
          <span className="hidden sm:inline">Marcar todos presentes</span>
        </BotonSistema>
        <BotonSistema variante="outline" onClick={() => marcarTodos(false)} className="flex-1 sm:flex-none">
          <span className="sm:hidden">✗ Todos ausentes</span>
          <span className="hidden sm:inline">Marcar todos ausentes</span>
        </BotonSistema>
      </div>

      <div className="border border-border rounded-xl divide-y divide-border">
        {miembros.map(m => (
          <div key={m.id} className="p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={!!estado[m.id]?.presente}
                onCheckedChange={(v) => setEstado(s => ({ ...s, [m.id]: { ...s[m.id], presente: !!v } }))}
              />
              <div className="flex-1">
                <div className="font-medium">{m.nombre} {m.apellido}</div>
                <div className="text-xs text-muted-foreground">{rolLabel(m.rol)}</div>
              </div>
            </div>
            {!estado[m.id]?.presente && (
              <div className="mt-3 ml-7">
                <InputSistema
                  className="w-full"
                  placeholder="Motivo de inasistencia (opcional)"
                  value={estado[m.id]?.motivo || ''}
                  onChange={e => setEstado(s => ({ ...s, [m.id]: { ...s[m.id], motivo: e.target.value } }))}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Presentes: {totalPresentes} / {miembros.length}</div>
        <BotonSistema variante="primario" onClick={guardar} disabled={saving}>
          {saving ? 'Guardando…' : (isEdit ? 'Actualizar asistencia' : 'Guardar asistencia')}
        </BotonSistema>
      </div>
    </div>
  )
}
