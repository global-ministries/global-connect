"use client"
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

type Miembro = { id: string; nombre: string; apellido: string; rol?: string }

export default function AttendanceRegister({ grupoId, miembros }: { grupoId: string; miembros: Miembro[] }) {
  const router = useRouter()
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [tema, setTema] = useState<string>('')
  const [notas, setNotas] = useState<string>('')
  const [saving, setSaving] = useState<boolean>(false)
  const [estado, setEstado] = useState<Record<string, { presente: boolean; motivo?: string }>>(() => {
    const map: Record<string, { presente: boolean; motivo?: string }> = {}
    for (const m of miembros) map[m.id] = { presente: true }
    return map
  })
  const totalPresentes = useMemo(() => Object.values(estado).filter(v => v.presente).length, [estado])

  const marcarTodos = (presente: boolean) => {
    const map: Record<string, { presente: boolean; motivo?: string }> = {}
    for (const m of miembros) map[m.id] = { presente }
    setEstado(map)
  }

  const guardar = async () => {
    try {
      setSaving(true)
      const asistencias = miembros.map(m => ({
        usuario_id: m.id,
        presente: !!estado[m.id]?.presente,
        motivo_inasistencia: estado[m.id]?.presente ? null : (estado[m.id]?.motivo || null),
      }))
      const res = await fetch(`/api/grupos/${encodeURIComponent(grupoId)}/asistencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, hora: null, tema, notas, asistencias })
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudo registrar la asistencia')
      toast.success('Asistencia registrada')
      if (json.eventoId) {
        router.push(`/dashboard/grupos/${grupoId}/asistencia/${json.eventoId}`)
      } else {
        router.push(`/dashboard/grupos/${grupoId}`)
      }
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message || 'Error registrando asistencia')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Fecha</label>
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tema</label>
          <Input value={tema} onChange={e => setTema(e.target.value)} placeholder="Opcional" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notas</label>
          <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => marcarTodos(true)}>Marcar todos presentes</Button>
        <Button type="button" variant="outline" onClick={() => marcarTodos(false)}>Marcar todos ausentes</Button>
      </div>

      <div className="border rounded-lg divide-y">
        {miembros.map(m => (
          <div key={m.id} className="flex items-center gap-3 p-3">
            <Checkbox
              checked={!!estado[m.id]?.presente}
              onCheckedChange={(v) => setEstado(s => ({ ...s, [m.id]: { ...s[m.id], presente: !!v } }))}
            />
            <div className="flex-1">
              <div className="font-medium">{m.nombre} {m.apellido}</div>
              <div className="text-xs text-muted-foreground">{m.rol || 'Miembro'}</div>
            </div>
            {!estado[m.id]?.presente && (
              <Input
                className="max-w-xs"
                placeholder="Motivo de inasistencia (opcional)"
                value={estado[m.id]?.motivo || ''}
                onChange={e => setEstado(s => ({ ...s, [m.id]: { ...s[m.id], motivo: e.target.value } }))}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Presentes: {totalPresentes} / {miembros.length}</div>
        <Button onClick={guardar} className="bg-orange-600 hover:bg-orange-700" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar asistencia'}
        </Button>
      </div>
    </div>
  )
}
