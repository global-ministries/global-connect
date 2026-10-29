'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { CuentaEstado, OrdenUsuarios } from '@/lib/platform/usuarios/lista-vista'

interface Usuario {
  id: string
  nombre: string
  apellido: string
  email: string | null
  telefono: string | null
  cedula: string | null
  fecha_registro: string
  rol_nombre_interno: string
  rol_nombre_visible: string
  puede_ver: boolean
  foto_perfil_url: string | null
  /** si | invitada | no (listar_usuarios_con_permisos_v2). */
  cuenta: CuentaEstado
  grupo_id: string | null
  grupo_nombre: string | null
  campus_nombre: string | null
  /** A current member of an active group the viewer leads. */
  es_de_mi_grupo: boolean
}

interface EstadisticasUsuarios {
  total_usuarios: number
  con_email: number
  con_telefono: number
  registrados_hoy: number
  nuevos_7d: number
  sin_grupo: number
  sin_cuenta: number
  sin_telefono: number
  invitadas: number
}

interface FiltrosUsuarios {
  busqueda: string
  roles: string[]
  con_email: boolean | null
  con_telefono: boolean | null
  en_grupo: boolean | null
  con_cuenta?: boolean | null
  /** Registered in the last N days. */
  nuevos_dias?: number | null
  orden?: OrdenUsuarios
  limite?: number
}

interface UseUsuariosConPermisosOptions {
  campusId?: string | null
}

interface UseUsuariosConPermisosReturn {
  usuarios: Usuario[]
  estadisticas: EstadisticasUsuarios | null
  cargando: boolean
  cargandoEstadisticas: boolean
  error: string | null
  filtros: FiltrosUsuarios
  paginaActual: number
  totalPaginas: number
  totalUsuarios: number
  hayMasPaginas: boolean
  actualizarFiltros: (nuevosFiltros: Partial<FiltrosUsuarios>) => void
  cambiarPagina: (pagina: number) => void
  recargarDatos: () => void
  limpiarFiltros: () => void
}

const CACHE_ESTADISTICAS_MS = 5 * 60 * 1000 // 5 minutos

const FILTROS_POR_DEFECTO: FiltrosUsuarios = {
  busqueda: '',
  roles: [],
  con_email: null,
  con_telefono: null,
  en_grupo: null,
  con_cuenta: null,
  nuevos_dias: null,
  orden: 'nombre',
  limite: 20,
}

// Cache para estadísticas por clave de filtros
const cacheEstadisticas: Record<string, { datos: EstadisticasUsuarios; timestamp: number }> = {}

