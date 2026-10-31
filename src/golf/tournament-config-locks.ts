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
// Son TRES candados distintos a propósito. Lo que cada columna rompe es distinto:
//
// - hoyos: solo con scores puestos. Antes del primer score, 9↔18 no invalida ninguna fila (el par
//   de la ronda se recalcula) y el organizador que lo configuró mal tiene que poder arreglarlo.
// - formato: desde que el torneo sale del borrador. Los grupos y los equipos ya se armaron con ese
//   formato, y los jugadores ya vieron a qué se inscribían.
// - tee: desde el primer score O la primera tarjeta compartida. El tee no se guarda en la tarjeta:
//   entra al CALCULAR el neto (`leaderboard.ts` resuelve el course handicap leyendo
//   `tournaments.tees`), así que cambiarlo con scores puestos mueve los netos de los hoyos YA
//   jugados en el leaderboard en vivo. Y `startTournament` le copia el tee a `rondas_libres.tees`
//   al crear la tarjeta (issue #698): desde ese momento el board y la tarjeta calcularían dos
//   hándicaps distintos para el mismo jugador.
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

/** Las columnas de la configuración que se bloquean. */
export type ColumnaDeConfiguracion = 'hoyos' | 'formato' | 'tee'

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

/** ¿Quedó alguna columna bloqueada sin que se pudiera confirmar por qué? */
export function candadoIndeterminado(candados: CandadosDeConfiguracion): boolean {
  return Object.values(candados).some((m) => m === 'indeterminado')
}

/** Los tres candados a partir de las señales. */
export function candadosDeConfiguracion({
  scores,
  tarjetasCompartidas,
  status,
}: SenalesDeTorneoEnJuego): CandadosDeConfiguracion {
  // El motivo de los scores, que pesa en las tres columnas: si no se pudieron contar, nada de lo
  // que dependa de ellos se puede afirmar.
  const porScores: MotivoDelCandado | null =
    scores == null ? 'indeterminado' : scores > 0 ? 'scores' : null

  // `tournaments.status` es NOT NULL con default 'draft', así que un null acá no sale de la base:
  // sale de que no se pudo leer. Tratarlo como borrador abriría el formato de un torneo que quizás
  // está publicado — el mismo fail-open que dejó muerto el candado de los hoyos.
  const porPublicacion: MotivoDelCandado | null =
    status == null ? 'indeterminado' : torneoFueraDelBorrador(status) ? 'publicado' : null

  return {
    hoyos: porScores,
    formato: porScores ?? porPublicacion,
    tee:
      porScores ??
      (tarjetasCompartidas == null
        ? 'indeterminado'
        : tarjetasCompartidas > 0
          ? 'tarjeta-compartida'
          : null),
  }
}
