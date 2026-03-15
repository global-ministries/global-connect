import GrupoDetailServer from "./GrupoDetailServer";

/** Props tipados para la ruta dinámica [id] de Grupos de Vida */
interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Página de detalle de un grupo de vida.
 * Delega la lógica server-side a GrupoDetailServer.
 */
export default function Page({ params }: PageProps) {
  return <GrupoDetailServer params={params} />;
}
