'use client'

/**
 * The "Mi familia" tab of /perfil (S15 decisions 2, 5, 6, 8 and 9; prototype
 * docs/design-system/prototipos/usuarios/07-mi-familia-escritorio.html and
 * 08-mi-familia-celular.html): incoming requests first, then "Tu familia"
 * (confirmed links), "Solicitudes enviadas" and the privacy callout.
 * "Agregar familiar" sits on the card from md and is the FAB on phones.
 * Every change goes through lib/actions/familia.actions.ts and refreshes the
 * page, so the lists and the tab count come from the server.
 */
import { ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cancelarSolicitud, quitarFamiliar, responderSolicitud, type ResultadoFamilia } from '@/lib/actions/familia.actions'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { nombreCompleto, type MiFamilia as DatosMiFamilia, type SolicitudRecibida } from '@/lib/platform/usuarios/familia-vista'

import { TarjetaFicha } from '../ficha/partes-ficha'

import { DialogoConfirmar, type ConfirmacionFamilia } from './dialogo-confirmar'
import { FilaEnviada, FilaFamiliar, SolicitudEntrante } from './filas-familia'
import { HojaAgregarFamiliar } from './hoja-agregar-familiar'
import { useHojaFamiliar, type AvisoEnviado } from './use-hoja-familiar'

const HASH_MIS_HIJOS = '#mis-hijos'
const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre

export interface MiFamiliaProps {
  /** familia_mis_solicitudes, parsed; null when it could not be read. */
  readonly familia: DatosMiFamilia | null
  /** The caller's main campus, for the search label. */
  readonly campus: string | null
}

export function MiFamilia({ familia, campus }: MiFamiliaProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const [abierto, setAbierto] = useState(false)
  const [confirmacion, setConfirmacion] = useState<ConfirmacionFamilia | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const h = useHojaFamiliar((aviso: AvisoEnviado) => {
    setAbierto(false)
    toast.success(`${aviso.titulo.replace(/\.$/, '')}. ${aviso.texto}`)
    router.refresh()
  })

  const abrirHoja = () => {
    h.reiniciar()
    setAbierto(true)
  }

  const irAMisHijos = () => {
    setAbierto(false)
    window.location.hash = HASH_MIS_HIJOS
  }

  /** Runs one change; true when it worked. */
  const aplicar = async (accion: () => Promise<ResultadoFamilia<unknown>>, exito: string): Promise<boolean> => {
    const r = await accion()
    if (!r.ok) {
      toast.error(r.mensaje)
      return false
    }
    toast.success(exito)
    router.refresh()
    return true
  }

  const confirmarCon = (c: Omit<ConfirmacionFamilia, 'alConfirmar'>, accion: () => Promise<ResultadoFamilia<unknown>>, exito: string) =>
    setConfirmacion({
      ...c,
      alConfirmar: async () => {
        setOcupado(true)
        await aplicar(accion, exito)
        setOcupado(false)
        setConfirmacion(null)
      },
    })

  const confirmar = async (s: SolicitudRecibida) => {
    setRespondiendo(s.id)
    await aplicar(() => responderSolicitud(s.id, true), `${primerNombre(s.nombre)} ya está en tu familia.`)
    setRespondiendo(null)
  }

  if (!familia) {
    return <EstadoVacioSistema icono={Users} titulo="No pudimos cargar tu familia" subtitulo="Recarga la página para intentarlo de nuevo." />
  }

  const { familiares, enviadas, recibidas } = familia
  const agregar = (
    <BotonSistema type="button" tamaño="sm" icono={UserPlus} onClick={abrirHoja} className="max-md:hidden">
      Agregar familiar
    </BotonSistema>
  )

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-3 max-md:pb-[72px] md:grid-cols-2 md:gap-4">
      {recibidas.map((s) => (
        <SolicitudEntrante
          key={s.id}
          solicitud={s}
          ocupado={respondiendo === s.id}
          onConfirmar={(r) => void confirmar(r)}
          onRechazar={(r) =>
            confirmarCon(
              { titulo: 'No es mi familiar', texto: `La solicitud se cierra. Si ${primerNombre(r.nombre)} vuelve a insistir, avisa a tu líder.`, accion: 'No es mi familiar' },
              () => responderSolicitud(r.id, false),
              'Solicitud cerrada.',
            )
          }
        />
      ))}

      <TarjetaFicha titulo="Tu familia" accion={agregar} ancha={enviadas.length === 0}>
        {familiares.length > 0 ? (
          <ul className="grid">
            {familiares.map((f) => (
              <FilaFamiliar
                key={f.relacionId}
                familiar={f}
                onVerMisHijos={irAMisHijos}
                onQuitar={(x) =>
                  confirmarCon(
                    { titulo: 'Quitar de tu familia', texto: `¿Quitar a ${nombreCompleto(x)} de tu familia? Su ficha se mantiene; solo se borra el vínculo.`, accion: 'Quitar' },
                    () => quitarFamiliar(x.relacionId),
                    'Vínculo quitado.',
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <EstadoVacioSistema
            icono={Users}
            className="py-8"
            titulo="Todavía no tienes familiares vinculados"
            subtitulo={
              recibidas.length > 0
                ? 'Responde la solicitud de arriba o agrega a tu familia. Cada persona confirma antes de aparecer aquí.'
                : 'Agrega a tu cónyuge, padres o hermanos. Cada persona confirma antes de aparecer aquí.'
            }
            accion={recibidas.length === 0 ? <BotonSistema type="button" icono={UserPlus} onClick={abrirHoja}>Agregar familiar</BotonSistema> : undefined}
          />
        )}
      </TarjetaFicha>

      {enviadas.length > 0 && (
        <TarjetaFicha titulo="Solicitudes enviadas">
          <p className="-mt-1.5 text-[13px] text-muted-foreground">Aparecen en tu familia cuando la otra persona o tu campus las confirma.</p>
          <ul className="grid">
            {enviadas.map((s) => (
              <FilaEnviada
                key={s.id}
                solicitud={s}
                onCancelar={(x) =>
                  confirmarCon(
                    { titulo: 'Cancelar solicitud', texto: `¿Cancelar la solicitud a ${nombreCompleto(x)}? No se le avisará.`, accion: 'Cancelar solicitud' },
                    () => cancelarSolicitud(x.id),
                    'Solicitud cancelada.',
                  )
                }
              />
            ))}
          </ul>
        </TarjetaFicha>
      )}

      <AvisoFormulario tono="info" className="col-span-full flex items-start gap-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info-text" />
        <div>
          <p className="font-semibold">Nadie entra a tu familia sin confirmar</p>
          <p className="mt-0.5 text-muted-foreground">
            Quien agregas ve solo tu nombre y la relación. Los hijos menores de 13 años van en{' '}
            <button type="button" onClick={irAMisHijos} className="focus-ring font-semibold text-foreground underline underline-offset-2">
              Mis hijos
            </button>
            , con sus datos de Niños.
          </p>
        </div>
      </AvisoFormulario>

      <BotonFlotante onClick={abrirHoja} icono={UserPlus} label="Agregar familiar" />
      <HojaAgregarFamiliar abierto={abierto} onCambioAbierto={setAbierto} h={h} campus={campus} hoy={hoyEnCaracas()} onIrAMisHijos={irAMisHijos} />
      <DialogoConfirmar confirmacion={confirmacion} ocupado={ocupado} onCerrar={() => setConfirmacion(null)} />
    </div>
  )
}
