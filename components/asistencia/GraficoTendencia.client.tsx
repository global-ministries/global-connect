"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'

type SerieTemporal = {
  semana: string
  porcentaje: number
}

interface GraficoTendenciaProps {
  data: SerieTemporal[]
}

export default function GraficoTendencia({ data }: GraficoTendenciaProps) {
  // Formateo manual en UTC para evitar desfases
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic']
  const parsearUTC = (s: string) => {
    const base = (s || '').slice(0,10)
    const [y,m,d] = base.split('-').map(Number)
    return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1))
  }
  const etiquetaCorta = (iso: string) => {
    const f = parsearUTC(iso)
    return `${f.getUTCDate()} ${meses[f.getUTCMonth()]}`
  }

  // Transformar datos para recharts
  const chartData = data.map(item => ({
    semana_label: etiquetaCorta(item.semana),
    porcentaje: item.porcentaje,
    fecha_original: item.semana
  }))

  return (
    <TarjetaSistema className="p-6">
      <TituloSistema nivel={3} className="mb-6">
        Tendencia de Asistencia
      </TituloSistema>
      
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <p className="text-lg">📊</p>
            <p className="mt-2">No hay datos suficientes para mostrar el gráfico</p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              type="category"
              dataKey="semana_label"
              interval={0}
              allowDuplicatedCategory={false}
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px 12px'
              }}
              formatter={(value: number) => [`${value}%`, 'Asistencia']}
              labelFormatter={(_, payload: any[]) => {
                const iso = payload && payload[0] && payload[0].payload ? payload[0].payload.fecha_original : undefined
                return iso ? etiquetaCorta(String(iso)) : ''
              }}
              labelStyle={{ color: '#374151', fontWeight: 600 }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />
            <Line 
              type="monotone" 
              dataKey="porcentaje" 
              stroke="#E96C20" 
              strokeWidth={3}
              dot={{ fill: '#E96C20', r: 4 }}
              activeDot={{ r: 6 }}
              name="% Asistencia"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </TarjetaSistema>
  )
}
