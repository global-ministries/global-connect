"use client"

import React from 'react'
import { TarjetaSistema, TituloSistema, TextoSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { UserAvatar } from '@/components/ui/UserAvatar'

interface CumpleItem {
  id: string
  nombre_completo: string
  foto_url?: string | null
  fecha_nacimiento: string
  proximo?: string
}

interface BirthdayWidgetProps {
  id: string
  title: string
  items: CumpleItem[]
}

function formatearFechaLarga(fechaISO: string): string {
  try {
    const d = new Date(fechaISO)
    return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long' })
  } catch {
    return fechaISO
  }
}

export function BirthdayWidget({ id, title, items }: BirthdayWidgetProps) {
  const [mostrarTodos, setMostrarTodos] = React.useState(false)
  const hayMas = items.length > 5
  const visibles = mostrarTodos ? items : items.slice(0, 5)

  return (
    <TarjetaSistema className="p-6">
      <TituloSistema nivel={3} className="mb-4">{title}</TituloSistema>
      {items.length === 0 ? (
        <TextoSistema variante="sutil">No hay cumpleaños en los próximos 14 días</TextoSistema>
      ) : (
        <>
          <div className="space-y-3">
            {visibles.map((p) => {
              const [nombre, ...resto] = p.nombre_completo.split(' ')
              const apellido = resto.join(' ')
              return (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar photoUrl={p.foto_url || undefined} nombre={nombre} apellido={apellido} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{p.nombre_completo}</div>
                      <TextoSistema variante="sutil" tamaño="sm" className="truncate">
                        {formatearFechaLarga(p.proximo || p.fecha_nacimiento)}
                      </TextoSistema>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {hayMas && (
            <div className="mt-4">
              <BotonSistema variante="ghost" tamaño="sm" onClick={() => setMostrarTodos(v => !v)}>
                {mostrarTodos ? 'Ver menos' : `Ver más (+${items.length - 5})`}
              </BotonSistema>
            </div>
          )}
        </>
      )}
    </TarjetaSistema>
  )
}
