// ─── Dominio "compartir" · formato WhatsApp (wa.me) ─────────────────────────
// Fuente ÚNICA del texto plano de share y de la URL de wa.me. Antes vivía inline
// en `runShareCascade` (useShare); el ShareSheet también lo necesita para su
// botón "WhatsApp", así que se extrae aquí para NO duplicar el formato
// (regla "un concepto, una fuente"). Puro: sin DOM, sin React.
//
// Spec: `docs/superpowers/specs/2026-06-17-compartir-unificado-design.md`.

import type { SharePayload } from './types'

/** Texto plano para wa.me / portapapeles: el texto y el link, separados por un espacio. */
export function shareableText(payload: SharePayload): string {
  return `${payload.text} ${payload.url}`.trim()
}

/** URL de WhatsApp (wa.me) con el texto+url url-encodeados. */
export function whatsappShareUrl(payload: SharePayload): string {
  return `https://wa.me/?text=${encodeURIComponent(shareableText(payload))}`
}
