'use client'

/**
 * "Ubicación" of Editar persona (prototype `ubicacion`, `renderMapa`): the
 * family address suggestion, País → Estado → Municipio → Parroquia (each
 * change clears the levels below), calle (required only once another
 * address field is filled, decision 5), barrio, código postal, referencia,
 * and the map pin (LocationPicker). Changing the place centers the map
 * (geocodeAddress; Iribarren has a fixed center) and moves the pin there.
 */
import { Lightbulb, MapPin } from 'lucide-react'
import { useState, type ReactElement } from 'react'

import LocationPicker from '@/components/maps/LocationPicker.client'
import { geocodeAddress } from '@/lib/actions/location.actions'
import type { SugerenciaDireccionFamiliar } from '@/lib/actions/direccion-familiar.actions'
import type { CampoEdicion, ValoresEdicion } from '@/lib/platform/usuarios/editar-validacion'
import { geografiaDeParroquia, type CatalogosGeografia } from '@/lib/platform/usuarios/editar-vista'

import { TarjetaFicha } from '../ficha/partes-ficha'

import { CampoSelect, CampoTexto, type EstadoCampo } from './campos-editar'

const CENTRO_POR_DEFECTO = { lat: 10.4681, lng: -66.8792 }
const CENTRO_IRIBARREN = { lat: 10.078726345593038, lng: -69.28487917698043 }

export interface SeccionUbicacionProps {
  readonly valores: ValoresEdicion
  readonly estado: (campo: CampoEdicion) => EstadoCampo
  readonly onCambiar: (parcial: Partial<ValoresEdicion>) => void
  readonly onTocar: (campo: CampoEdicion) => void
  readonly catalogos: CatalogosGeografia
  /** Shown only while the person has no saved street. */
  readonly sugerencias: readonly SugerenciaDireccionFamiliar[]
}

