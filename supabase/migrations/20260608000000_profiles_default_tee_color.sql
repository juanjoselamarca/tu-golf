-- Default de tee por usuario para tarjetas importadas SIN tee de salida.
--
-- Muchas tarjetas (foto/manual) no traen el color del tee de salida. En vez de
-- preguntar por cada tarjeta (200 tarjetas = 200 preguntas = desastre), se
-- pregunta UNA sola vez el color habitual del jugador y se guarda acá.
-- `importRound` cae a este valor cuando la tarjeta no trae tee → resuelve el
-- CR/slope del catálogo igual que si lo hubiera traído.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_tee_color text;
