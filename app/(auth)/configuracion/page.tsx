import { redirect } from 'next/navigation'

/**
 * /configuracion ya no es ruta principal.
 * Redirige a la configuración de Grupos de Vida.
 */
export default function PageConfiguracion() {
  redirect('/grupos-vida/configuracion')
}
