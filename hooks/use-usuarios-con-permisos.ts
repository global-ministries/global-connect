'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

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
}

interface EstadisticasUsuarios {
  total_usuarios: number
  con_email: number
  con_telefono: number
  registrados_hoy: number
}

interface FiltrosUsuarios {
  busqueda: string
  roles: string[]
  con_email: boolean | null
  con_telefono: boolean | null
  limite?: number
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

const USUARIOS_POR_PAGINA = 20
const CACHE_ESTADISTICAS_MS = 5 * 60 * 1000 // 5 minutos

// Cache para estadísticas
let cacheEstadisticas: {
  datos: EstadisticasUsuarios | null
  timestamp: number
} = {
  datos: null,
  timestamp: 0
}

export function useUsuariosConPermisos(): UseUsuariosConPermisosReturn {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [estadisticas, setEstadisticas] = useState<EstadisticasUsuarios | null>(null)
  const [cargando, setCargando] = useState(false)
  const [cargandoEstadisticas, setCargandoEstadisticas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalUsuarios, setTotalUsuarios] = useState(0)
  const [filtros, setFiltros] = useState<FiltrosUsuarios>({
    busqueda: '',
    roles: [],
    con_email: null,
    con_telefono: null,
    limite: 20
  })

  const { toast } = useToast()
  const supabase = createClient()

  // Debounce para búsqueda
  const [busquedaDebounced, setBusquedaDebounced] = useState(filtros.busqueda)

  useEffect(() => {
    const timer = setTimeout(() => {
      setBusquedaDebounced(filtros.busqueda)
    }, 400)

    return () => clearTimeout(timer)
  }, [filtros.busqueda])

  // Cargar usuarios con permisos
  const cargarUsuarios = useCallback(async () => {
    setCargando(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('Usuario no autenticado')
      }

      const limite = filtros.limite || 20
      const offset = (paginaActual - 1) * limite

      const { data, error: errorRPC } = await supabase.rpc('listar_usuarios_con_permisos', {
        p_auth_id: user.id,
        p_busqueda: busquedaDebounced,
        p_roles_filtro: filtros.roles.length > 0 ? filtros.roles : null,
        p_con_email: filtros.con_email,
        p_con_telefono: filtros.con_telefono,
        p_limite: limite,
        p_offset: offset
      })

      if (errorRPC) {
        throw errorRPC
      }

      if (data && data.length > 0) {
        setUsuarios(data)
        setTotalUsuarios(Number(data[0].total_count) || 0)
      } else {
        setUsuarios([])
        setTotalUsuarios(0)
      }

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
  }, [supabase, paginaActual, busquedaDebounced, filtros.roles, filtros.con_email, filtros.con_telefono, toast])

  // Cargar estadísticas con caché
  const cargarEstadisticas = useCallback(async () => {
    // Verificar caché
    const ahora = Date.now()
    if (cacheEstadisticas.datos && (ahora - cacheEstadisticas.timestamp) < CACHE_ESTADISTICAS_MS) {
      setEstadisticas(cacheEstadisticas.datos)
      return
    }

    setCargandoEstadisticas(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('Usuario no autenticado')
      }

      const { data, error: errorRPC } = await supabase.rpc('obtener_estadisticas_usuarios_con_permisos', {
        p_auth_id: user.id
      })

      if (errorRPC) {
        throw errorRPC
      }

      const stats = data?.[0] || {
        total_usuarios: 0,
        con_email: 0,
        con_telefono: 0,
        registrados_hoy: 0
      }

      // Actualizar caché
      cacheEstadisticas = {
        datos: stats,
        timestamp: ahora
      }

      setEstadisticas(stats)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar estadísticas'
      console.error('Error cargando estadísticas:', errorMessage)
      // No mostrar toast para estadísticas, solo log
    } finally {
      setCargandoEstadisticas(false)
    }
  }, [supabase])

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
  }, [busquedaDebounced, filtros.roles, filtros.con_email, filtros.con_telefono])

  // Funciones de control
  const actualizarFiltros = useCallback((nuevosFiltros: Partial<FiltrosUsuarios>) => {
    setFiltros(prev => ({ ...prev, ...nuevosFiltros }))
  }, [])

  const cambiarPagina = useCallback((pagina: number) => {
    setPaginaActual(pagina)
  }, [])

  const recargarDatos = useCallback(() => {
    // Limpiar caché de estadísticas
    cacheEstadisticas = { datos: null, timestamp: 0 }
    cargarUsuarios()
    cargarEstadisticas()
  }, [cargarUsuarios, cargarEstadisticas])

  const limpiarFiltros = useCallback(() => {
    setPaginaActual(1)
    setFiltros({
      busqueda: '',
      roles: [],
      con_email: null,
      con_telefono: null,
      limite: 20
    })
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
