"use client"

import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface DonutChartProps {
  data: Array<{
    name: string
    value: number
    color: string
  }>
  centerText?: {
    value: string
    label: string
  }
}

export function DonutChart({ data, centerText }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const isEmpty = data.length === 0 || total === 0

  const formatPct = (v: number) => total === 0 ? '0%' : ((v / total) * 100).toFixed(1) + '%'

  return (
  <div className="flex flex-col gap-4">
      <div className="relative mx-auto lg:mx-0" style={{ width: 220, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={isEmpty ? [{ name: 'empty', value: 1, color: '#f1f5f9' }] : data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              isAnimationActive={!isEmpty}
            >
              {(isEmpty ? [{ color: '#f1f5f9' }] : data).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={(entry as any).color} />
              ))}
            </Pie>
            {!isEmpty && (
              <Tooltip
                formatter={(value: any, _name, p: any) => {
                  const val = Number(value)
                  return [val, `${p.payload.name} (${formatPct(val)})`]
                }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        {centerText && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 tracking-tight">
                {centerText.value}
              </div>
              <div className="text-xs font-medium text-gray-500 mt-1 px-2">
                {centerText.label}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1">
        <div className="mt-2 flex flex-col gap-3 min-w-[220px]">
          {isEmpty && (
            <div className="col-span-full text-sm text-gray-500 italic">
              No hay grupos en temporadas activas.
            </div>
          )}
          {!isEmpty && data.map((item, index) => {
            const pct = formatPct(item.value)
            return (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full ring-2 ring-white shadow"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-gray-700 break-words whitespace-normal" title={item.name}>{item.name}</span>
                </div>
                <span className="font-semibold text-gray-900 tabular-nums ml-2 whitespace-nowrap">{item.value} <span className="text-gray-500 font-normal">({pct})</span></span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
