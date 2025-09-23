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
  foto_perfil_url: string | null
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
  en_grupo: boolean | null
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

// Cache para estadísticas por clave de filtros
const cacheEstadisticas: Record<string, { datos: EstadisticasUsuarios; timestamp: number }> = {}

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
  en_grupo: null,
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

      const rpcParams: any = {
        p_auth_id: user.id,
        p_busqueda: busquedaDebounced,
        p_roles_filtro: filtros.roles.length > 0 ? filtros.roles : null,
        p_con_email: filtros.con_email,
        p_con_telefono: filtros.con_telefono,
        p_limite: limite,
        p_offset: offset,
      }
      if (filtros.en_grupo !== null) {
        rpcParams.p_en_grupo = filtros.en_grupo
      }

      let { data, error: errorRPC } = await supabase.rpc('listar_usuarios_con_permisos', rpcParams)
      // Flag para saber si el filtro en_grupo se aplicó en el servidor
      let filtroGrupoAplicadoEnServidor = true

      // Fallback de compatibilidad si el RPC no acepta p_en_grupo (instancias viejas)
      if (errorRPC && filtros.en_grupo !== null) {
        const { data: data2, error: error2 } = await supabase.rpc('listar_usuarios_con_permisos', {
          p_auth_id: user.id,
          p_busqueda: busquedaDebounced,
          p_roles_filtro: filtros.roles.length > 0 ? filtros.roles : null,
          p_con_email: filtros.con_email,
          p_con_telefono: filtros.con_telefono,
          p_limite: limite,
          p_offset: offset,
        })
        data = data2 as any
        errorRPC = error2 as any
        filtroGrupoAplicadoEnServidor = false
      }

      if (errorRPC) {
        throw errorRPC
      }

      if (data && data.length > 0) {
        let lista = data as any[]

        // Si el servidor no aplicó el filtro por grupo pero el usuario lo pidió, filtramos en cliente
        if (filtros.en_grupo !== null && !filtroGrupoAplicadoEnServidor) {
          try {
            const ids = lista.map((u) => u.id).filter(Boolean)
            if (ids.length > 0) {
              const { data: miembros, error: errMiembros } = await supabase
                .from('grupo_miembros')
                .select('usuario_id')
                .in('usuario_id', ids)
                .is('fecha_salida', null)

              if (!errMiembros) {
                const setMiembros = new Set((miembros || []).map((m: any) => m.usuario_id))
                if (filtros.en_grupo === true) {
                  lista = lista.filter((u) => setMiembros.has(u.id))
                } else {
                  lista = lista.filter((u) => !setMiembros.has(u.id))
                }
              }
            }
          } catch (e) {
            // Silenciar errores de fallback local; no interrumpir la carga principal
          }
        }

        setUsuarios(lista as any)
        // Si filtramos en cliente, el total del servidor ya no es confiable; usar el tamaño filtrado
        const total = (filtros.en_grupo !== null && !filtroGrupoAplicadoEnServidor)
          ? Number(lista.length)
          : Number((data as any)[0].total_count) || 0
        setTotalUsuarios(total)
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
  }, [supabase, paginaActual, busquedaDebounced, filtros.roles, filtros.con_email, filtros.con_telefono, filtros.en_grupo, toast])

  // Cargar estadísticas con caché
  const cargarEstadisticas = useCallback(async () => {
    const ahora = Date.now()
    // Construir clave de filtros para cachear por combinación
    const filtrosKey = JSON.stringify({
      busqueda: busquedaDebounced || '',
      roles: [...filtros.roles].sort(),
      con_email: filtros.con_email,
      con_telefono: filtros.con_telefono,
      en_grupo: filtros.en_grupo,
    })

    // Verificar caché por clave
    const entry = cacheEstadisticas[filtrosKey]
    if (entry && (ahora - entry.timestamp) < CACHE_ESTADISTICAS_MS) {
      setEstadisticas(entry.datos)
      return
    }

    setCargandoEstadisticas(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('Usuario no autenticado')
      }

      // Intentar nueva firma con filtros
      let { data, error: errorRPC } = await supabase.rpc('obtener_estadisticas_usuarios_con_permisos', {
        p_auth_id: user.id,
        p_busqueda: busquedaDebounced || '',
        p_roles_filtro: filtros.roles.length > 0 ? filtros.roles : null,
        p_con_email: filtros.con_email,
        p_con_telefono: filtros.con_telefono,
        ...(filtros.en_grupo !== null ? { p_en_grupo: filtros.en_grupo } : {}),
      })

      // Fallback: si el RPC no acepta parámetros extra, usar la firma antigua (solo p_auth_id)
      if (errorRPC) {
        const { data: data2, error: error2 } = await supabase.rpc('obtener_estadisticas_usuarios_con_permisos', {
          p_auth_id: user.id
        })
        data = data2
        errorRPC = error2 as any
      }

      if (errorRPC) {
        throw errorRPC
      }

      const stats = data?.[0] || {
        total_usuarios: 0,
        con_email: 0,
        con_telefono: 0,
        registrados_hoy: 0
      }

      // Actualizar caché por clave
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
  }, [supabase, busquedaDebounced, filtros.roles, filtros.con_email, filtros.con_telefono, filtros.en_grupo])

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
  }, [busquedaDebounced, filtros.roles, filtros.con_email, filtros.con_telefono, filtros.en_grupo])

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
    setFiltros({
      busqueda: '',
      roles: [],
      con_email: null,
      con_telefono: null,
  en_grupo: null,
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
