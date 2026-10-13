-- Columna description para torneos: texto libre del organizador
-- (código de vestimenta, premios, info adicional).
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS description text;
