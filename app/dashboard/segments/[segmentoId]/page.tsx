import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TituloSistema, TextoSistema, TarjetaSistema, BotonSistema } from "@/components/ui/sistema-diseno"
import { Layers, Users, ArrowLeft, ArrowRight } from "lucide-react"

interface Props {
	params: Promise<{ segmentoId: string }>
}

export default async function SegmentoDetallePage({ params }: Props) {
	const { segmentoId } = await params;
	console.log('[SEGMENTO_DETALLE] segmentoId param:', segmentoId)
	const supabase = await createSupabaseServerClient()
	const userData = await getUserWithRoles(supabase)
	if (!userData) redirect("/login")
	const rolesPermitidos = ["admin", "pastor", "director-general", "director-etapa", "lider"]
	const autorizado = userData.roles.some(r => rolesPermitidos.includes(r))
	if (!autorizado) redirect("/dashboard")

	// Usar limit(1) para detectar si RLS está bloqueando (data vacío sin error) vs inexistencia real
		const { data: segRows, error } = await supabase
			.from('segmentos')
			.select('id, nombre')
		.eq('id', segmentoId)
		.limit(1)

	if (error) {
		console.error('[SEGMENTO_DETALLE] error cargando segmento', error)
	}
	const segmento = segRows && segRows.length > 0 ? segRows[0] : null
	console.log('[SEGMENTO_DETALLE] fetched rows length:', segRows?.length ?? 0)
		if (!segmento) {
			console.warn('[SEGMENTO_DETALLE] segmento no visible. Posible RLS o id inexistente.')
			notFound()
		}

	return (
		<DashboardLayout>
					<ContenedorDashboard
						titulo={`Segmento: ${segmento.nombre}`}
						subtitulo="Información general y accesos rápidos"
					>
						<div className="mb-4">
							<Link href="/dashboard/segments" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
								<ArrowLeft className="w-4 h-4 mr-1" /> Volver a la lista
							</Link>
						</div>
				<div className="grid gap-6 md:grid-cols-3">
					<TarjetaSistema className="p-5 md:col-span-2">
						<div className="flex items-start gap-4">
							<div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
								<Layers className="w-6 h-6" />
							</div>
							<div className="flex-1">
								<TituloSistema nivel={3}>{segmento.nombre}</TituloSistema>
												<TextoSistema variante="sutil" className="mt-1">
													Segmento sin descripción (columna no definida en schema actual).
												</TextoSistema>
							</div>
						</div>
					</TarjetaSistema>

					<TarjetaSistema className="p-5 flex flex-col justify-between">
						<div>
							  <TituloSistema nivel={4} className="mb-1">Gestión de Directores</TituloSistema>
							<TextoSistema variante="sutil" className="text-sm">
								Asigna directores a grupos y ciudades dentro de este segmento.
							</TextoSistema>
						</div>
						<Link href={`/dashboard/segments/${segmento.id}/directores`} className="mt-4 inline-flex items-center text-sm text-purple-600 hover:text-purple-800 font-medium">
							Abrir gestión <ArrowRight className="w-4 h-4 ml-1" />
						</Link>
					</TarjetaSistema>
				</div>
			</ContenedorDashboard>
		</DashboardLayout>
	)
}

