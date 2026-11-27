/**
 * FUENTE ÚNICA de "qué aviso modal toca en esta apertura de la app".
 *
 * Regla: nunca dos avisos modales en la misma apertura. El primero que se muestra se queda con
 * la apertura y los demás esperan a la siguiente. Apertura = la sesión de la pestaña o de la PWA
 * (sessionStorage): sobrevive a recargas y a navegar, y se renueva al volver a abrir la app.
 *
 * Avisos que se coordinan acá:
 *  - 'experiencia': «Personaliza tu experiencia» (ExperienceSetup), primera vez en el dashboard.
 *    Tiene prioridad: mientras no se haya visto, los avisos de menor prioridad no se ofrecen.
 *  - 'permiso-push': pedir permiso de notificaciones en el scorer (PushPermissionPrompt).
 *  - 'vincular-fedegolf': invitar a vincular FedeGolf al abrir la app (AvisoVincularFedegolf).
 *
 * Sin timers: cada aviso pregunta antes de mostrarse (`tomarApertura`) y la respuesta es la misma
 * en cualquier pantalla. Si el storage está bloqueado, la memoria del módulo cubre la apertura.
 */
export type AvisoDeApertura = 'experiencia' | 'permiso-push' | 'vincular-fedegolf'

const CLAVE_APERTURA = 'gp:aviso-de-apertura'
/** Clave histórica de ExperienceSetup: se conserva para no volver a mostrárselo a quien ya lo vio. */
export const CLAVE_EXPERIENCIA_VISTA = 'golfers-experience-seen'

let enMemoria: AvisoDeApertura | null = null

function sesion(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function local(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Aviso que ya se mostró en esta apertura (null = ninguno). */
export function avisoDeEstaApertura(s: Storage | null = sesion()): AvisoDeApertura | null {
  try {
    const v = s?.getItem(CLAVE_APERTURA)
    if (v) return v as AvisoDeApertura
  } catch {
    // storage bloqueado: vale la memoria del módulo
  }
  return enMemoria
}

/**
 * ¿Puede mostrarse `aviso` ahora? Sí, si la apertura está libre o ya es suya (re-render o recarga).
 * No reserva nada: para mostrarlo, `tomarApertura`.
 */
export function aperturaLibrePara(aviso: AvisoDeApertura, s: Storage | null = sesion()): boolean {
  const actual = avisoDeEstaApertura(s)
  return actual == null || actual === aviso
}

/** Reserva la apertura para `aviso`. `false` = otro aviso ya se mostró: este espera a la próxima. */
export function tomarApertura(aviso: AvisoDeApertura, s: Storage | null = sesion()): boolean {
  if (!aperturaLibrePara(aviso, s)) return false
  enMemoria = aviso
  try {
    s?.setItem(CLAVE_APERTURA, aviso)
  } catch {
    // storage bloqueado: la memoria del módulo cubre esta apertura
  }
  return true
}

/** ¿Falta mostrar «Personaliza tu experiencia»? Mientras falte, tiene prioridad sobre los demás. */
export function experienciaPendiente(s: Storage | null = local()): boolean {
  try {
    return s != null && !s.getItem(CLAVE_EXPERIENCIA_VISTA)
  } catch {
    return false
  }
}

export function marcarExperienciaVista(s: Storage | null = local()): void {
  try {
    s?.setItem(CLAVE_EXPERIENCIA_VISTA, '1')
  } catch {
    // storage bloqueado: se volverá a ofrecer, como antes
  }
}

/** Solo tests: olvida la apertura en memoria. */
export function _reiniciarAperturaEnMemoria(): void {
  enMemoria = null
}
