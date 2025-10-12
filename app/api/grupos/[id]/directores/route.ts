import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

// GET: directores de etapa asignados a un grupo (lista simple para confirmaciones UI)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
	try {
		const awaited = 'then' in ctx.params ? await ctx.params : ctx.params
		const { id: grupoId } = awaited
		if (!grupoId) return NextResponse.json({ error: 'grupoId requerido' }, { status: 400 })
		const supabase = await createSupabaseServerClient()
		const userWithRoles = await getUserWithRoles(supabase)
		if (!userWithRoles) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

		const { data: rels, error: relErr } = await supabase
			.from('director_etapa_grupos')
			.select('director_etapa_id')
			.eq('grupo_id', grupoId)
			.limit(50)
		if (relErr) return NextResponse.json({ error: relErr.message }, { status: 400 })
		const directorIds = [...new Set((rels||[]).map(r => r.director_etapa_id))]
		if (directorIds.length === 0) return NextResponse.json({ directores: [], total: 0 })

		const { data: dirs, error: dirsErr } = await supabase
			.from('segmento_lideres')
			.select('id, usuario_id, usuario:usuario_id (nombre, apellido, email)')
			.in('id', directorIds)
			.eq('tipo_lider', 'director_etapa')
			.limit(50)
		if (dirsErr) return NextResponse.json({ error: dirsErr.message }, { status: 400 })

		const directores = (dirs||[]).map((d: any) => {
			const nombreComp = `${d.usuario?.nombre || ''} ${d.usuario?.apellido || ''}`.trim()
			return {
				id: d.id,
				usuario_id: d.usuario_id,
				nombre: (nombreComp || d.usuario?.email || '(Sin nombre)').replace(/0+$/,'').trim()
			}
		})

		return NextResponse.json({ directores, total: directores.length })
	} catch (e: any) {
		console.error('[grupos/:id/directores GET] Exception', e)
		return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
	}
}
