// ─── Dominio "compartir" · builders de SharePayload ─────────────────────────
// Arman el `SharePayload` único que consume `useShare` (UI), combinando el copy
// canónico (`copy.ts`) con la url y la imagen opcional. Puros: reciben datos ya
// cargados (primitivos), sin Supabase ni shapes de superficie — las superficies
// adaptan sus datos a estos inputs, no al revés.
//
// Spec: `docs/superpowers/specs/2026-06-17-compartir-unificado-design.md`.

import type { SharePayload, ShareImageSpec } from './types'
import { SITE_URL } from '@/lib/site-url'
import {
  BRAND,
  myRoundText,
  resultText,
  tournamentText,
  liveText,
  followTournamentText,
  joinText,
  joinRoundText,
  teamScorerText,
  INVITE_TITLE,
  INVITE_TEXT,
} from './copy'

/** Mi ronda (primera persona): "Jugué 82 (+10) en Los Leones". */
export function buildRoundShare(input: {
  gross: number
  vsParLabel: string
  courseName: string
  url: string
  image?: ShareImageSpec
}): SharePayload {
  return {
    title: `Mi ronda — ${BRAND}`,
    text: myRoundText(input),
    url: input.url,
    image: input.image,
  }
}

/** Resultado de ronda libre (ganador/empate): "Pedro ganó en X! Score: ...". */
export function buildResultShare(input: {
  winnerName: string | null
  isTie: boolean
  courseName: string
  scoreText: string
  url: string
  image?: ShareImageSpec
}): SharePayload {
  return {
    title: `Resultado — ${BRAND}`,
    text: resultText(input),
    url: input.url,
    image: input.image,
  }
}

/** Posición en torneo: "Ana quedó #3 en Copa Verano. Score: ...". */
export function buildTournamentShare(input: {
  playerName: string
  position: number
  tournamentName: string
  gross: number
  url: string
  image?: ShareImageSpec
}): SharePayload {
  return {
    title: input.tournamentName,
    text: tournamentText(input),
    url: input.url,
    image: input.image,
  }
}

/** Seguir una ronda/torneo en vivo. */
export function buildLiveShare(input: { url: string }): SharePayload {
  return { title: BRAND, text: liveText(), url: input.url }
}

/** Seguir un torneo, con su nombre en el mensaje. */
export function buildFollowTournamentShare(input: { tournamentName: string; url: string }): SharePayload {
  return { title: input.tournamentName, text: followTournamentText(input.tournamentName), url: input.url }
}

/** Invitar a sumarse a anotar en una ronda libre ("Únete a mi ronda"). */
export function buildRoundInviteShare(input: { url: string }): SharePayload {
  return { title: BRAND, text: joinRoundText(), url: input.url }
}

/** Un celular por equipo: invitar a un jugador de cada equipo a anotar el suyo (el link abre el scorer de grupo). */
export function buildTeamScorerShare(input: { url: string }): SharePayload {
  return { title: BRAND, text: teamScorerText(), url: input.url }
}

/** Organizador comparte el link de inscripción ("Únete a jugar"). */
export function buildOrganizerShare(input: { url: string }): SharePayload {
  return { title: BRAND, text: joinText(), url: input.url }
}

/** Invitación general a la app (sin contexto de ronda). */
export function buildInviteShare(input?: { url?: string }): SharePayload {
  return { title: INVITE_TITLE, text: INVITE_TEXT, url: input?.url ?? SITE_URL }
}
