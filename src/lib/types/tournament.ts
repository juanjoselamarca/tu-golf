/**
 * tournament.ts — tipos del dominio "torneo" (entidades de modelo).
 *
 * Foco actual: equipos a nivel torneo (`tournament_teams`,
 * `tournament_team_members`). Para entidades pre-existentes (Tournament,
 * Player, etc.) seguir importando desde `@/lib/supabase`.
 *
 * Convención: la forma del tipo refleja exactamente las columnas SELECT
 * básicas de la tabla. Si en un caller hace falta un shape proyectado
 * (ej. join expandido), definir un alias o tipo derivado en el módulo
 * consumidor — no contaminar este archivo con shapes ad-hoc.
 */
import type { Player } from '@/lib/supabase'

/** Equipo a nivel torneo. Tabla `tournament_teams`. */
export interface Team {
  id: string
  tournament_id: string
  name: string
  /** Hex (`#RRGGBB`) o NULL → la UI aplica paleta por `position`. */
  color: string | null
  /** Orden de visualización 1..N. UNIQUE por torneo. */
  position: number
  created_at: string
}

/** Membresía 1:1 player → team. Tabla `tournament_team_members`.
 * UNIQUE(player_id) en BD garantiza un jugador en UN solo equipo por torneo. */
export interface TeamMember {
  id: string
  team_id: string
  player_id: string
  /** Orden dentro del equipo (opcional). */
  position: number | null
  created_at: string
}

/** Equipo + miembros expandidos a Player (resultado de `getTeamWithMembers`). */
export interface TeamWithMembers {
  team: Team
  members: Player[]
}
