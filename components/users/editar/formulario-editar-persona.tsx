'use client'

/**
 * Editar persona on design system v2 (S14 of odd/tasks/sistema-diseno-v2.md;
 * prototype docs/design-system/prototipos/usuarios/05-editar-escritorio.html
 * and 06-editar-celular.html). Used by /users/[id]/edit and by /perfil
 * ("Mis datos", `esPerfil`). The ficha's section cards with fields, a save
 * bar that appears with changes (decision 1), the leave guard (decision 9)
 * and updateUser, which answers field errors (cédula, calle) or redirects
 * to the ficha; on /perfil it stays with a toast (decision 11). On /perfil
 * the page renders CabeceraEditar above its tabs (S15 decision 1), so the
 * form starts with the required-field note only.
 */
import { useRouter } from 'next/navigation'
import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { updateUser } from '@/lib/actions/user.actions'
import type { SugerenciaDireccionFamiliar } from '@/lib/actions/direccion-familiar.actions'
import type { CampoEdicion } from '@/lib/platform/usuarios/editar-validacion'
import { datosParaGuardar, valoresDesdeUsuario, type CatalogosGeografia, type UsuarioEditable } from '@/lib/platform/usuarios/editar-vista'

import { SeccionesFicha } from '../ficha/partes-ficha'

import { BarraGuardar, DialogoDescartar } from './barra-guardar'
import { CabeceraEditar, NotaObligatorios, type IdentidadEditar } from './cabecera-editar'
import { idCampo, type EstadoCampo } from './campos-editar'
import { ResumenErrores } from './resumen-errores'
import { SeccionContacto, SeccionPersonal } from './secciones-datos'
import { SeccionUbicacion } from './seccion-ubicacion'
import { useFormularioEditar } from './use-formulario-editar'
import { useGuardaSalida } from './use-guarda-salida'

export interface FormularioEditarPersonaProps {
  readonly usuario: UsuarioEditable
  readonly identidad: IdentidadEditar | null
  readonly ocupaciones: readonly { id: string; nombre: string }[]
  readonly profesiones: readonly { id: string; nombre: string }[]
  readonly catalogos: CatalogosGeografia
  readonly sugerenciasDireccion?: readonly SugerenciaDireccionFamiliar[]
  readonly esPerfil?: boolean
}

export function FormularioEditarPersona({ usuario, identidad, ocupaciones, profesiones, catalogos, sugerenciasDireccion = [], esPerfil = false }: FormularioEditarPersonaProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const [inicial] = useState(() => valoresDesdeUsuario(usuario))
  const f = useFormularioEditar(inicial)
  const guarda = useGuardaSalida(f.cambios.length > 0)
  const [guardando, setGuardando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const resumenRef = useRef<HTMLHeadingElement>(null)

  const estado = (campo: CampoEdicion): EstadoCampo => ({
    modificado: f.cambios.includes(campo),
    error: f.visibles[campo],
    aviso: f.avisos[campo],
  })

  const guardar = async () => {
    if (guardando) return
    f.intentar()
    setErrorGeneral(null)
    if (Object.keys(f.errores).length > 0) {
      // The summary renders with this state; focus it on the next frame.
      requestAnimationFrame(() => resumenRef.current?.focus())
      return
    }
    setGuardando(true)
    try {
      const r = await updateUser(usuario.id, datosParaGuardar(f.valores), esPerfil)
      if (r && !r.ok) {
        f.errorDelServidor(r.campo, r.error)
        requestAnimationFrame(() => document.getElementById(idCampo(r.campo))?.focus())
        return
      }
      f.confirmarGuardado()
      toast.success(esPerfil ? 'Tus datos están al día.' : 'Cambios guardados.')
      if (esPerfil) router.refresh()
    } catch (e) {
      setErrorGeneral(e instanceof Error && e.message ? e.message : 'No se pudieron guardar los cambios. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const alPresionarTecla = (e: KeyboardEvent<HTMLFormElement>) => {
    // Enter in a text field saves (decision 8); the form has no submit button of its own.
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && f.cambios.length > 0) {
      e.preventDefault()
      void guardar()
    }
  }

  const cancelar = () => guarda.pedirSalida(esPerfil ? f.descartar : `/users/${usuario.id}`)

  return (
    <div className="grid gap-5 md:gap-6">
      {esPerfil ? (
        <NotaObligatorios />
      ) : (
        <CabeceraEditar
          usuarioId={usuario.id}
          nombre={usuario.nombre}
          apellido={usuario.apellido}
          fotoUrl={usuario.foto_perfil_url ?? null}
          identidad={identidad}
          esPerfil={false}
        />
      )}
      <ResumenErrores ref={resumenRef} errores={f.resumen} />
      {errorGeneral && <AvisoFormulario tono="error">{errorGeneral}</AvisoFormulario>}
      <form
        noValidate
        aria-label={esPerfil ? 'Mis datos' : `Editar a ${usuario.nombre} ${usuario.apellido}`.trim()}
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
        onKeyDown={alPresionarTecla}
        inert={guardando || undefined}
        className="grid gap-3 md:gap-4"
      >
        <SeccionesFicha>
          <SeccionPersonal valores={f.valores} estado={estado} onCambiar={f.cambiar} onTocar={f.tocar} ocupaciones={ocupaciones} profesiones={profesiones} />
          <SeccionContacto valores={f.valores} estado={estado} onCambiar={f.cambiar} onTocar={f.tocar} />
          <SeccionUbicacion
            valores={f.valores}
            estado={estado}
            onCambiar={f.cambiar}
            onTocar={f.tocar}
            catalogos={catalogos}
            sugerencias={inicial.calle ? [] : sugerenciasDireccion}
          />
        </SeccionesFicha>
        <BarraGuardar cambios={f.cambios.length} errores={f.resumen.length} guardando={guardando} onCancelar={cancelar} onGuardar={() => void guardar()} />
      </form>
      <DialogoDescartar
        abierto={guarda.preguntando}
        cambios={f.cambios.length}
        onSeguir={guarda.seguirEditando}
        onDescartar={guarda.descartar}
      />
    </div>
  )
}
