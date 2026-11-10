/**
 * «Mi grupo de vida» (design/home-por-rol section 4b): a group where the
 * person is Miembro or Colíder. The colíder is read as a member with more
 * view (S6): «Colíder · solo lectura» and a read-only link, never an action
 * that edits the group or takes attendance.
 */
import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, Check, MapPin, Users, type LucideIcon } from 'lucide-react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import type { DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import { cn } from '@/lib/utils'

import { EncabezadoSeccion, EnlaceSeccion, IconoTile, Numero } from './partes-inicio'
import { fechaCorta, hora12, listaNombres, rutaGrupo } from './textos-inicio'

type Props = {
  readonly grupoId: string
  readonly nombre: string | null
  readonly soloLectura: boolean
  /** The person also leads something: the heading tells this group apart. */
  readonly conCargo: boolean
  readonly datos?: DatosGrupoMiembro
  readonly className?: string
}

function Dato({ icono: Icono, children }: { readonly icono: LucideIcon; readonly children: ReactNode }): ReactElement {
  return (
    <li className="flex min-w-0 items-start gap-2.5 text-sm text-foreground">
      <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

function EnlaceExterno({ href, children }: { readonly href: string; readonly children: string }): ReactElement {
  return (
    <BotonSistema asChild variante="outline" className="w-full">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    </BotonSistema>
  )
}

export function SeccionGrupoMiembro({ grupoId, nombre, soloLectura, conCargo, datos, className }: Props): ReactElement {
  const id = `inicio-grupo-${grupoId}`
  const titulo = datos?.nombre ?? nombre ?? 'Tu grupo de vida'
  const lideres = datos?.lideres ?? []
  const reunion = datos?.proximaReunion
  const enlaces = soloLectura
    ? []
    : [
        { texto: 'Cómo llegar', href: datos?.comoLlegar },
        { texto: 'Escribir al líder', href: datos?.escribirLider },
      ].flatMap(({ texto, href }) => (href ? [{ texto, href }] : []))

  return (
    <section aria-labelledby={id} className={className}>
      <EncabezadoSeccion id={id} titulo={conCargo ? 'Grupo donde soy miembro' : 'Mi grupo de vida'}>
        {!soloLectura && <EnlaceSeccion href={rutaGrupo(grupoId)}>Ver grupo</EnlaceSeccion>}
      </EncabezadoSeccion>
      <TarjetaSistema className="p-4 md:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <IconoTile icono={Users} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] font-semibold leading-tight tracking-[-0.01em] text-foreground">{titulo}</h3>
            {lideres.length > 0 && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {lideres.length === 1 ? 'Líder' : 'Líderes'}: {listaNombres(lideres)}
              </p>
            )}
            {soloLectura && <PuntoEstado tono="info" etiqueta="Colíder · solo lectura" className="mt-1.5" />}
          </div>
        </div>

        <ul className="mt-3 grid gap-2">
          {reunion && (
            <Dato icono={CalendarDays}>
              <span className="font-semibold">
                {fechaCorta(reunion.fecha)}
                {reunion.hora && (
                  <>
                    {' · '}
                    <Numero>{hora12(reunion.hora)}</Numero>
                  </>
                )}
              </span>
            </Dato>
          )}
          {datos?.lugar && <Dato icono={MapPin}>{datos.lugar}</Dato>}
          {datos?.asistencia && (
            <Dato icono={Check}>
              Fuiste a <Numero>{datos.asistencia.fui}</Numero> de las últimas <Numero>{datos.asistencia.de}</Numero> reuniones
            </Dato>
          )}
        </ul>

        {soloLectura ? (
          <BotonSistema asChild variante="outline" className="mt-3.5 w-full">
            <Link href={rutaGrupo(grupoId)}>Ver asistencia y miembros</Link>
          </BotonSistema>
        ) : (
          enlaces.length > 0 && (
            <div className={cn('mt-3.5 grid gap-2.5', enlaces.length > 1 && 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
              {enlaces.map(({ texto, href }) => (
                <EnlaceExterno key={texto} href={href}>
                  {texto}
                </EnlaceExterno>
              ))}
            </div>
          )
        )}
      </TarjetaSistema>
    </section>
  )
}
