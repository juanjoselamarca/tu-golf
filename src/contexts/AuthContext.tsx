'use client'

// AuthContext: inicializa auth UNA vez y la comparte con Navbar y cualquier
// componente client que necesite saber si hay usuario. Evita que cada componente
// haga su propio getUser() + profiles.select() en cada navegación (~240ms de
// round-trips a Supabase por montaje).
//
// El listener onAuthStateChange mantiene el estado actualizado sin polling.
// El profile (role) se fetchea una sola vez tras el primer getUser() exitoso.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  isAdmin: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const initializedRef = useRef(false)

  useEffect(() => {
    // Guard: only initialize once. React 18 StrictMode double-mounts in dev,
    // and tab-switch can re-trigger effects. Without this guard, getUser()
    // fires on every re-activation (~120ms wasted).
    if (initializedRef.current) return
    initializedRef.current = true

    const supabase = createClient()

    // Initial auth check — uses getSession() first (reads cookie locally, no
    // network call) for instant UI. Then getUser() validates server-side in
    // background. This eliminates the 120ms flash on first paint.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        setLoading(false)
        supabase.from('profiles').select('role').eq('id', session.user.id).single()
          .then(({ data: profile }) => setIsAdmin(profile?.role === 'admin'))
      }
      // Background validation — refreshes token if needed
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          setUser(data.user)
        } else if (session?.user) {
          // Session existed locally but server says invalid — force logout
          setUser(null)
          setIsAdmin(false)
        }
        setLoading(false)
      })
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        supabase.from('profiles').select('role').eq('id', session.user.id).single()
          .then(({ data: profile }) => setIsAdmin(profile?.role === 'admin'))
      } else {
        setIsAdmin(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
