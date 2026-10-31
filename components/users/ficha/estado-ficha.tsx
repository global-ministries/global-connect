/**
 * The ficha's non-data states: an error / not allowed / not found page, and
 * the loading skeleton that keeps the ficha's frame (hero, tabs, cards).
 * Server-safe.
 */
import Link from 'next/link'
import { AlertTriangle, Lock, UserX } from 'lucide-react'
import type { ReactElement } from 'react'

import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, PaginaSistema, SkeletonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'

export function ErrorFicha({
  motivo,
  mensaje,
  reintentarHref,
}: {
  readonly motivo: 'sin-permiso' | 'no-encontrado' | 'error'
  readonly mensaje: string
  readonly reintentarHref: string
}): ReactElement {
  const icono = motivo === 'sin-permiso' ? Lock : motivo === 'no-encontrado' ? UserX : AlertTriangle
  const titulo = motivo === 'sin-permiso' ? 'Sin permiso' : motivo === 'no-encontrado' ? 'Usuario no encontrado' : 'Error al cargar datos'
  return (
    <PaginaSistema regreso={{ href: '/users', texto: 'Volver a Usuarios' }}>
      <EstadoVacioSistema
        icono={icono}
        titulo={titulo}
        subtitulo={mensaje}
        accion={
          <div className="flex flex-wrap justify-center gap-3">
            {motivo === 'error' && (
              <BotonSistema asChild variante="primario">
                <Link href={reintentarHref}>Reintentar</Link>
              </BotonSistema>
            )}
            <BotonSistema asChild variante="outline">
              <Link href="/users">Volver a Usuarios</Link>
            </BotonSistema>
          </div>
        }
        className="min-h-[50vh] justify-center"
      />
    </PaginaSistema>
  )
}

export function CargandoFicha(): ReactElement {
  return (
    <PaginaSistema>
      <div role="status" aria-busy="true" className="grid gap-6">
        <span className="sr-only">Cargando datos del usuario</span>
        <div aria-hidden="true" className="flex items-center gap-4">
          <SkeletonSistema ancho="72px" alto="72px" />
          <div className="grid flex-1 gap-2">
            <SkeletonSistema ancho="min(60%, 320px)" alto="26px" />
            <SkeletonSistema ancho="min(80%, 380px)" alto="16px" />
          </div>
        </div>
        <SkeletonSistema ancho="min(100%, 520px)" alto="44px" />
        <div aria-hidden="true" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <TarjetaSistema key={i} className="grid gap-4 p-4 md:px-6 md:py-5">
              <SkeletonSistema ancho="160px" alto="18px" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <SkeletonSistema key={j} ancho="80%" alto="32px" />
                ))}
              </div>
            </TarjetaSistema>
          ))}
        </div>
      </div>
    </PaginaSistema>
  )
}
