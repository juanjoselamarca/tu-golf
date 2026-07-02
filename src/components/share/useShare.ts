'use client'

// ─── UI "compartir" · hook único ────────────────────────────────────────────
// Cascada ÚNICA y determinista de compartir, consumida por TODAS las superficies
// (tarjeta, leaderboard, ronda en vivo, invitar, organizador, QR). Reemplaza las
// ~6 implementaciones divergentes (unas hacían download, otras wa.me, otras
// alert()). Spec: `docs/superpowers/specs/2026-06-17-compartir-unificado-design.md`.
//
// Cascada:
//   1. imagen + navigator.canShare({files})  → navigator.share({files, text})
//   2. navigator.share existe                → navigator.share({title, text, url})
//   3. imagen sin share nativo (desktop)     → descargar PNG + copiar link
//   4. wa.me (WhatsApp)
//   5. clipboard.writeText                   → el caller muestra toast "Copiado"
// AbortError (usuario canceló el share nativo) = no-op silencioso: NO cae a los
// siguientes pasos ni marca error.

import { useCallback, useRef, useState } from 'react'
import type { SharePayload, ShareResult, ShareStatus } from '@/golf/share/types'
import { shareableText, whatsappShareUrl } from '@/golf/share/whatsapp'
import { copyToClipboard } from '@/lib/clipboard'
import { downloadBlob } from '@/lib/download'

const DEFAULT_IMAGE_FILENAME = 'golfers-tarjeta.png'

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

/**
 * Predicado ÚNICO "¿el dispositivo soporta compartir nativo (Web Share API)?".
 * Fuente de verdad para la cascada, `runNativeShare` y el ShareSheet (evita el
 * smell de `'share' in navigator` vs truthy en lugares distintos).
 */
export function supportsNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Ejecuta la cascada de compartir. Pura respecto de React (lee `navigator` y
 * `window` globales) para poder testearla con esos globals mockeados.
 *
 * Nunca lanza: cualquier fallo real degrada al siguiente paso y, en el peor
 * caso, devuelve `{ ok: false }`. La cancelación del usuario devuelve
 * `{ ok: false, method: 'aborted' }` sin efectos secundarios.
 */
export async function runShareCascade(payload: SharePayload): Promise<ShareResult> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined

  // 1. Compartir la imagen como archivo (la mejor experiencia: la tarjeta PNG).
  if (payload.image && nav?.share && typeof nav.canShare === 'function') {
    const file = new File([payload.image.blob], payload.image.filename ?? DEFAULT_IMAGE_FILENAME, {
      type: payload.image.blob.type || 'image/png',
    })
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: payload.title, text: payload.text })
        return { ok: true, method: 'files' }
      } catch (e) {
        if (isAbortError(e)) return { ok: false, method: 'aborted' }
        // otro error → seguir cascada (degradación honesta)
      }
    }
  }

  // 2. Compartir nativo de texto + url.
  if (supportsNativeShare() && nav?.share) {
    try {
      await nav.share({ title: payload.title, text: payload.text, url: payload.url })
      return { ok: true, method: 'webshare' }
    } catch (e) {
      if (isAbortError(e)) return { ok: false, method: 'aborted' }
      // otro error → seguir cascada
    }
  }

  // 3. Imagen sin compartir nativo (desktop): bajar el PNG para que el usuario
  //    igual se lleve la tarjeta, + copiar el link. Decisión de producto 2026-07.
  //    Solo aplica cuando hay imagen; las superficies de solo-link no pasan por acá.
  if (payload.image) {
    const filename = payload.image.filename ?? DEFAULT_IMAGE_FILENAME
    if (downloadBlob(payload.image.blob, filename)) {
      await copyToClipboard(payload.url)
      return { ok: true, method: 'download' }
    }
    // si la descarga no fue posible, seguir a wa.me / portapapeles
  }

  // 4. WhatsApp (wa.me). En desktop sin Web Share API es el camino natural.
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    try {
      const opened = window.open(whatsappShareUrl(payload), '_blank')
      if (opened) return { ok: true, method: 'whatsapp' }
      // open bloqueado (popup blocker) → seguir a portapapeles
    } catch {
      // window.open lanzó (sandbox/extensión) → seguir a portapapeles
    }
  }

  // 5. Portapapeles. Vía el canónico `copyToClipboard` (fuente única), que cae a
  // textarea+execCommand donde `navigator.clipboard` no existe/rechaza (webview
  // iOS, contexto no-seguro). El caller decide mostrar el toast "Copiado".
  if (await copyToClipboard(shareableText(payload))) {
    return { ok: true, method: 'clipboard' }
  }

  return { ok: false, method: 'clipboard' }
}

