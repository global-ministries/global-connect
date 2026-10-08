'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ClipboardPlus, Pencil, Plus, Search, UserPlus, Users } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import { mensajeDeErrorFamilia } from '@/lib/platform/ninos/familia'
import { salonParaHijo, type FamiliaEncontrada, type HijoEncontrado, type SalonFila } from '@/lib/platform/ninos/familias-vista'

import { AdultoSinHijos } from './adulto-sin-hijos'
import { AgregarPadreForm } from './agregar-padre-form'
import { EditarNinoForm } from './editar-nino-form'
import { EncabezadoNinos } from './encabezado-ninos'
import { EstadoVacio } from './estado-vacio'
import { PanelLateralNinos } from './panel-lateral'
import { PreregistrosPendientes } from './preregistros-pendientes'
import { RegistrarFamiliaForm } from './registrar-familia-form'
import { SalonSugerido } from './salon-sugerido'
import { useBuscarFamilias } from './use-buscar-familias'
import { VincularHijoForm } from './vincular-hijo-form'

type Props = {
  salones: SalonFila[]
  /** YYYY-MM-DD of the next service, used for age-based suggestions. */
  fechaServicio: string
  /** Open the registration form directly (?nueva=1). */
  registrarAlInicio?: boolean
  /** Check-in URL to return to after registering (?volver=checkin). */
  volverCheckin?: string
}

type Vista = { tipo: 'buscar' } | { tipo: 'registrar' } | { tipo: 'agregar'; padre: { id: string; nombre: string } }

