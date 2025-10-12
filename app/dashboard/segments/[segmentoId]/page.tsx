import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TituloSistema, TextoSistema, TarjetaSistema } from "@/components/ui/sistema-diseno"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { UserAvatar } from "@/components/ui/UserAvatar"

interface Props {
	params: { segmentoId: string }
}

export default async function SegmentoDetallePage({ params }: Props) {
	const { segmentoId } = params;
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

	// Cargar preview de directores (sin límite) y agrupar cónyuges
	let directoresPreview: Array<{ id: string; usuario_id: string; nombre: string; apellido: string; email?: string | null; foto?: string | null }> = []
	let directoresAgrupados: Array<{ usuarios: Array<{ usuario_id: string; nombre: string; apellido: string; email?: string | null; foto?: string | null }> }> = []
	{
		const { data: dataJoin, error: errorJoin } = await supabase
			.from('segmento_lideres')
			.select('id, usuario_id, usuario:usuario_id (nombre, apellido, email, foto_perfil_url)')
			.eq('segmento_id', segmentoId)
			.eq('tipo_lider', 'director_etapa')
			// sin límite

		if (errorJoin) {
			console.warn('[SEGMENTO_DETALLE] errorJoin directores', errorJoin.message)
		}

		let registros = dataJoin || []
		if (registros.length === 0) {
			// Fallback tolerante a RLS: obtener ids y luego usuarios
			const { data: filasBase, error: baseErr } = await supabase
				.from('segmento_lideres')
				.select('id, usuario_id')
				.eq('segmento_id', segmentoId)
				.eq('tipo_lider', 'director_etapa')
				// sin límite
			if (baseErr) console.warn('[SEGMENTO_DETALLE] baseErr directores', baseErr.message)
			if (filasBase && filasBase.length > 0) {
				const usuarioIds = [...new Set(filasBase.map(f => f.usuario_id))]
				let usuariosMap = new Map<string, { nombre: string; apellido: string; email?: string | null; foto_perfil_url?: string | null }>()
				if (usuarioIds.length > 0) {
					const { data: usuariosData, error: usuariosErr } = await supabase
						.from('usuarios')
						.select('id, nombre, apellido, email, foto_perfil_url')
						.in('id', usuarioIds)
						// sin límite (in restringe por ids)
					if (usuariosErr) console.warn('[SEGMENTO_DETALLE] usuariosErr directores', usuariosErr.message)
					for (const u of usuariosData || []) {
						usuariosMap.set(u.id, { nombre: u.nombre || '', apellido: u.apellido || '', email: u.email || null, foto_perfil_url: (u as any).foto_perfil_url || null })
					}
				}
				registros = filasBase.map(f => ({
					id: f.id,
					usuario_id: f.usuario_id,
					usuario: usuariosMap.get(f.usuario_id) || { nombre: '', apellido: '', email: null, foto_perfil_url: null }
				})) as any
			}
		}

	directoresPreview = (registros as any[]).map(d => ({
		id: d.id,
		usuario_id: d.usuario_id,
		nombre: d.usuario?.nombre || '',
		apellido: d.usuario?.apellido || '',
		email: d.usuario?.email || null,
		foto: d.usuario?.foto_perfil_url || null,
	}))

	// Agrupar cónyuges entre los directores
	const idsDirectores = [...new Set(directoresPreview.map(d => d.usuario_id))]
	let parejas = new Map<string, string>()
	if (idsDirectores.length > 0) {
		try {
			const idsCSV = idsDirectores.map(id => `"${id}"`).join(',')
			const { data: conyRows, error: conyErr } = await supabase
				.from('relaciones_usuarios')
				.select('usuario1_id, usuario2_id')
				.eq('tipo_relacion', 'conyuge')
				.or(`usuario1_id.in.(${idsCSV}),usuario2_id.in.(${idsCSV})`)
				.limit(10000)
			if (conyErr) {
				console.warn('[SEGMENTO_DETALLE] conyErr', conyErr.message)
			}
			for (const r of conyRows || []) {
				const a = r.usuario1_id as string
				const b = r.usuario2_id as string
				if (idsDirectores.includes(a) && idsDirectores.includes(b)) {
					parejas.set(a, b)
					parejas.set(b, a)
				}
			}
		} catch (e) {
			console.warn('[SEGMENTO_DETALLE] excepción consultando cónyuges', (e as any)?.message)
		}
	}

	const dirById = new Map<string, { usuario_id: string; nombre: string; apellido: string; email?: string | null; foto?: string | null }>()
	for (const d of directoresPreview) dirById.set(d.usuario_id, d)
	const visitados = new Set<string>()
	for (const id of idsDirectores) {
		if (visitados.has(id)) continue
		const parejaId = parejas.get(id)
		if (parejaId && !visitados.has(parejaId)) {
			const a = dirById.get(id)!
			const b = dirById.get(parejaId)!
			directoresAgrupados.push({ usuarios: [a, b] })
			visitados.add(id); visitados.add(parejaId)
		} else {
			const a = dirById.get(id)!
			directoresAgrupados.push({ usuarios: [a] })
			visitados.add(id)
		}
	}
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
					<TarjetaSistema className="p-5 flex flex-col justify-between md:col-span-3">
						<div>
							<TituloSistema nivel={4} className="mb-1">Gestión de Directores</TituloSistema>
							<TextoSistema variante="sutil" className="text-sm">
								Asigna directores a grupos y ciudades dentro de este segmento.
							</TextoSistema>

							{/* Preview de directores (agrupados por cónyuges) */}
							<div className="mt-4">
								<TextoSistema className="mb-2 text-gray-700 font-semibold">Directores en este segmento</TextoSistema>
								{directoresAgrupados.length === 0 ? (
									<TextoSistema variante="sutil" className="text-sm">Aún no hay directores asignados.</TextoSistema>
								) : (
									<div className="space-y-3">
										{directoresAgrupados.map((grupo, idx) => (
											<div key={idx} className="bg-white/50 border border-gray-200 rounded-xl p-4">
												<div className="space-y-2">
													{grupo.usuarios.map((u) => (
														<div key={u.usuario_id} className="flex items-center gap-3">
															<UserAvatar photoUrl={u.foto || undefined} nombre={u.nombre} apellido={u.apellido} size="sm" />
															<div className="min-w-0">
																<Link href={`/dashboard/users/${u.usuario_id}`} className="font-medium text-gray-800 hover:text-orange-600 transition-colors block truncate">
																	{`${u.nombre} ${u.apellido}`.trim() || u.email || 'Usuario'}
																</Link>
																{u.email && (
																	<p className="text-xs text-gray-500 truncate">{u.email}</p>
																)}
															</div>
														</div>
													))}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
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