/**
 * Compartir nativo de SOLO texto+url (sin imagen), vía `navigator.share`. Es el
 * paso 2 de la cascada aislado, para el botón explícito "Más opciones" del
 * ShareSheet. Nunca lanza: cancelación → `aborted`, ausencia/otros fallos →
 * `{ ok: false }`.
 */
export async function runNativeShare(payload: SharePayload): Promise<ShareResult> {
  if (!supportsNativeShare()) return { ok: false, method: 'webshare' }
  try {
    await navigator.share({ title: payload.title, text: payload.text, url: payload.url })
    return { ok: true, method: 'webshare' }
  } catch (e) {
    if (isAbortError(e)) return { ok: false, method: 'aborted' }
    return { ok: false, method: 'webshare' }
  }
}

export interface UseShareReturn {
  /** Dispara la cascada completa (con imagen si la hay). Botón "Compartir imagen". */
  share: (payload: SharePayload) => Promise<ShareResult>
  /** Abre WhatsApp (wa.me) directo. Devuelve `false` si el popup fue bloqueado. */
  whatsapp: (payload: SharePayload) => boolean
  /** Copia SOLO la url al portapapeles. Devuelve `true` si quedó copiada (toast). */
  copyLink: (url: string) => Promise<boolean>
  /** Compartir nativo texto+url (`navigator.share`). Botón "Más opciones". */
  native: (payload: SharePayload) => Promise<ShareResult>
  status: ShareStatus
  /** `true` mientras corre un share nativo (deshabilitar los botones). */
  isSharing: boolean
  /** Vuelve a `idle` (p. ej. al cerrar el sheet). */
  reset: () => void
}

/**
 * Hook de UI sobre `runShareCascade`. Maneja el estado idle/sharing/done/error
 * para el botón/sheet. La cancelación del usuario vuelve a `idle` (no es error).
 */
export function useShare(): UseShareReturn {
  const [status, setStatus] = useState<ShareStatus>('idle')
  const statusRef = useRef<ShareStatus>('idle')

  // Guard de re-entrancia compartido: si ya hay un share nativo en curso (sheet
  // del SO abierto), un segundo click no relanza nada (evita InvalidStateError +
  // wa.me espurio sobre el sheet abierto). Lo usan `share` y `native`.
  const runGuarded = useCallback(async (run: () => Promise<ShareResult>): Promise<ShareResult> => {
    if (statusRef.current === 'sharing') return { ok: false, method: 'aborted' }
    statusRef.current = 'sharing'
    setStatus('sharing')
    const res = await run()
    const next: ShareStatus = res.method === 'aborted' ? 'idle' : res.ok ? 'done' : 'error'
    statusRef.current = next
    setStatus(next)
    return res
  }, [])

  const share = useCallback(
    (payload: SharePayload) => runGuarded(() => runShareCascade(payload)),
    [runGuarded],
  )

  const native = useCallback(
    (payload: SharePayload) => runGuarded(() => runNativeShare(payload)),
    [runGuarded],
  )

  // WhatsApp y Copiar-link son acciones instantáneas (no abren sheet del SO):
  // no pasan por el guard de estado.
  const whatsapp = useCallback((payload: SharePayload): boolean => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') return false
    try {
      return Boolean(window.open(whatsappShareUrl(payload), '_blank'))
    } catch {
      return false
    }
  }, [])

  const copyLink = useCallback((url: string) => copyToClipboard(url), [])

  const reset = useCallback(() => {
    statusRef.current = 'idle'
    setStatus('idle')
  }, [])

  return { share, whatsapp, copyLink, native, status, isSharing: status === 'sharing', reset }
}
