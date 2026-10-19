/**
 * Memo por dispositivo de "este usuario no tiene FedeGolf vinculado", para que
 * FedegolfSync (montado en el layout raíz) no le pegue a /api/fedegolf/* en cada
 * carga a los usuarios sin cuenta vinculada (la gran mayoría). Dura 24 h; vincular
 * desde la app lo borra al instante. Si el storage no está disponible, se comporta
 * como "no sabemos" (pregunta al server, igual que antes).
 */
export const NO_VINCULADO_TTL_MS = 24 * 60 * 60 * 1000

const clave = (userId: string) => `gp:fedegolf-no-vinculado:${userId}`

export function storagePorDefecto(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function recordarNoVinculado(userId: string, ahora = Date.now(), s = storagePorDefecto()): void {
  try {
    s?.setItem(clave(userId), String(ahora))
  } catch {
    // storage bloqueado: seguimos preguntando al server
  }
}

export function sabemosQueNoEstaVinculado(userId: string, ahora = Date.now(), s = storagePorDefecto()): boolean {
  try {
    const desde = Number(s?.getItem(clave(userId)))
    return Number.isFinite(desde) && desde > 0 && ahora - desde < NO_VINCULADO_TTL_MS
  } catch {
    return false
  }
}

export function olvidarVinculo(userId: string, s = storagePorDefecto()): void {
  try {
    s?.removeItem(clave(userId))
  } catch {
    // storage bloqueado: no había memo que borrar
  }
}