/** Mobile-first Familias screen: search, register, add a child; a child's ficha is edited in a side panel. */
export function FamiliasClient({ salones, fechaServicio, registrarAlInicio, volverCheckin }: Props) {
  const router = useRouter()
  const [vista, setVista] = useState<Vista>({ tipo: registrarAlInicio ? 'registrar' : 'buscar' })
  const [editando, setEditando] = useState<HijoEncontrado | null>(null)
  const [agregandoPadre, setAgregandoPadre] = useState<FamiliaEncontrada | null>(null)
  const [vinculandoHijo, setVinculandoHijo] = useState<{ id: string; nombre: string } | null>(null)
  const { q, setQ, familias, error, setError, buscando, buscar } = useBuscarFamilias()

  async function elegirSalon(hijoId: string, salonId: string) {
    const { error: err } = await createClient().from('ninos_fichas').update({ salon_preferido_id: salonId }).eq('usuario_id', hijoId)
    if (err) setError(mensajeDeErrorFamilia(err))
    else await buscar(q)
  }

  const volver = async () => {
    setVista({ tipo: 'buscar' })
    if (q.trim().length >= 2) await buscar(q)
  }

  if (vista.tipo === 'registrar' || vista.tipo === 'agregar') {
    const cancelar = volverCheckin && vista.tipo === 'registrar' ? () => router.push(volverCheckin) : volver
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 xl:max-w-5xl">
        <div className="space-y-3">
          <BotonSistema type="button" variante="ghost" tamaño="sm" icono={ArrowLeft} className="-ml-2" onClick={() => void cancelar()}>
            {volverCheckin && vista.tipo === 'registrar' ? 'Volver al check-in' : 'Volver a Familias'}
          </BotonSistema>
          <EncabezadoNinos
            titulo={vista.tipo === 'registrar' ? 'Nueva familia' : 'Agregar niño'}
            subtitulo={vista.tipo === 'registrar' ? 'Representante, niños y personas autorizadas para retirar.' : undefined}
          />
        </div>
        <RegistrarFamiliaForm
          padreExistente={vista.tipo === 'agregar' ? vista.padre : undefined}
          onCancelar={cancelar}
          onRegistrada={(padreId, consulta) =>
            volverCheckin && vista.tipo === 'registrar'
              ? router.push(`${volverCheckin}&padre=${encodeURIComponent(padreId)}&q=${encodeURIComponent(consulta)}`)
              : void volver()
          }
        />
      </div>
    )
  }

  const cerrarPanel = async () => {
    setEditando(null)
    setAgregandoPadre(null)
    setVinculandoHijo(null)
    if (q.trim().length >= 2) await buscar(q)
  }

  return (
    <>
      <EncabezadoNinos
        titulo="Familias"
        subtitulo="Busca una familia o registra una nueva."
        acciones={
          <BotonSistema type="button" icono={UserPlus} onClick={() => setVista({ tipo: 'registrar' })}>
            Nueva familia
          </BotonSistema>
        }
      />

      <PreregistrosPendientes
        onConfirmado={(_padreId, consulta) => {
          setQ(consulta)
          void buscar(consulta)
        }}
      />

      <form
        className="flex items-start gap-2 md:max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          void buscar(q)
        }}
      >
        <div className="min-w-0 flex-1">
          <InputSistema
            type="search"
            icono={Search}
            aria-label="Buscar familia"
            placeholder="Teléfono, nombre del representante o del niño"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <BotonSistema type="submit" icono={Search} disabled={buscando} aria-label="Buscar" />
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
      {familias && familias.length === 0 && (
        <EstadoVacio icono={Users} titulo="No se encontraron familias." subtitulo="Prueba con otro teléfono o nombre, o registra una nueva familia." />
      )}

      <ul className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {familias?.map((f) => (
          <li key={f.id} className="min-w-0">
            {f.sin_hijos ? (
              <AdultoSinHijos
                adulto={f}
                onAgregarNino={() => setVista({ tipo: 'agregar', padre: { id: f.id, nombre: `${f.nombre} ${f.apellido}` } })}
                onVincularHijo={() => setVinculandoHijo({ id: f.id, nombre: `${f.nombre} ${f.apellido}` })}
              />
            ) : (
              <TarjetaSistema data-testid="familia-tarjeta" className="space-y-4 p-4 md:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-[15px] font-semibold text-foreground">
                      {f.padres.map((p) => `${p.nombre} ${p.apellido}`).join(' · ')}
                    </p>
                    {f.telefono && <TextoSistema variante="sutil" tamaño="sm">{f.telefono}</TextoSistema>}
                  </div>
                  <BotonSistema
                    type="button"
                    variante="outline"
                    tamaño="sm"
                    icono={Plus}
                    className="shrink-0"
                    onClick={() => setVista({ tipo: 'agregar', padre: { id: f.id, nombre: `${f.nombre} ${f.apellido}` } })}
                  >
                    Agregar niño
                  </BotonSistema>
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {f.hijos.map((h) => (
                    <li key={h.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 break-words">
                          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                            {h.nombre} {h.apellido}
                            {h.es_vip_desde && (
                              <BadgeSistema variante="warning" tamaño="sm">
                                VIP
                              </BadgeSistema>
                            )}
                            {!h.tiene_ficha && (
                              <BadgeSistema variante="info" tamaño="sm">
                                Sin ficha de niños
                              </BadgeSistema>
                            )}
                          </p>
                          {h.alergias && <p className="text-sm font-medium text-destructive">Alergias: {h.alergias}</p>}
                        </div>
                        {h.tiene_ficha ? (
                          <BotonSistema type="button" variante="ghost" tamaño="sm" icono={Pencil} onClick={() => setEditando(h)}>
                            Editar
                          </BotonSistema>
                        ) : (
                          <BotonSistema type="button" variante="outline" tamaño="sm" icono={ClipboardPlus} className="shrink-0" onClick={() => setEditando(h)}>
                            Completar ficha
                          </BotonSistema>
                        )}
                      </div>
                      {h.tiene_ficha && (
                        <SalonSugerido
                          resultado={salonParaHijo(h, salones, fechaServicio)}
                          salones={salones}
                          onElegir={(salonId) => void elegirSalon(h.id, salonId)}
                        />
                      )}
                    </li>
                  ))}
                  {f.hijos.length === 0 && (
                    <li className="p-3">
                      <TextoSistema variante="sutil" tamaño="sm">
                        Sin niños registrados.
                      </TextoSistema>
                    </li>
                  )}
                </ul>
                {f.hijos.length > 0 && (
                  <BotonSistema type="button" variante="ghost" tamaño="sm" icono={UserPlus} onClick={() => setAgregandoPadre(f)}>
                    Agregar padre o madre
                  </BotonSistema>
                )}
              </TarjetaSistema>
            )}
          </li>
        ))}
      </ul>

      <PanelLateralNinos
        abierto={editando !== null}
        titulo={editando && !editando.tiene_ficha ? 'Completar ficha' : 'Editar ficha'}
        descripcion={editando ? `Datos de ${editando.nombre} ${editando.apellido}.` : ''}
        onCerrar={() => setEditando(null)}
      >
        {editando && (
          <EditarNinoForm key={editando.id} hijo={editando} onCancelar={() => setEditando(null)} onGuardado={() => void cerrarPanel()} />
        )}
      </PanelLateralNinos>

      <PanelLateralNinos
        abierto={agregandoPadre !== null}
        titulo="Agregar padre o madre"
        descripcion="Vincula a otra persona como padre o madre de estos niños."
        onCerrar={() => setAgregandoPadre(null)}
      >
        {agregandoPadre && (
          <AgregarPadreForm
            key={agregandoPadre.id}
            familia={agregandoPadre}
            onCancelar={() => setAgregandoPadre(null)}
            onVinculado={() => void cerrarPanel()}
          />
        )}
      </PanelLateralNinos>

      <PanelLateralNinos
        abierto={vinculandoHijo !== null}
        titulo="Vincular hijo existente"
        descripcion="Busca a un niño que ya está registrado y vincúlalo a esta persona."
        onCerrar={() => setVinculandoHijo(null)}
      >
        {vinculandoHijo && (
          <VincularHijoForm
            key={vinculandoHijo.id}
            adulto={vinculandoHijo}
            onCancelar={() => setVinculandoHijo(null)}
            onVinculado={() => void cerrarPanel()}
          />
        )}
      </PanelLateralNinos>
    </>
  )
}
