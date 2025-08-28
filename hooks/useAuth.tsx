"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
// import { getCurrentUserWithRoles } from "@/lib/actions/user.actions"
// TODO: Implement or import the correct function to get the current user with roles
const getCurrentUserWithRoles = async () => {
  // Replace this mock with the real implementation
  return null
}

type AuthContextType = {
  user: any | null
  roles: any[]
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  roles: [],
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getCurrentUserWithRoles()
      .then((data: { perfil: any; roles?: any[] } | null) => {
        if (mounted) {
          if (data) {
            setUser(data.perfil)
            setRoles(data.roles || [])
          } else {
            setUser(null)
            setRoles([])
          }
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, roles, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
