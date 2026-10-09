// ─── Índice WHS de perfiles para pantallas PÚBLICAS (solo servidor) ──────────
//
// FUENTE ÚNICA de "el índice de estos jugadores con cuenta que no lo fijaron en
// su tarjeta". La única policy SELECT de `profiles` es `TO authenticated`: con el
// cliente del request, un visor ANÓNIMO recibe 0 filas SIN error, el jugador
// queda con índice 0 y un torneo neto se calcula como gross (P0 de la revisión
// del #509). Por eso va con el cliente de servicio, acotado a `id, indice` de los
// usuarios pedidos: el índice sólo entra al cálculo, nunca a la respuesta.
//
// `server-only`: importa el cliente de servicio. Las capas de datos que también
// viajan al navegador lo reciben inyectado (ver `fetchRondaLibreJugadoresConCourseHcp`).
import 'server-only'

import { createAdminClient } from '@/lib/supabaseAdmin'
import { leerIndicesDePerfilCon, type LeerIndicesDePerfil } from './indices-de-perfil-lectura'

export type { IndicesDePerfil, LeerIndicesDePerfil } from './indices-de-perfil-lectura'

export const indicesDePerfil: LeerIndicesDePerfil = (userIds) =>
  leerIndicesDePerfilCon(createAdminClient(), userIds)
