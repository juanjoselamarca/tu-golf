// ─── Dominio "compartir" · copy canónico ────────────────────────────────────
// Fuente ÚNICA del texto de share (con tildes correctas) y la marca. Cierra los
// bugs de la auditoría: "gano"/"quedo" sin tilde y la doble tagline. Decisión C
// del spec: tagline única "El golf amateur en español".
//
// Puro: sin DOM, sin React. Lo consumen los builders de `payload.ts`.

import { SITE_DOMAIN } from '@/lib/site-url'

/** Marca. */
export const BRAND = 'Golfers+'

/** Tagline única (decisión C; reemplaza "Primera plataforma de golf en español"). */
export const SHARE_TAGLINE = 'El golf amateur en español'

/** Firma de marca para el final del texto de share. */
const SIGNATURE = `${BRAND} — ${SITE_DOMAIN}`

/** "Jugué {gross} ({vsPar}) en {cancha}." — mi ronda, primera persona. */
export function myRoundText(p: { gross: number; vsParLabel: string; courseName: string }): string {
  return `Jugué ${p.gross} (${p.vsParLabel}) en ${p.courseName}. ${SIGNATURE}`
}

/** Resultado de ronda libre: ganador (con tilde) o empate. */
export function resultText(p: {
  winnerName: string | null
  isTie: boolean
  courseName: string
  scoreText: string
}): string {
  const head = p.isTie || !p.winnerName ? 'Empate épico' : `${p.winnerName} ganó`
  return `${head} en ${p.courseName}! Score: ${p.scoreText}. ${SIGNATURE}`
}

/** Posición en torneo (con tilde "quedó"). */
export function tournamentText(p: {
  playerName: string
  position: number
  tournamentName: string
  gross: number
}): string {
  const pos = Math.max(1, Math.trunc(p.position)) // nunca #0/negativo (CERO FALLOS)
  return `${p.playerName} quedó #${pos} en ${p.tournamentName}. Score: ${p.gross}. ${SIGNATURE}`
}

/** Seguir una ronda/torneo en vivo. */
export function liveText(): string {
  return `Sigue mi ronda en vivo en ${BRAND}`
}

/** Unirse a jugar (organizador comparte el link de inscripción). */
export function joinText(): string {
  return `Únete a jugar en ${BRAND}`
}

/** Copy fijo de invitación general a la app (port fiel de InvitarAmigos, con
 *  "tAIger+" y "Gratis" — palabras de marca/valor que no se pierden). */
export const INVITE_TITLE = `${BRAND} — Scoring en vivo y coaching con IA`
export const INVITE_TEXT = `Registra tus rondas de golf, mide tu índice y mejora con tAIger+. Gratis.`
