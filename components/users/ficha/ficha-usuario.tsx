'use client'

/**
 * The ficha /users/[id] on design system v2 (S13 of
 * odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/usuarios/03-ficha-escritorio.html and
 * 04-ficha-celular.html). The server page loads everything as the caller;
 * this component owns the tab (?tab=, written with history.replaceState so a
 * switch never refetches), the Asistencia range (?desde=&hasta=, a server
 * round trip), and the mutations (family relations, invitation, password,
 * role), each gated as before: Editar / Agregar familiar / Quitar relación by
 * puede_editar_usuario, invite by the invitation API, password and role by
 * admin.
 */
import Link from 'next/link'
import { MailPlus, Pencil } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState, type ReactElement } from 'react'

import { fechaInvitacion, InvitarCuentaPanel, useEstadoInvitacion } from '@/components/cuentas/invitar-cuenta-panel'
import { AgregarFamiliarModal } from '@/components/modals/AgregarFamiliarModal'
import { ConfirmationModal } from '@/components/modals/ConfirmationModal'
import { SetPasswordModal } from '@/components/modals/SetPasswordModal'
import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { deleteFamilyRelation } from '@/lib/actions/user.actions'
import type { AsistenciaPersona, GrupoAsistencia } from '@/lib/platform/usuarios/asistencia-persona'
import { cambiarRolUsuarios } from '@/lib/platform/usuarios/cambiar-rol'
import type { VisorUsuarios } from '@/lib/platform/usuarios/contacto'
import type { PersonaFicha, ResumenFicha } from '@/lib/platform/usuarios/ficha-persona'
import type { ServicioPersona } from '@/lib/platform/usuarios/ficha-servicio'
import {
  accionesFicha,
  avisosFicha,
  consultaConRango,
  consultaConTab,
  puedeAdministrarCuenta,
  TABS_FICHA,
  telefonoPorRevisar,
  type TabFicha,
} from '@/lib/platform/usuarios/ficha-vista'
import type { CuentaEstado } from '@/lib/platform/usuarios/lista-vista'

import { CabeceraFicha, EnlaceCorregir } from './cabecera-ficha'
import { PestanaAsistencia } from './pestana-asistencia'
import { PestanaCuenta, PestanaFamilia } from './pestanas-cuenta'
import { PestanaDatos, PestanaGrupos, PestanaServicio } from './pestanas-datos'

export interface FichaUsuarioProps {
  readonly persona: PersonaFicha
  readonly resumen: ResumenFicha
  readonly puedeEditar: boolean
  readonly visor: VisorUsuarios
  readonly tabInicial: TabFicha
  /** The range's attendance; null when the viewer may not see it. */
  readonly asistencia: AsistenciaPersona | null
  /** Grupos de Vida over the whole history; null when the viewer may not see them. */
  readonly grupos: readonly GrupoAsistencia[] | null
  readonly servicios: readonly ServicioPersona[]
  /** The person's auth id, loaded for admin only (undefined otherwise; null = no account). */
  readonly authIdPersona?: string | null
}

