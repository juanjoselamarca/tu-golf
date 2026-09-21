// Código maestro: desbloquea todas las features Pro para el PM/CTO.
// Se activa vía URL ?master=XXXX y se guarda en localStorage con expiración.

const STORAGE_KEY = 'gp_master_override'
const VALID_CODE = 'GOLFERS2026'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

interface MasterOverride {
  activatedAt: number
  expiresAt: number
}

/** Activa el override si el código es correcto. Retorna true si se activó. */
export function activateMasterCode(code: string): boolean {
  if (code !== VALID_CODE) return false
  if (typeof window === 'undefined') return false
  const now = Date.now()
  const override: MasterOverride = {
    activatedAt: now,
    expiresAt: now + TTL_MS,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(override))
  return true
}

/** Checa si hay un master override activo y no expirado. */
export function hasMasterOverride(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const override: MasterOverride = JSON.parse(raw)
    if (Date.now() > override.expiresAt) {
      localStorage.removeItem(STORAGE_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Revoca el override manualmente. */
export function revokeMasterCode(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
