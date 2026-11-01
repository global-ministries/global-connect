'use client'

/**
 * "Foto de perfil" options (decision 2 of S14; prototype `abrirFoto`): a
 * centered dialog from md, a bottom sheet on phones. Upload (or the gallery),
 * the camera (the computer's camera from md; on phones the native camera
 * through `capture`), and remove with a confirmation. Saved at once.
 */
import { Camera, Trash2, Upload, type LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactElement, type ReactNode } from 'react'

import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HojaInferior } from '@/components/ui/hoja-inferior'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'

import { CamaraEscritorio } from './camara-escritorio'

const NOTA = 'Se guarda al momento, aparte de los demás cambios. JPG, PNG o WebP de hasta 5 MB; se optimiza sola.'

function Opcion({ icono: Icono, titulo, detalle, peligro, onClick, disabled }: {
  readonly icono: LucideIcon
  readonly titulo: string
  readonly detalle: string
  readonly peligro?: boolean
  readonly onClick: () => void
  readonly disabled?: boolean
}): ReactElement {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'focus-ring flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-base text-foreground transition-colors hover:bg-accent disabled:opacity-50',
          peligro && 'text-danger-text',
        )}
      >
        <Icono aria-hidden="true" className="size-[18px] shrink-0" />
        <span className="min-w-0">
          {titulo}
          <small className="block text-[13px] text-muted-foreground">{detalle}</small>
        </span>
      </button>
    </li>
  )
}

export interface DialogoFotoProps {
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  readonly tieneFoto: boolean
  readonly ocupado: boolean
  readonly error: string | null
  readonly onArchivo: (archivo: File) => void
  readonly onQuitar: () => void
}

export function DialogoFoto({ abierto, onAbiertoChange, tieneFoto, ocupado, error, onArchivo, onQuitar }: DialogoFotoProps): ReactElement {
  const escritorio = useEsEscritorio() ?? true
  const galeria = useRef<HTMLInputElement>(null)
  const camaraMovil = useRef<HTMLInputElement>(null)
  const [camara, setCamara] = useState(false)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)

  const elegido = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (archivo) onArchivo(archivo)
  }

  const opciones: ReactNode = (
    <div className="grid gap-3">
      <ul className="grid gap-0.5">
        <Opcion
          icono={Upload}
          titulo={escritorio ? 'Subir una foto' : 'Elegir de la galería'}
          detalle={escritorio ? 'Desde los archivos del computador' : 'Fotos del teléfono'}
          onClick={() => galeria.current?.click()}
          disabled={ocupado}
        />
        <Opcion
          icono={Camera}
          titulo={escritorio ? 'Usar la cámara' : 'Tomar foto'}
          detalle={escritorio ? 'Cámara del computador' : 'Abre la cámara del teléfono'}
          onClick={() => (escritorio ? setCamara(true) : camaraMovil.current?.click())}
          disabled={ocupado}
        />
        {tieneFoto && (
          <Opcion icono={Trash2} titulo="Quitar foto" detalle="Vuelve a mostrar sus iniciales" peligro onClick={() => setConfirmarQuitar(true)} disabled={ocupado} />
        )}
      </ul>
      {ocupado && <p role="status" className="text-[13px] text-muted-foreground">Guardando la foto…</p>}
      {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}
      <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={elegido} data-testid="foto-galeria" />
      <input ref={camaraMovil} type="file" accept="image/*" capture="user" className="hidden" onChange={elegido} data-testid="foto-camara" />
    </div>
  )

  return (
    <>
      {escritorio ? (
        <Dialog open={abierto && !camara} onOpenChange={onAbiertoChange}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Foto de perfil</DialogTitle>
              <DialogDescription>{NOTA}</DialogDescription>
            </DialogHeader>
            {opciones}
            <DialogFooter>
              <BotonSistema type="button" variante="outline" onClick={() => onAbiertoChange(false)}>
                Cancelar
              </BotonSistema>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <HojaInferior abierta={abierto} onCambioAbierta={onAbiertoChange} titulo="Foto de perfil" descripcion={NOTA}>
          {opciones}
        </HojaInferior>
      )}
      <CamaraEscritorio
        abierta={abierto && camara}
        onCerrar={() => setCamara(false)}
        onFoto={(archivo) => {
          setCamara(false)
          onArchivo(archivo)
        }}
      />
      <Dialog open={confirmarQuitar} onOpenChange={setConfirmarQuitar}>
        <DialogContent role="alertdialog" className="rounded-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Quitar la foto?</DialogTitle>
            <DialogDescription>Se borra al momento y vuelven a verse sus iniciales.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <BotonSistema type="button" variante="outline" onClick={() => setConfirmarQuitar(false)} autoFocus>
              Cancelar
            </BotonSistema>
            <BotonSistema
              type="button"
              variante="peligro"
              onClick={() => {
                setConfirmarQuitar(false)
                onQuitar()
              }}
            >
              Quitar foto
            </BotonSistema>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
