'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

type Role = 'player' | 'organizer' | 'admin'

interface Permisos {
  rol: Role
  esAdmin: boolean
  esOrganizador: boolean
  puedeVerAdmin: boolean
  cargando: boolean
}

const DEFAULTS: Permisos = {
  rol: 'player',
  esAdmin: false,
  esOrganizador: false,
  puedeVerAdmin: false,
  cargando: true,
}

/**
 * Hook para verificar permisos del usuario autenticado.
 * Lee profiles.role de Supabase una vez al montar.
 * Admin puede ver todo. Organizer puede crear torneos. Player es el default.
 */
export function usePermisos(): Permisos {
  const [permisos, setPermisos] = useState<Permisos>(DEFAULTS)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setPermisos({ ...DEFAULTS, cargando: false })
        return
      }

      supabase.from('profiles').select('role')
        .eq('id', user.id).single()
        .then(({ data }) => {
          const rol = (data?.role ?? 'player') as Role
          setPermisos({
            rol,
            esAdmin: rol === 'admin',
            esOrganizador: rol === 'organizer' || rol === 'admin',
            puedeVerAdmin: rol === 'admin',
            cargando: false,
          })
        })
    })
  }, [])

  return permisos
}
