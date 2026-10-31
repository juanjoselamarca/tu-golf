// src/golf/tournament-config-locks.ts
//
// Qué de la configuración de un torneo se puede seguir cambiando, y POR QUÉ no.
//
// Vive acá, puro y sin consultas, porque lo necesitan DOS lados que no pueden divergir: la pantalla
// de "editar torneo" (para apagar los controles y decir el motivo) y el guardado (para no escribir
// la columna aunque el control llegue habilitado). Cuando el predicado estaba escrito en los dos,
// el candado de 9↔18 hoyos se quedó MUERTO durante todo un PR sin que nada avisara: la pantalla
// apagaba el botón y el UPDATE escribía la columna igual.
//
// Es la ENUMERACIÓN CANÓNICA de lo que se congela EN EL CAMINO DEL ORGANIZADOR: una columna de la
// configuración que rompe datos ya escritos y no está acá queda sin candado en las dos capas a la
// vez (el control de la pantalla y el UPDATE del guardado).
//
// Lo que NO cubre, anotado para no creer de más:
//
// - El panel de ADMIN (`/api/admin/tournaments/[id]`) escribe `format` y `hole_count` con service
//   role sin pasar por acá. Es la puerta de servicio de un admin, no la del organizador.
// - `use_handicap` no está en la lista: no corrompe nada ya escrito, pero da vuelta neto↔gross del
//   board en vivo. Si se congela o no es decisión de producto.
//
// Dos cosas distintas cierran los candados, porque son dos daños distintos:
//
// - El primer SCORE: lo anotado se calculó con esta configuración. Cambiarla mueve los netos de los
//   hoyos YA jugados en el leaderboard en vivo.
// - La primera TARJETA COMPARTIDA: `startTournament` le copia al scorer su propia copia de la
//   cancha, los hoyos y el tee (`rondas_libres`: `course_id`, `holes`, `tees` — issue #698). Desde
//   ese momento, cambiar el torneo hace que el board y la tarjeta calculen cosas distintas para el
//   mismo jugador, aunque todavía no haya ni un score.
//
// Por eso la cancha, los hoyos y el tee cierran con cualquiera de las dos, y el formato cierra
// antes: desde que el torneo sale del borrador. Los grupos y los equipos ya se armaron con ese
// formato y los inscritos ya vieron a qué entraban.
//
// Devuelve el MOTIVO y no un booleano porque la pantalla tiene que decirlo, y porque un booleano
// dejaba a la copy mintiendo: con la consulta de scores caída el candado cerraba (bien) pero la
// pantalla afirmaba "después de que los jugadores comenzaron a scorear" sobre un torneo con 0
// scores. Bloquear sin haber mirado es correcto; AFIRMAR sin haber mirado, no.

import { torneoFueraDelBorrador } from './tournament-status'

/** Lo que hay que mirar para saber si un torneo ya está en juego. `null` = no se pudo contar. */
export interface SenalesDeTorneoEnJuego {
  /** Scores anotados en el torneo (`hole_scores` vía `rounds`). */
  scores: number | null
  /** Tarjetas compartidas creadas (`tournament_groups` con `ronda_libre_id`). */
  tarjetasCompartidas: number | null
  /** `tournaments.status`. */
  status: string | null
}

/**
 * Las columnas de la configuración que se bloquean. Las cuatro cambian el cálculo de algo ya
 * escrito: la cancha mueve el rating, el par y los stroke index; los hoyos, qué tarjeta existe; el
 * formato, cómo se puntúa; el tee, el hándicap con que se puntúa.
 */
export type ColumnaDeConfiguracion = 'cancha' | 'hoyos' | 'formato' | 'tee'

/**
 * Por qué una columna quedó bloqueada.
 * 'indeterminado' = no se pudo leer la señal que decide. Bloquea igual (falla CERRADO) pero no
 * autoriza a afirmar nada: un candado que falla ABIERTO es exactamente lo que pasó acá —la consulta
 * de scores filtraba por una columna que `hole_scores` no tiene, PostgREST devolvía error, el
 * conteo venía null y el candado era SIEMPRE false.
 */
export type MotivoDelCandado = 'scores' | 'publicado' | 'tarjeta-compartida' | 'indeterminado'

/** El motivo por columna, o `null` si esa columna se puede cambiar. */
export type CandadosDeConfiguracion = Record<ColumnaDeConfiguracion, MotivoDelCandado | null>

/** Los cuatro candados a partir de las señales. */
export function candadosDeConfiguracion({
  scores,
  tarjetasCompartidas,
  status,
}: SenalesDeTorneoEnJuego): CandadosDeConfiguracion {
  // El motivo de los scores, que pesa en las cuatro columnas: si no se pudieron contar, nada de lo
  // que dependa de ellos se puede afirmar.
  const porScores: MotivoDelCandado | null =
    scores == null ? 'indeterminado' : scores > 0 ? 'scores' : null

  // La tarjeta compartida congela todo lo que el scorer se copió: cancha, hoyos y tee.
  const porTarjeta: MotivoDelCandado | null =
    tarjetasCompartidas == null
      ? 'indeterminado'
      : tarjetasCompartidas > 0
        ? 'tarjeta-compartida'
        : null

  // `tournaments.status` es NOT NULL con default 'draft', así que un null acá no sale de la base:
  // sale de que no se pudo leer. Tratarlo como borrador abriría el formato de un torneo que quizás
  // está publicado — el mismo fail-open que dejó muerto el candado de los hoyos.
  const porPublicacion: MotivoDelCandado | null =
    status == null ? 'indeterminado' : torneoFueraDelBorrador(status) ? 'publicado' : null

  // El orden del `??` es el orden del daño: primero el score (concreto y ya anotado), después la
  // copia del scorer.
  const enJuego = porScores ?? porTarjeta

  return {
    cancha: enJuego,
    hoyos: enJuego,
    formato: porScores ?? porPublicacion,
    tee: enJuego,
  }
}