export function useUsuariosConPermisos(options: UseUsuariosConPermisosOptions = {}): UseUsuariosConPermisosReturn {
  const { campusId } = options
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [estadisticas, setEstadisticas] = useState<EstadisticasUsuarios | null>(null)
  const [cargando, setCargando] = useState(false)
  const [cargandoEstadisticas, setCargandoEstadisticas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalUsuarios, setTotalUsuarios] = useState(0)
  const [filtros, setFiltros] = useState<FiltrosUsuarios>(FILTROS_POR_DEFECTO)

  const { toast } = useToast()
  const { authUserId } = useCurrentUser()
  const supabase = createClient()

  // The search text is confirmed by the page (Enter / "Buscar"), so it applies immediately.
  const busqueda = filtros.busqueda

  // Optional filters are sent only when set, so the database defaults apply.
  const filtrosRpc = useMemo(() => ({
    p_busqueda: busqueda,
    ...(filtros.roles.length > 0 ? { p_roles_filtro: filtros.roles } : {}),
    ...(filtros.con_email !== null ? { p_con_email: filtros.con_email } : {}),
    ...(filtros.con_telefono !== null ? { p_con_telefono: filtros.con_telefono } : {}),
    ...(filtros.en_grupo !== null ? { p_en_grupo: filtros.en_grupo } : {}),
    ...(filtros.con_cuenta != null ? { p_con_cuenta: filtros.con_cuenta } : {}),
    ...(filtros.nuevos_dias != null ? { p_nuevos_dias: filtros.nuevos_dias } : {}),
    ...(campusId ? { p_campus_id: campusId } : {}),
  }), [busqueda, filtros.roles, filtros.con_email, filtros.con_telefono, filtros.en_grupo, filtros.con_cuenta, filtros.nuevos_dias, campusId])

  // Cargar usuarios con permisos (listar_usuarios_con_permisos_v2)
  const cargarUsuarios = useCallback(async () => {
    setCargando(true)
    setError(null)

    try {
      if (!authUserId) {
        throw new Error('Usuario no autenticado')
      }

      const limite = filtros.limite || 20
      const { data, error: errorRPC } = await supabase.rpc('listar_usuarios_con_permisos_v2', {
        p_auth_id: authUserId,
        ...filtrosRpc,
        p_orden: filtros.orden ?? 'nombre',
        p_limite: limite,
        p_offset: (paginaActual - 1) * limite,
      })

      if (errorRPC) {
        throw errorRPC
      }

      const lista = (data ?? []) as unknown as Usuario[]
      setUsuarios(lista)
      setTotalUsuarios(lista.length > 0 ? Number((data as Array<{ total_count: number }>)[0].total_count) || 0 : 0)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar usuarios'
      setError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setCargando(false)
    }
  }, [supabase, authUserId, paginaActual, filtrosRpc, filtros.orden, filtros.limite, toast])

  // Cargar estadísticas con caché (obtener_estadisticas_usuarios_con_permisos_v2)
  const cargarEstadisticas = useCallback(async () => {
    const ahora = Date.now()
    // Cache key: the filter combination
    const filtrosKey = JSON.stringify({ ...filtrosRpc, p_roles_filtro: [...filtros.roles].sort() })

    const entry = cacheEstadisticas[filtrosKey]
    if (entry && (ahora - entry.timestamp) < CACHE_ESTADISTICAS_MS) {
      setEstadisticas(entry.datos)
      return
    }

    setCargandoEstadisticas(true)

    try {
      if (!authUserId) {
        throw new Error('Usuario no autenticado')
      }

      const { data, error: errorRPC } = await supabase.rpc('obtener_estadisticas_usuarios_con_permisos_v2', {
        p_auth_id: authUserId,
        ...filtrosRpc,
      })

      if (errorRPC) {
        throw errorRPC
      }

      const stats: EstadisticasUsuarios = data?.[0] ?? {
        total_usuarios: 0,
        con_email: 0,
        con_telefono: 0,
        registrados_hoy: 0,
        nuevos_7d: 0,
        sin_grupo: 0,
        sin_cuenta: 0,
        sin_telefono: 0,
        invitadas: 0,
      }

      cacheEstadisticas[filtrosKey] = {
        datos: stats,
        timestamp: ahora,
      }

      setEstadisticas(stats)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar estadísticas'
      console.error('Error cargando estadísticas:', errorMessage)
      // No mostrar toast para estadísticas, solo log
    } finally {
      setCargandoEstadisticas(false)
    }
  }, [supabase, authUserId, filtrosRpc, filtros.roles])

  // Efectos para cargar datos
  useEffect(() => {
    cargarUsuarios()
  }, [cargarUsuarios])

  useEffect(() => {
    cargarEstadisticas()
  }, [cargarEstadisticas])

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setPaginaActual(1)
  }, [filtrosRpc, filtros.orden])

  // Funciones de control
  const actualizarFiltros = useCallback((nuevosFiltros: Partial<FiltrosUsuarios>) => {
    setFiltros(prev => ({ ...prev, ...nuevosFiltros }))
  }, [])

  const cambiarPagina = useCallback((pagina: number) => {
    setPaginaActual(pagina)
  }, [])

  const recargarDatos = useCallback(() => {
  // Limpiar caché de estadísticas (todas las claves)
  for (const k of Object.keys(cacheEstadisticas)) delete cacheEstadisticas[k]
    cargarUsuarios()
    cargarEstadisticas()
  }, [cargarUsuarios, cargarEstadisticas])

  const limpiarFiltros = useCallback(() => {
    setPaginaActual(1)
    setFiltros(FILTROS_POR_DEFECTO)
  }, [])

  // Valores calculados
  const totalPaginas = useMemo(() => {
    const limite = filtros.limite || 20
    return Math.ceil(totalUsuarios / limite)
  }, [totalUsuarios, filtros.limite])

  const hayMasPaginas = useMemo(() => {
    return paginaActual < totalPaginas
  }, [paginaActual, totalPaginas])

  return {
    usuarios,
    estadisticas,
    cargando,
    cargandoEstadisticas,
    error,
    filtros,
    paginaActual,
    totalPaginas,
    totalUsuarios,
    hayMasPaginas,
    actualizarFiltros,
    cambiarPagina,
    recargarDatos,
    limpiarFiltros
  }
}
