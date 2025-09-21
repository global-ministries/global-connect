"use client"
import { useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, TituloSistema, BotonSistema, TextoSistema } from "@/components/ui/sistema-diseno"
import Link from "next/link"
import { ArrowLeft, Upload, Download } from "lucide-react"

export default function ImportarGruposPage() {
  const [file, setFile] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    try {
      setSubiendo(true)
      setError(null)
      setResultado(null)
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/import/grupos', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error al importar')
      setResultado(json)
    } catch (e: any) {
      setError(e?.message || 'Error inesperado')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Importar Grupos por CSV"
        descripcion="Sube un archivo .csv para crear grupos y miembros automáticamente"
        accionPrincipal={
          <Link href="/dashboard/grupos">
            <BotonSistema variante="outline" tamaño="sm">
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Volver</span>
            </BotonSistema>
          </Link>
        }
      >
        <TarjetaSistema>
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Archivo CSV</label>
              <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} />
              <div className="flex items-center gap-3">
                <Link href="/plantillas/import-grupos.csv" target="_blank" download>
                  <BotonSistema variante="ghost" tamaño="sm" icono={Download}>
                    Descargar plantilla CSV
                  </BotonSistema>
                </Link>
                <TextoSistema variante="sutil" tamaño="sm">Encabezados requeridos: nombre_grupo, segmento, temporada, miembros</TextoSistema>
              </div>
              <TextoSistema variante="muted" tamaño="sm">Formato miembros: "Nombre Apellido|Líder|12345678; Otra Persona|Miembro|87654321" (separa miembros con ;, cédula opcional en la 3ra posición)</TextoSistema>
            </div>

            <div>
              <BotonSistema type="submit" variante="primario" tamaño="md" disabled={!file || subiendo} cargando={subiendo} icono={Upload}>
                Subir CSV
              </BotonSistema>
            </div>
          </form>
        </TarjetaSistema>

        {error && (
          <TarjetaSistema className="mt-4">
            <p className="text-red-600 text-sm">{error}</p>
          </TarjetaSistema>
        )}

        {resultado && (
          <TarjetaSistema className="mt-4">
            <TituloSistema nivel={3}>Resultado</TituloSistema>
            <div className="mt-3 space-y-2 text-sm">
              {resultado.resultados?.map((r: any, idx: number) => (
                <div key={idx} className={r.ok ? 'text-green-700' : 'text-red-600'}>
                  Fila {r.fila}: {r.detalle}
                  {r.grupoId && <span className="text-gray-500"> (ID: {r.grupoId})</span>}
                </div>
              ))}
            </div>
          </TarjetaSistema>
        )}
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
