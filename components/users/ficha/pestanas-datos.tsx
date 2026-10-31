/**
 * The Datos, Grupos and Servicio tabs of the ficha (prototype
 * 03-ficha-escritorio.html, `renderPanel`): read-only cards.
 */
import Link from 'next/link'
import { ArrowRight, Lock, MapPin, Users } from 'lucide-react'
import type { ReactElement } from 'react'

import LocationPicker from '@/components/maps/LocationPicker.client'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { GrupoAsistencia } from '@/lib/platform/usuarios/asistencia-persona'
import { estadoDeGrupo } from '@/lib/platform/usuarios/asistencia-vista'
import type { PersonaFicha, ResumenFicha } from '@/lib/platform/usuarios/ficha-persona'
import type { ServicioPersona } from '@/lib/platform/usuarios/ficha-servicio'
import { formatearTelefono } from '@/lib/utils/telefono'

import { edadDesde, EtiquetaNeutra, fechaFicha, ListaDatos, SeccionesFicha, TarjetaFicha } from './partes-ficha'

export function PestanaDatos({
  persona,
  resumen,
  puedeEditar,
  telefonoPorRevisar,
}: {
  readonly persona: PersonaFicha
  readonly resumen: ResumenFicha
  readonly puedeEditar: boolean
  readonly telefonoPorRevisar: boolean
}): ReactElement {
  const edad = edadDesde(persona.fechaNacimiento)
  const nacimiento = fechaFicha(persona.fechaNacimiento)
  const d = persona.direccion
  const conMapa = d !== null && d.latitud !== null && d.longitud !== null
  return (
    <SeccionesFicha>
      <TarjetaFicha titulo="Información personal">
        <ListaDatos
          datos={[
            { etiqueta: 'Cédula', valor: persona.cedula, mono: true },
            { etiqueta: 'Nacimiento', valor: nacimiento ? `${nacimiento}${edad !== null ? ` · ${edad} años` : ''}` : null },
            { etiqueta: 'Género', valor: persona.genero },
            { etiqueta: 'Estado civil', valor: persona.estadoCivil },
            { etiqueta: 'Ocupación', valor: persona.ocupacion },
            { etiqueta: 'Profesión', valor: persona.profesion },
          ]}
        />
      </TarjetaFicha>
      <TarjetaFicha titulo="Contacto">
        <ListaDatos
          dos
          datos={[
            {
              etiqueta: 'Teléfono',
              valor: persona.telefono ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-mono tabular-nums tracking-[-0.02em]">{formatearTelefono(persona.telefono)}</span>
                  {telefonoPorRevisar && (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-text">Revisar</span>
                  )}
                </span>
              ) : null,
            },
            { etiqueta: 'Email', valor: persona.email ? <span className="break-all">{persona.email}</span> : null },
            { etiqueta: 'Registro', valor: fechaFicha(persona.fechaRegistro) },
            { etiqueta: 'Campus', valor: resumen.campus },
          ]}
        />
      </TarjetaFicha>
      <TarjetaFicha titulo="Ubicación" ancha>
        {d ? (
          <>
            <ListaDatos
              datos={[
                { etiqueta: 'País', valor: d.pais },
                { etiqueta: 'Estado', valor: d.estado },
                { etiqueta: 'Municipio', valor: d.municipio },
                { etiqueta: 'Parroquia', valor: d.parroquia },
                { etiqueta: 'Calle', valor: d.calle },
                { etiqueta: 'Barrio', valor: d.barrio },
                { etiqueta: 'Código postal', valor: d.codigoPostal, mono: true },
                { etiqueta: 'Referencia', valor: d.referencia },
              ]}
            />
            {conMapa ? (
              <LocationPicker
                lat={d.latitud as number}
                lng={d.longitud as number}
                center={{ lat: d.latitud as number, lng: d.longitud as number }}
                draggable={false}
                height={220}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">No hay coordenadas para mostrar el mapa.</p>
            )}
          </>
        ) : (
          <EstadoVacioSistema
            icono={MapPin}
            titulo="Sin dirección registrada"
            subtitulo={puedeEditar ? 'Agrégala desde «Editar» para verla en el mapa.' : 'Todavía no tiene dirección.'}
            className="py-7"
          />
        )}
      </TarjetaFicha>
    </SeccionesFicha>
  )
}

/** Current and past Grupos de Vida (from obtener_asistencia_persona over the whole history). */
export function PestanaGrupos({ grupos }: { readonly grupos: readonly GrupoAsistencia[] | null }): ReactElement {
  if (grupos === null) {
    return (
      <TarjetaFicha titulo="Grupos de Vida">
        <EstadoVacioSistema icono={Lock} titulo="No puedes ver sus grupos" subtitulo="Los ven sus líderes y los responsables de su campus." className="py-7" />
      </TarjetaFicha>
    )
  }
  if (grupos.length === 0) {
    return (
      <TarjetaFicha titulo="Grupos de Vida">
        <EstadoVacioSistema icono={Users} titulo="No está en un Grupo de Vida" subtitulo="Se agrega desde la página del grupo." className="py-7" />
      </TarjetaFicha>
    )
  }
  return (
    <SeccionesFicha>
      {grupos.map((g) => {
        const estado = estadoDeGrupo(g)
        return (
          <TarjetaFicha key={g.id} titulo={g.nombre}>
            {g.area && <p className="-mt-2 text-[13px] text-muted-foreground">{`Segmento ${g.area}`}</p>}
            <div className="flex flex-wrap items-center gap-2.5">
              <EtiquetaNeutra>{g.rol}</EtiquetaNeutra>
              <PuntoEstado tono={estado.tono} etiqueta={estado.texto} />
            </div>
            <div className="flex justify-end">
              <BotonSistema asChild variante="ghost" tamaño="sm" icono={ArrowRight} iconoPosicion="derecha">
                <Link href={`/grupos-vida/${g.id}`}>Ver grupo</Link>
              </BotonSistema>
            </div>
          </TarjetaFicha>
        )
      })}
    </SeccionesFicha>
  )
}

export function PestanaServicio({ servicios }: { readonly servicios: readonly ServicioPersona[] }): ReactElement {
  if (servicios.length === 0) {
    return (
      <TarjetaFicha titulo="Dream Team">
        <EstadoVacioSistema icono={Users} titulo="No sirve en Dream Team" subtitulo="Se asigna desde Servidores o Mi equipo." className="py-7" />
      </TarjetaFicha>
    )
  }
  return (
    <SeccionesFicha>
      {servicios.map((s) => (
        <TarjetaFicha key={s.id} titulo={s.equipo}>
          {s.ruta && <p className="-mt-2 text-[13px] text-muted-foreground">{s.ruta}</p>}
          <div>
            <PuntoEstado tono={s.tono} etiqueta={s.etapa} />
          </div>
          <ListaDatos dos datos={[{ etiqueta: 'Rol', valor: s.rol }, { etiqueta: 'Desde', valor: fechaFicha(s.desde) }]} />
        </TarjetaFicha>
      ))}
    </SeccionesFicha>
  )
}
