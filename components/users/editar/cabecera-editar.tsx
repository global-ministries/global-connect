'use client'

/**
 * The top of Editar persona (prototype `.ed-hero`, decision 2 of S14): the
 * ficha's avatar with a camera button, the eyebrow ("Editar persona", or
 * "Mis datos" on /perfil), the name, the ficha's identity line, and
 * "Cambiar foto" from md. The photo saves at once through DialogoFoto.
 */
import { Camera } from 'lucide-react'
import { useState, type ReactElement } from 'react'

import { BotonAtrasMovil } from '@/components/ui/barra-navegacion-movil'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { ETIQUETA_CUENTA, type CuentaEstado } from '@/lib/platform/usuarios/lista-vista'
import { cn } from '@/lib/utils'

import { AvatarFicha, EtiquetaNeutra } from '../ficha/partes-ficha'

import { DialogoFoto } from './dialogo-foto'
import { quitarFoto, subirFoto } from './foto-subir'

/** The ficha's identity line (role, campus, account); each part is optional. */
export interface IdentidadEditar {
  readonly rol: string | null
  readonly campus: string | null
  readonly cuenta: CuentaEstado | null
}

export interface CabeceraEditarProps {
  readonly usuarioId: string
  readonly nombre: string
  readonly apellido: string
  readonly fotoUrl: string | null
  readonly identidad: IdentidadEditar | null
  readonly esPerfil: boolean
}

export function CabeceraEditar({ usuarioId, nombre, apellido, fotoUrl: fotoInicial, identidad, esPerfil }: CabeceraEditarProps): ReactElement {
  const toast = useNotificaciones()
  const [foto, setFoto] = useState<string | null>(fotoInicial)
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const completo = `${nombre} ${apellido}`.trim()
  const claseNombre = 'text-2xl font-bold leading-[1.15] tracking-[-0.02em] text-foreground md:font-[650] [overflow-wrap:anywhere]'

  const aplicar = async (accion: () => ReturnType<typeof quitarFoto>, aviso: string) => {
    setOcupado(true)
    setError(null)
    const r = await accion()
    setOcupado(false)
    if (!r.ok) return setError(r.error)
    setFoto(r.url)
    setAbierto(false)
    toast.success(aviso)
  }

  const abrir = (a: boolean) => {
    setAbierto(a)
    if (a) setError(null)
  }

  return (
    <div className="grid gap-4">
      {!esPerfil && (
        <div className="-mx-2 -mt-2 md:hidden">
          <BotonAtrasMovil atras={{ etiqueta: 'Ficha', href: `/users/${usuarioId}` }} />
        </div>
      )}
      <section aria-label="Identidad" className="flex min-w-0 items-center gap-3.5 md:gap-[18px]">
        <div className="relative shrink-0">
          <AvatarFicha nombre={nombre} apellido={apellido} fotoUrl={foto} tamano="xl" />
          <button
            type="button"
            onClick={() => abrir(true)}
            aria-label={`Cambiar foto de ${completo}`}
            className="focus-ring absolute -right-1.5 -bottom-1.5 grid size-8 place-items-center rounded-full border-2 border-background bg-brand-strong text-white transition-colors hover:bg-brand-strong-hover after:absolute after:-inset-1.5 after:content-['']"
          >
            <Camera aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[13px] font-medium text-muted-foreground max-md:hidden">{esPerfil ? 'Mis datos' : 'Editar persona'}</p>
          <h1 className={cn(claseNombre, 'max-md:hidden')}>{completo}</h1>
          <h2 className={cn(claseNombre, 'md:hidden')}>{completo}</h2>
          {identidad && (identidad.rol || identidad.campus || identidad.cuenta) && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
              {identidad.rol && <EtiquetaNeutra>{identidad.rol}</EtiquetaNeutra>}
              {identidad.campus && <span>{identidad.campus}</span>}
              {identidad.cuenta && <PuntoEstado tono={ETIQUETA_CUENTA[identidad.cuenta].tono} etiqueta={ETIQUETA_CUENTA[identidad.cuenta].etiqueta} />}
            </p>
          )}
        </div>
        <BotonSistema type="button" variante="outline" tamaño="sm" icono={Camera} onClick={() => abrir(true)} className="shrink-0 max-md:hidden">
          Cambiar foto
        </BotonSistema>
      </section>
      <p className="text-[13px] text-muted-foreground">
        Los campos con <span aria-hidden="true">*</span>
        <span className="sr-only">asterisco</span> son obligatorios. La foto se guarda al momento; lo demás, con «Guardar cambios».
      </p>
      <DialogoFoto
        abierto={abierto}
        onAbiertoChange={abrir}
        tieneFoto={Boolean(foto)}
        ocupado={ocupado}
        error={error}
        onArchivo={(archivo) => aplicar(() => subirFoto(archivo, usuarioId), 'Foto actualizada')}
        onQuitar={() => aplicar(() => quitarFoto(usuarioId), 'Foto quitada')}
      />
    </div>
  )
}
