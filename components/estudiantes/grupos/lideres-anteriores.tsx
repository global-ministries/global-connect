'use client'

/**
 * Estudiantes › Grupos — "Líderes anteriores" in the group drawer (C6a of
 * odd/tasks/estudiantes-fase-b.md, L29): who led the group before, read only,
 * "Nombre Apellido" over "rol · ene 2025 – jun 2025", the most recently
 * closed first. Changing the leaders closes their period instead of deleting
 * it (estudiantes_grupo_lideres_fijar). Nothing shows while it loads or when
 * the group had no other leader; a long history collapses behind "Ver los N".
 * Mount it with a `key` of the current leaders so it reloads after a change.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarServidor } from '@/components/dream-team/servidores/lista-servidores'
import { historialLideres } from '@/lib/actions/estudiantes-grupos.actions'
import {
  lideresAnteriores,
  subtituloLiderAnterior,
  visiblesLideresAnteriores,
  type PeriodoLider,
} from '@/lib/platform/estudiantes/lideres-historial'

import { FilaInset, ListaInset, TituloSeccion } from '../filas-inset'

type Estado = { readonly tipo: 'listo'; readonly periodos: readonly PeriodoLider[] } | { readonly tipo: 'error'; readonly mensaje: string }

export function LideresAnteriores({ grupoId }: { readonly grupoId: string }): ReactElement | null {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [expandido, setExpandido] = useState(false)

  useEffect(() => {
    let vigente = true
    historialLideres({ grupoId }).then((respuesta) => {
      if (!vigente) return
      setEstado(respuesta.ok ? { tipo: 'listo', periodos: respuesta.data } : { tipo: 'error', mensaje: respuesta.message })
    })
    return () => {
      vigente = false
    }
  }, [grupoId])

  const anteriores = useMemo(() => (estado?.tipo === 'listo' ? lideresAnteriores(estado.periodos) : []), [estado])

  if (estado?.tipo === 'error') return <AvisoFormulario tono="error">{estado.mensaje}</AvisoFormulario>
  if (anteriores.length === 0) return null

  const { visibles, ocultos } = visiblesLideresAnteriores(anteriores, expandido)
  const plegable = expandido || ocultos > 0
  return (
    <section aria-labelledby="grupo-lideres-anteriores" className="space-y-2">
      <TituloSeccion id="grupo-lideres-anteriores" texto="Líderes anteriores" cantidad={anteriores.length} />
      <ListaInset etiqueta="Líderes anteriores">
        {visibles.map((periodo) => (
          <FilaInset
            key={`${periodo.servicioId}:${periodo.desde}`}
            avatar={<AvatarServidor nombre={periodo.nombre} />}
            titulo={periodo.nombre}
            subtitulo={subtituloLiderAnterior(periodo)}
          />
        ))}
      </ListaInset>
      {plegable && (
        <BotonSistema type="button" variante="ghost" tamaño="sm" aria-expanded={expandido} onClick={() => setExpandido((actual) => !actual)}>
          {expandido ? 'Ver menos' : `Ver los ${anteriores.length}`}
        </BotonSistema>
      )}
    </section>
  )
}
