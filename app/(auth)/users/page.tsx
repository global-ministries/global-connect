/**
 * /users — Usuarios on design system v2 (S13 of odd/tasks/sistema-diseno-v2.md;
 * prototype docs/design-system/prototipos/usuarios/). The server only parses
 * the URL (search, filters, sort, page, open person) so a shared link opens
 * the same view; the client island loads the people the caller may see
 * (listar_usuarios_con_permisos_v2 decides the scope).
 */
import { UsuariosClient } from '@/components/users/lista/usuarios-client'
import { leerFiltrosDeUrl, type ParametrosDeUrl } from '@/lib/platform/usuarios/lista-vista'

interface PaginaUsuariosProps {
  readonly searchParams?: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}

export default async function PaginaUsuarios({ searchParams }: PaginaUsuariosProps = {}) {
  const parametros: ParametrosDeUrl = (await searchParams) ?? {}
  return <UsuariosClient filtrosIniciales={leerFiltrosDeUrl(parametros)} />
}
