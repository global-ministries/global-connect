'use client'

/**
 * Estudiantes — "Mi grupo" entry (/estudiantes, C3b of
 * odd/tasks/estudiantes-fase-b.md): the groups the caller sees
 * (estudiantes_mis_grupos) as a `ListaResponsiva`; a row opens that group's
 * leader list. Managers also get "Gestionar grupos" (/estudiantes/grupos) in
 * the header. A leader with a single group never lands here: the page sends
 * them straight to it.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Settings2, UsersRound } from 'lucide-react'

import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import type { GrupoMio } from '@/lib/platform/estudiantes/lista-datos'

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'grupo', titulo: 'Grupo', ancho: 'minmax(0,1.6fr)' },
  { id: 'ambito', titulo: 'Ámbito', ancho: 'minmax(0,1fr)' },
  { id: 'integrantes', titulo: 'Integrantes', ancho: 'minmax(0,0.6fr)' },
  { id: 'visitantes', titulo: 'Visitantes', ancho: 'minmax(0,0.6fr)', ocultarEnTablet: true },
]

export interface MisGruposClientProps {
  readonly grupos: readonly GrupoMio[]
  readonly puedeGestionar: boolean
}

export function MisGruposClient({ grupos, puedeGestionar }: MisGruposClientProps): ReactElement {
  const router = useRouter()
  const titulo = grupos.length === 1 ? 'Mi grupo' : 'Mis grupos'
  const resumen = (
    <>
      <strong className="font-mono tabular-nums">{grupos.length}</strong> {grupos.length === 1 ? 'grupo' : 'grupos'} · toca uno para marcar su asistencia
    </>
  )

  return (
    <PaginaSistema
      breadcrumbs={
        <nav aria-label="Ubicación">
          <span aria-current="page" className="px-2 py-1.5 text-sm font-semibold text-foreground">
            Estudiantes
          </span>
        </nav>
      }
      acciones={
        puedeGestionar && (
          <BotonSistema asChild variante="outline" tamaño="sm" icono={Settings2}>
            <Link href="/estudiantes/grupos">Gestionar grupos</Link>
          </BotonSistema>
        )
      }
    >
      <div className="md:hidden">
        <TituloGrande titulo={titulo} nivel={2} resumen={grupos.length > 0 ? resumen : undefined} />
        {puedeGestionar && (
          <BotonSistema asChild variante="outline" tamaño="sm" icono={Settings2} className="mt-3">
            <Link href="/estudiantes/grupos">Gestionar grupos</Link>
          </BotonSistema>
        )}
      </div>
      <div className="hidden md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">{titulo}</h1>
        {grupos.length > 0 && <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{resumen}</p>}
      </div>

      <ListaResponsiva
        etiqueta={titulo}
        columnas={COLUMNAS}
        filas={grupos}
        claveFila={(g) => g.grupoId}
        etiquetaFila={(g) => `Abrir la lista de ${g.nombre}`}
        onAbrirFila={(g) => router.push(`/estudiantes/grupos/${encodeURIComponent(g.grupoId)}`)}
        renderCelda={(g, columna) => {
          switch (columna) {
            case 'grupo':
              return (
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-foreground">{g.nombre}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{g.lideres.length > 0 ? g.lideres.join(', ') : 'Sin líder'}</p>
                </div>
              )
            case 'ambito':
              return <span className="truncate text-sm text-foreground">{`${g.ambito} · ${g.subarea}`}</span>
            case 'integrantes':
              return <span className="font-mono text-sm tabular-nums text-foreground">{g.miembros}</span>
            case 'visitantes':
              return <span className="font-mono text-sm tabular-nums text-foreground">{g.visitantes}</span>
            default:
              return null
          }
        }}
        renderFilaMovil={(g) => ({
          titulo: g.nombre,
          subtitulo: `${g.ambito} · ${g.subarea}`,
          meta: <span className="font-mono tabular-nums text-muted-foreground">{plural(g.miembros, 'integrante', 'integrantes')}</span>,
        })}
        vacio={
          <EstadoVacioSistema
            icono={UsersRound}
            titulo="Todavía no tienes un grupo"
            subtitulo={
              puedeGestionar ? 'Crea el primero desde «Gestionar grupos».' : 'Cuando la dirección te asigne como líder, tu grupo aparece aquí.'
            }
          />
        }
      />
    </PaginaSistema>
  )
}
