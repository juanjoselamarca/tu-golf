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
//   3. wa.me (WhatsApp)
//   4. clipboard.writeText                   → el caller muestra toast "Copiado"
// AbortError (usuario canceló el share nativo) = no-op silencioso: NO cae a los
// siguientes pasos ni marca error.

import { useCallback, useRef, useState } from 'react'
import type { SharePayload, ShareResult, ShareStatus } from '@/golf/share/types'
import { copyToClipboard } from '@/lib/clipboard'

const DEFAULT_IMAGE_FILENAME = 'golfers-tarjeta.png'

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

/** Texto plano para wa.me / portapapeles: el texto y el link, separados por espacio. */
function plainText(payload: SharePayload): string {
  return `${payload.text} ${payload.url}`.trim()
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
  if (nav?.share) {
    try {
      await nav.share({ title: payload.title, text: payload.text, url: payload.url })
      return { ok: true, method: 'webshare' }
    } catch (e) {
      if (isAbortError(e)) return { ok: false, method: 'aborted' }
      // otro error → seguir cascada
    }
  }

  // 3. WhatsApp (wa.me). En desktop sin Web Share API es el camino natural.
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    try {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(plainText(payload))}`
      const opened = window.open(waUrl, '_blank')
      if (opened) return { ok: true, method: 'whatsapp' }
      // open bloqueado (popup blocker) → seguir a portapapeles
    } catch {
      // window.open lanzó (sandbox/extensión) → seguir a portapapeles
    }
  }

  // 4. Portapapeles. Vía el canónico `copyToClipboard` (fuente única), que cae a
  // textarea+execCommand donde `navigator.clipboard` no existe/rechaza (webview
  // iOS, contexto no-seguro). El caller decide mostrar el toast "Copiado".
  if (await copyToClipboard(plainText(payload))) {
    return { ok: true, method: 'clipboard' }
  }

  return { ok: false, method: 'clipboard' }
}

export interface UseShareReturn {
  /** Dispara la cascada. Devuelve el resultado por si el caller quiere reaccionar. */
  share: (payload: SharePayload) => Promise<ShareResult>
  status: ShareStatus
  /** `true` mientras corre la cascada (deshabilitar el botón). */
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

  const share = useCallback(async (payload: SharePayload): Promise<ShareResult> => {
    // Guard de re-entrancia: si ya hay un share en curso (sheet nativo abierto),
    // un segundo click no relanza la cascada (evita InvalidStateError + wa.me
    // espurio sobre el sheet abierto).
    if (statusRef.current === 'sharing') return { ok: false, method: 'aborted' }
    statusRef.current = 'sharing'
    setStatus('sharing')
    const res = await runShareCascade(payload)
    const next: ShareStatus = res.method === 'aborted' ? 'idle' : res.ok ? 'done' : 'error'
    statusRef.current = next
    setStatus(next)
    return res
  }, [])

  const reset = useCallback(() => {
    statusRef.current = 'idle'
    setStatus('idle')
  }, [])

  return { share, status, isSharing: status === 'sharing', reset }
}
