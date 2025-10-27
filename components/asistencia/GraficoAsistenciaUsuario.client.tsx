"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'

type SerieTemporal = {
  mes: string
  porcentaje_asistencia: number
}

interface GraficoAsistenciaUsuarioProps {
  data: SerieTemporal[]
}

export default function GraficoAsistenciaUsuario({ data }: GraficoAsistenciaUsuarioProps) {
  // Formatear el mes para mostrar
  const formatearMes = (mes: string) => {
    const fecha = new Date(mes)
    const mesNombre = fecha.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
    return mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)
  }

  // Transformar datos para recharts
  const chartData = data.map(item => ({
    mes: formatearMes(item.mes),
    porcentaje: item.porcentaje_asistencia,
    fecha_original: item.mes
  }))

  return (
    <TarjetaSistema className="p-6">
      <TituloSistema nivel={3} className="mb-6">
        Tendencia de Asistencia Mensual
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
              dataKey="mes" 
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
              labelStyle={{ color: '#374151', fontWeight: 600 }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />
            <Line 
              type="monotone" 
              dataKey="porcentaje" 
              stroke="#3b82f6" 
              strokeWidth={3}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
              name="% Asistencia"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </TarjetaSistema>
  )
}