export function FichaUsuario(props: FichaUsuarioProps): ReactElement {
  const { persona, resumen, puedeEditar, visor, asistencia, grupos, servicios, authIdPersona } = props
  const router = useRouter()
  const pathname = usePathname()
  const notificar = useNotificaciones()
  const [tab, setTab] = useState<TabFicha>(props.tabInicial)
  const [agregarAbierto, setAgregarAbierto] = useState(false)
  const [relacionAQuitar, setRelacionAQuitar] = useState<string | null>(null)
  const [quitando, setQuitando] = useState(false)
  const [invitarAbierto, setInvitarAbierto] = useState(false)
  const [contrasenaAbierta, setContrasenaAbierta] = useState(false)

  const esAdmin = puedeAdministrarCuenta(visor.roles)
  // The API answers only to people who may invite; without it the state stays unknown.
  const invitacionEstado = useEstadoInvitacion(persona.id, resumen.cuenta !== 'si')
  const estadoInv = invitacionEstado.estado
  const enviada = estadoInv?.invitacion?.estado === 'enviada'
  const cuenta: CuentaEstado | null =
    resumen.cuenta ??
    (estadoInv ? (estadoInv.sinCuenta ? (enviada ? 'invitada' : 'no') : 'si') : authIdPersona === undefined ? null : authIdPersona ? 'si' : 'no')
  const tieneGrupo = grupos ? grupos.some((g) => g.actual) : resumen.cuenta !== null ? resumen.grupoActual !== null : null
  const acciones = accionesFicha(visor, { ...persona, esDeMiGrupo: resumen.esDeMiGrupo }, puedeEditar)
  const avisos = avisosFicha({ telefono: persona.telefono, cuenta, tieneGrupo })
  const porRevisar = telefonoPorRevisar(persona.telefono)

  const invitar = estadoInv?.sinCuenta ? (
    <BotonSistema type="button" variante="primario" tamaño="sm" icono={MailPlus} onClick={() => setInvitarAbierto(true)}>
      {enviada ? 'Reenviar invitación' : 'Invitar a la plataforma'}
    </BotonSistema>
  ) : null
  const textoInvitacion =
    cuenta === 'si' ? 'Aceptada' : estadoInv?.invitacion && enviada ? `Enviada el ${fechaInvitacion(estadoInv.invitacion.enviadaEl)}` : cuenta === 'no' ? 'Sin enviar' : null

  const cuentas = useMemo<Partial<Record<TabFicha, number>>>(
    () => ({ familia: persona.relaciones.length, ...(grupos ? { grupos: grupos.length } : {}), servicio: servicios.length }),
    [persona.relaciones.length, grupos, servicios.length],
  )

  const cambiarTab = (valor: string) => {
    const siguiente = valor as TabFicha
    setTab(siguiente)
    window.history.replaceState(window.history.state, '', `${pathname}${consultaConTab(window.location.search, siguiente)}`)
  }

  const quitarRelacion = async () => {
    if (!relacionAQuitar) return
    setQuitando(true)
    try {
      const res = await deleteFamilyRelation(relacionAQuitar, persona.id)
      if (res.success) {
        notificar.success('La relación familiar fue eliminada correctamente.')
        router.refresh()
      } else {
        notificar.error(res.error || 'No se pudo eliminar la relación.')
      }
    } catch (e) {
      notificar.error(e instanceof Error ? e.message : 'No se pudo eliminar la relación.')
    } finally {
      setQuitando(false)
      setRelacionAQuitar(null)
    }
  }

  const guardarRol = async (rol: string) => {
    try {
      await cambiarRolUsuarios([persona.id], rol)
    } catch (e) {
      notificar.error(e instanceof Error ? e.message : 'No se pudo cambiar el rol.')
      return
    }
    notificar.success('Rol actualizado.')
    router.refresh()
  }

  const nombre = `${persona.nombre} ${persona.apellido}`.trim()
  return (
    <PaginaSistema
      breadcrumbs={<MigasFicha nombre={nombre} />}
      acciones={
        puedeEditar ? (
          <BotonSistema asChild variante="primario" tamaño="sm" icono={Pencil}>
            <Link href={`/users/${persona.id}/edit`}>Editar</Link>
          </BotonSistema>
        ) : null
      }
      className="pb-28 md:pb-0"
    >
      <CabeceraFicha
        persona={persona}
        resumen={resumen}
        cuenta={cuenta}
        acciones={acciones}
        avisos={avisos}
        accionAviso={{ telefono: puedeEditar ? <EnlaceCorregir personaId={persona.id} /> : null, cuenta: invitar }}
      />
      <TabsSistema value={tab} onValueChange={cambiarTab}>
        <TabsList aria-label="Secciones de la ficha" className="flex max-w-full justify-start overflow-x-auto [scrollbar-width:none] md:inline-flex">
          {TABS_FICHA.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="shrink-0 gap-1.5 whitespace-nowrap px-3.5">
              {t.etiqueta}
              {cuentas[t.id] !== undefined && <span className="font-mono text-xs tabular-nums opacity-80">{cuentas[t.id]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="datos">
          <PestanaDatos persona={persona} resumen={resumen} puedeEditar={puedeEditar} telefonoPorRevisar={porRevisar} />
        </TabsContent>
        <TabsContent value="familia">
          <PestanaFamilia persona={persona} puedeEditar={puedeEditar} onAgregar={() => setAgregarAbierto(true)} onQuitar={setRelacionAQuitar} />
        </TabsContent>
        <TabsContent value="grupos">
          <PestanaGrupos grupos={grupos} />
        </TabsContent>
        <TabsContent value="asistencia">
          <PestanaAsistencia
            nombre={persona.nombre}
            asistencia={asistencia}
            onCambiarRango={(desde, hasta) => router.push(`${pathname}${consultaConRango(consultaConTab(window.location.search, 'asistencia'), desde, hasta)}`)}
          />
        </TabsContent>
        <TabsContent value="servicio">
          <PestanaServicio servicios={servicios} />
        </TabsContent>
        <TabsContent value="cuenta">
          <PestanaCuenta
            persona={persona}
            cuenta={cuenta}
            invitacion={textoInvitacion}
            accionInvitar={invitar}
            esAdmin={esAdmin}
            authIdPersona={authIdPersona}
            onAsignarContrasena={() => setContrasenaAbierta(true)}
            onGuardarRol={guardarRol}
          />
        </TabsContent>
      </TabsSistema>

      {puedeEditar && (
        <AgregarFamiliarModal isOpen={agregarAbierto} onClose={() => setAgregarAbierto(false)} usuarioActualId={persona.id} onRelacionCreada={() => router.refresh()} />
      )}
      <ConfirmationModal
        isOpen={relacionAQuitar !== null}
        onClose={() => setRelacionAQuitar(null)}
        onConfirm={quitarRelacion}
        title="Confirmar Eliminación"
        message="¿Estás seguro de que deseas eliminar esta relación familiar? Esta acción no se puede deshacer."
        isLoading={quitando}
      />
      {estadoInv?.sinCuenta && (
        <InvitarCuentaPanel
          personaId={persona.id}
          nombre={persona.nombre}
          abierto={invitarAbierto}
          onAbiertoChange={setInvitarAbierto}
          onInvitada={() => {
            invitacionEstado.recargar()
            router.refresh()
          }}
        />
      )}
      {esAdmin && authIdPersona && contrasenaAbierta && (
        <SetPasswordModal isOpen={contrasenaAbierta} onClose={() => setContrasenaAbierta(false)} userId={authIdPersona} />
      )}
    </PaginaSistema>
  )
}

/** "Usuarios / Ana Pérez" in the desktop header. */
function MigasFicha({ nombre }: { readonly nombre: string }): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 items-center gap-0.5 text-sm">
        <li>
          <Link href="/users" className="focus-ring rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11">
            Usuarios
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-0.5">
          <span aria-hidden="true" className="px-0.5 text-muted-foreground/60">/</span>
          <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">{nombre}</span>
        </li>
      </ol>
    </nav>
  )
}
