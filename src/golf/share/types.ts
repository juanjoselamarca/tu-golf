// ─── Dominio "compartir" · tipos canónicos ──────────────────────────────────
// Tipos compartidos por el dominio (builders de payload) y la UI (useShare).
// Fuente ÚNICA del shape de "qué se comparte". Spec:
// `docs/superpowers/specs/2026-06-17-compartir-unificado-design.md`.
//
// Puro: sin DOM, sin React. Una imagen es un `Blob` ya generado por el motor
// de tarjeta (`golf/share/card`), no un detalle de cómo se dibuja.

/** Imagen lista para compartir (PNG de la tarjeta). */
export interface ShareImageSpec {
  blob: Blob
  /** Nombre de archivo sugerido (sin esto se usa un default). */
  filename?: string
}

/**
 * Payload único que consumen TODAS las superficies de compartir.
 * `image` es opcional: si está y el dispositivo soporta compartir archivos,
 * se comparte la imagen; si no, se cae a texto+url.
 */
export interface SharePayload {
  title: string
  text: string
  url: string
  image?: ShareImageSpec
}

/** Vía por la que terminó el compartir (para telemetría/UX). */
export type ShareMethod = 'files' | 'webshare' | 'whatsapp' | 'clipboard' | 'download'

/** Estado de la operación de compartir (para el hook de UI). */
export type ShareStatus = 'idle' | 'sharing' | 'done' | 'error'

/**
 * Resultado de la cascada de compartir.
 * `aborted` = el usuario canceló el share nativo (no es error, no muestra toast).
 */
export interface ShareResult {
  ok: boolean
  method: ShareMethod | 'aborted'
}
