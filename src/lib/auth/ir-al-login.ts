import { loginUrl } from '@/lib/auth/login-url'

/**
 * Navegación dura al login que, tras entrar, vuelve a `next`. Dura (no `router.push`) para que la página de
 * destino arranque de cero con la sesión nueva. Módulo aparte para poder simularla en tests (jsdom no deja
 * reemplazar `window.location`).
 */
export function irAlLogin(next: string): void {
  window.location.assign(loginUrl(next))
}
