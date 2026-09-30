-- Una tarjeta de ronda libre = UNA fila de historial.
--
-- Los dos finalizadores de ronda libre (scorer individual y scorer de grupo)
-- guardan `metadata.ronda_libre_jugador_id`. En modo grupo el que anota guarda
-- el historial de todos los jugadores con cuenta; si uno de ellos además
-- finaliza desde su teléfono, la misma tarjeta entraba dos veces. El índice
-- único `uq_historical_user_date_course_gross` sólo cubría rondas con
-- `course_id`: sin cancha el duplicado pasaba.
--
-- Con este índice el segundo INSERT falla con 23505, que ambos finalizadores ya
-- tratan como "ya estaba guardada". Filas previas no llevan la clave: el índice
-- parcial no las toca.

CREATE UNIQUE INDEX IF NOT EXISTS ux_historical_rounds_ronda_libre_jugador
  ON public.historical_rounds ((metadata->>'ronda_libre_jugador_id'))
  WHERE metadata ? 'ronda_libre_jugador_id';
