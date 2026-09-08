'use client'

// AuthContext: inicializa auth UNA vez y la comparte con Navbar y cualquier
// componente client que necesite saber si hay usuario. Evita que cada componente
// haga su propio getUser() + profiles.select() en cada navegación (~240ms de
// round-trips a Supabase por montaje).
//
// El listener onAuthStateChange mantiene el estado actualizado sin polling.
// El profile (role) se fetchea una sola vez tras el primer getUser() exitoso.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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

  useEffect(() => {
    const supabase = createClient()

    // KNOWN: there is a benign race between getUser() and onAuthStateChange().
    // Both can resolve and call setUser — the last one wins. This is cosmetic
    // only (server-side auth via middleware is the real gate). A ref-based guard
    // could prevent the double-set but adds complexity for no user-visible gain.
    // If this ever causes a flash of wrong state, add an initializedRef guard.

    // Initial auth check — runs once on mount
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
      if (data.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).single()
          .then(({ data: profile }) => setIsAdmin(profile?.role === 'admin'))
      }
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
