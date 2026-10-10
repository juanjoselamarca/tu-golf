import { isAuthWeakPasswordError, type AuthError } from '@supabase/supabase-js'

/** Must match password_min_length in the Supabase auth config. */
export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_TOO_SHORT = {
  field: 'password',
  title: 'Contraseña muy corta',
  body: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
} as const

export function translateRegisterError(error: AuthError) {
  const m = error.message.toLowerCase()
  if (m.includes('user already registered') || m.includes('already been registered'))
    return { field: 'email', title: 'Email ya registrado', body: '¿Quieres iniciar sesión?' } as const
  if (m.includes('password should be at least') || m.includes('password is too short'))
    return PASSWORD_TOO_SHORT
  // Leaked password check (HIBP) in the Supabase auth config.
  if (isAuthWeakPasswordError(error) && error.reasons.includes('pwned'))
    return { field: 'password', title: 'Contraseña insegura', body: 'Esa contraseña aparece en filtraciones conocidas. Elige otra.' } as const
  return { field: null, title: 'Error al registrarse', body: 'No pudimos crear tu cuenta. Por favor intenta nuevamente.' } as const
}
