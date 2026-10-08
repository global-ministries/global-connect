'use client'

import { useCallback, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { mensajeDeErrorFamilia } from '@/lib/platform/ninos/familia'
import {
  parseFamilias,
  salonParaHijo,
  type FamiliaEncontrada,
  type HijoEncontrado,
  type SalonFila,
} from '@/lib/platform/ninos/familias-vista'

import { EditarNinoForm } from './editar-nino-form'
import { RegistrarFamiliaForm } from './registrar-familia-form'
import { SalonSugerido } from './salon-sugerido'

type Props = {
  salones: SalonFila[]
  /** YYYY-MM-DD of the next service, used for age-based suggestions. */
  fechaServicio: string
}

type Vista =
  | { tipo: 'buscar' }
  | { tipo: 'registrar' }
  | { tipo: 'agregar'; padre: { id: string; nombre: string } }
  | { tipo: 'editar'; hijo: HijoEncontrado }

/** Mobile-first Familias screen: search, register, add a child, edit a ficha. */
export function FamiliasClient({ salones, fechaServicio }: Props) {
  const [vista, setVista] = useState<Vista>({ tipo: 'buscar' })
  const [q, setQ] = useState('')
  const [familias, setFamilias] = useState<FamiliaEncontrada[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  const buscar = useCallback(async (texto: string) => {
    if (texto.trim().length < 2) return
    setBuscando(true)
    setError(null)
    const { data, error: err } = await createClient().rpc('ninos_buscar_familias', { p_q: texto.trim() })
    setBuscando(false)
    if (err) {
      setError(mensajeDeErrorFamilia(err))
      setFamilias(null)
      return
    }
    setFamilias(parseFamilias(data))
  }, [])

  async function elegirSalon(hijoId: string, salonId: string) {
    const { error: err } = await createClient().from('ninos_fichas').update({ salon_preferido_id: salonId }).eq('usuario_id', hijoId)
    if (err) setError(mensajeDeErrorFamilia(err))
    else await buscar(q)
  }

  const volver = async () => {
    setVista({ tipo: 'buscar' })
    if (q.trim().length >= 2) await buscar(q)
  }

  if (vista.tipo === 'registrar' || vista.tipo === 'agregar') {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{vista.tipo === 'registrar' ? 'Nueva familia' : 'Agregar niño'}</h1>
        <RegistrarFamiliaForm
          padreExistente={vista.tipo === 'agregar' ? vista.padre : undefined}
          onCancelar={volver}
          onRegistrada={volver}
        />
      </div>
    )
  }

  if (vista.tipo === 'editar') {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Editar ficha</h1>
        <EditarNinoForm hijo={vista.hijo} onCancelar={volver} onGuardado={volver} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Familias</h1>
        <Button className="h-11" onClick={() => setVista({ tipo: 'registrar' })}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden />
          Nueva familia
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void buscar(q)
        }}
      >
        <Input
          aria-label="Buscar familia"
          placeholder="Teléfono, nombre del representante o del niño"
          className="h-11"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" className="h-11" disabled={buscando} aria-label="Buscar">
          <Search className="h-4 w-4" aria-hidden />
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {familias && familias.length === 0 && <p className="text-sm text-muted-foreground">No se encontraron familias.</p>}

      <ul className="space-y-3">
        {familias?.map((f) => (
          <li key={f.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {f.nombre} {f.apellido}
                </p>
                {f.telefono && <p className="text-sm text-muted-foreground">{f.telefono}</p>}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setVista({ tipo: 'agregar', padre: { id: f.id, nombre: `${f.nombre} ${f.apellido}` } })}
              >
                Agregar niño
              </Button>
            </div>
            <ul className="space-y-2">
              {f.hijos.map((h) => (
                <li key={h.id} className="space-y-2 rounded-md bg-muted/50 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {h.nombre} {h.apellido}
                        {h.es_vip_desde && (
                          <Badge className="ml-2" variant="outline">
                            VIP
                          </Badge>
                        )}
                      </p>
                      {h.alergias && <p className="text-sm text-destructive">Alergias: {h.alergias}</p>}
                    </div>
                    <Button variant="ghost" size="sm" className="h-9" onClick={() => setVista({ tipo: 'editar', hijo: h })}>
                      Editar
                    </Button>
                  </div>
                  <SalonSugerido
                    resultado={salonParaHijo(h, salones, fechaServicio)}
                    salones={salones}
                    onElegir={(salonId) => void elegirSalon(h.id, salonId)}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