export function SeccionUbicacion({ valores: v, estado, onCambiar, onTocar, catalogos, sugerencias }: SeccionUbicacionProps): ReactElement {
  const [centro, setCentro] = useState(v.lat !== null && v.lng !== null ? { lat: v.lat, lng: v.lng } : CENTRO_POR_DEFECTO)
  const [nota, setNota] = useState('')
  const nombre = (lista: readonly { id: string; nombre: string }[], id: string) => lista.find((x) => x.id === id)?.nombre

  const moverPin = (lat: number, lng: number, texto = '') => {
    setCentro({ lat, lng })
    setNota(texto)
    onCambiar({ lat, lng })
  }

  /** Centers the map on the chosen place, as the legacy form did. */
  const centrar = (geo: Pick<ValoresEdicion, 'pais_id' | 'estado_id' | 'municipio_id'>) => {
    const municipio = nombre(catalogos.municipios, geo.municipio_id)
    const lugar = [municipio, nombre(catalogos.estados, geo.estado_id), nombre(catalogos.paises, geo.pais_id)].filter(Boolean).join(', ')
    if (municipio?.toLowerCase() === 'iribarren') return moverPin(CENTRO_IRIBARREN.lat, CENTRO_IRIBARREN.lng, `El mapa se centró en ${municipio}. Mueve el pin hasta la casa.`)
    if (!lugar) return
    geocodeAddress(lugar)
      .then((r) => {
        if (r.success && typeof r.lat === 'number' && typeof r.lng === 'number') moverPin(r.lat, r.lng, `El mapa se centró en ${lugar.split(',')[0]}. Mueve el pin hasta la casa.`)
      })
      .catch(() => undefined)
  }

  const elegir = (campo: 'pais_id' | 'estado_id' | 'municipio_id' | 'parroquia_id', valor: string) => {
    onTocar(campo)
    const parcial: Partial<ValoresEdicion> =
      campo === 'pais_id' ? { pais_id: valor, estado_id: '', municipio_id: '', parroquia_id: '' }
        : campo === 'estado_id' ? { estado_id: valor, municipio_id: '', parroquia_id: '' }
          : campo === 'municipio_id' ? { municipio_id: valor, parroquia_id: '' }
            : { parroquia_id: valor }
    onCambiar(parcial)
    if (campo !== 'parroquia_id') centrar({ ...v, ...parcial })
  }

  const usarSugerencia = (s: SugerenciaDireccionFamiliar) => {
    const d = s.direccion
    onCambiar({
      calle: d.calle,
      barrio: d.barrio ?? v.barrio,
      codigo_postal: d.codigo_postal ?? v.codigo_postal,
      referencia: d.referencia ?? v.referencia,
      ...(d.parroquia_id ? { ...geografiaDeParroquia(d.parroquia_id, catalogos), parroquia_id: d.parroquia_id } : {}),
      ...(d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : {}),
    })
    if (d.lat !== null && d.lng !== null) setCentro({ lat: d.lat, lng: d.lng })
    setNota('')
    document.getElementById('f-calle')?.focus()
  }

  const opciones = (lista: readonly { id: string; nombre: string }[]) => lista.map((x) => ({ valor: x.id, etiqueta: x.nombre }))
  const texto = (campo: 'calle' | 'barrio' | 'codigo_postal' | 'referencia') => ({
    campo,
    value: v[campo],
    onCambio: (valor: string) => onCambiar({ [campo]: valor }),
    onBlur: () => onTocar(campo),
    ...estado(campo),
  })

  return (
    <TarjetaFicha titulo="Ubicación" ancha>
      {sugerencias.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/5 p-3.5 text-sm">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-info-text" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <p className="font-semibold text-foreground">{sugerencias.length === 1 ? 'Sugerencia de dirección' : 'Sugerencias de dirección'}</p>
            <ul className="grid gap-0.5">
              {sugerencias.map((s) => (
                <li key={s.familiar_id}>
                  <button
                    type="button"
                    onClick={() => usarSugerencia(s)}
                    className="focus-ring -mx-2 grid min-h-11 w-[calc(100%+1rem)] justify-items-start gap-0.5 rounded-xl px-2 py-1.5 text-left text-foreground transition-colors hover:bg-accent"
                  >
                    <span>Usar la dirección de su {s.relacion_label.toLowerCase()} ({s.familiar_nombre})</span>
                    <small className="flex items-center gap-1 text-[13px] text-muted-foreground">
                      <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                      {s.direccion.calle}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted-foreground">Si no vive en la misma dirección, ignora esta sugerencia.</p>
          </div>
        </div>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CampoSelect campo="pais_id" etiqueta="País" placeholder="Selecciona el país" opciones={opciones(catalogos.paises)} value={v.pais_id} onCambio={(x) => elegir('pais_id', x)} {...estado('pais_id')} />
        <CampoSelect
          campo="estado_id" etiqueta="Estado" placeholder={v.pais_id ? 'Selecciona el estado' : 'Primero el país'} disabled={!v.pais_id}
          opciones={opciones(catalogos.estados.filter((e) => e.pais_id === v.pais_id))} value={v.estado_id} onCambio={(x) => elegir('estado_id', x)} {...estado('estado_id')}
        />
        <CampoSelect
          campo="municipio_id" etiqueta="Municipio" placeholder={v.estado_id ? 'Selecciona el municipio' : 'Primero el estado'} disabled={!v.estado_id}
          opciones={opciones(catalogos.municipios.filter((m) => m.estado_id === v.estado_id))} value={v.municipio_id} onCambio={(x) => elegir('municipio_id', x)} {...estado('municipio_id')}
        />
        <CampoSelect
          campo="parroquia_id" etiqueta="Parroquia" disabled={!v.municipio_id}
          opciones={[{ valor: '', etiqueta: 'Sin parroquia' }, ...opciones(catalogos.parroquias.filter((p) => p.municipio_id === v.municipio_id))]}
          value={v.parroquia_id} onCambio={(x) => elegir('parroquia_id', x)} {...estado('parroquia_id')}
        />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <CampoTexto etiqueta="Calle" autoComplete="address-line1" placeholder="Calle, avenida o carrera" ayuda="Obligatoria solo si guardas una dirección." {...texto('calle')} />
        <CampoTexto etiqueta="Sector o urbanización" autoComplete="address-line2" {...texto('barrio')} />
        <CampoTexto etiqueta="Código postal" autoComplete="postal-code" inputMode="numeric" maxLength={8} {...texto('codigo_postal')} />
        <CampoTexto etiqueta="Referencia" autoComplete="off" placeholder="Un punto conocido cerca de la casa" {...texto('referencia')} />
      </div>
      <div className="grid gap-2">
        <div className="overflow-hidden rounded-xl border border-border">
          <LocationPicker lat={v.lat ?? undefined} lng={v.lng ?? undefined} center={centro} onLocationChange={({ lat, lng }) => moverPin(lat, lng)} />
        </div>
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {v.lat !== null && v.lng !== null ? (
            <>
              Pin en <span className="font-mono tabular-nums text-foreground">{v.lat.toFixed(4)}, {v.lng.toFixed(4)}</span>
              {estado('ubicacion').modificado && <span className="sr-only"> (modificado)</span>}
            </>
          ) : (
            'Sin ubicar: elige estado y municipio, o mueve el pin hasta la casa.'
          )}
          {nota && <span className="block">{nota}</span>}
        </p>
      </div>
    </TarjetaFicha>
  )
}
