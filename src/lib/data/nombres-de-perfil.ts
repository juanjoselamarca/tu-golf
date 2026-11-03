// ─── Nombre de perfiles para pantallas PÚBLICAS (solo servidor) ──────────────
//
// FUENTE ÚNICA de "cómo se llaman estos jugadores con cuenta". La única policy
// SELECT de `profiles` es `TO authenticated`: con el cliente del request, un visor
// ANÓNIMO recibe 0 filas SIN error y el embed `profiles(name)` llega null, así que
// `resolveLegacyPlayerName` cae a su último recurso y TODA la tabla queda en
// "Jugador". Es lo que veía cualquiera que abría el link del torneo sin cuenta:
// el leaderboard, la lista de inscritos y el selector "¿Quién eres?" del scorer
// con N filas idénticas (hallazgo del Dead-End Hunter, 31-oct-2026).
//
// Va con el cliente de servicio, acotado a `id, name` de los usuarios pedidos.
// Los nombres de los inscritos YA son públicos en esa pantalla por diseño: el
// organizador comparte el link justamente para que se vean.
//
// `server-only`: importa el cliente de servicio. Las capas de datos que también
// viajan al navegador lo reciben inyectado (igual que `indicesDePerfil`).
import 'server-only'

import { createAdminClient } from '@/lib/supabaseAdmin'
import { leerNombresDePerfilCon, type LeerNombresDePerfil } from './nombres-de-perfil-lectura'

export type { NombresDePerfil, LeerNombresDePerfil } from './nombres-de-perfil-lectura'

export const nombresDePerfil: LeerNombresDePerfil = (userIds) =>
  leerNombresDePerfilCon(createAdminClient(), userIds)
