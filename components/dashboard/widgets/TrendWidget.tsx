"use client"

import React from 'react'
import { TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

interface TrendPoint {
  semana_inicio: string
  porcentaje: number
}

interface TrendWidgetProps {
  id: string
  title: string
  data: TrendPoint[]
}

function labelSemana(fechaISO: string): string {
  try {
    const d = new Date(fechaISO)
    const day = d.getDate().toString().padStart(2, '0')
    const month = (d.getMonth() + 1).toString().padStart(2, '0')
    return `${day}/${month}`
  } catch {
    return fechaISO
  }
}

export function TrendWidget({ id, title, data }: TrendWidgetProps) {
  const chartData = data.map((p) => ({ name: labelSemana(p.semana_inicio), porcentaje: p.porcentaje, semana_inicio: p.semana_inicio }))
  return (
    <TarjetaSistema className="p-6">
      <TituloSistema nivel={3} className="mb-4">{title}</TituloSistema>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 12 }}
              labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
              formatter={(value: number) => [`${value}%`, 'Asistencia']}
            />
            <Line type="monotone" dataKey="porcentaje" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </TarjetaSistema>
  )
}
