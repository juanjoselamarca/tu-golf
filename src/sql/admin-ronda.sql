-- Admin de Ronda: 1 jugador lleva el score de tu grupo
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columnas a rondas_libres
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rondas_libres' AND column_name = 'admin_mode') THEN
    ALTER TABLE rondas_libres ADD COLUMN admin_mode BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rondas_libres' AND column_name = 'admin_user_id') THEN
    ALTER TABLE rondas_libres ADD COLUMN admin_user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 2. Agregar columnas a ronda_libre_jugadores
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ronda_libre_jugadores' AND column_name = 'nombre_invitado') THEN
    ALTER TABLE ronda_libre_jugadores ADD COLUMN nombre_invitado TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ronda_libre_jugadores' AND column_name = 'telefono_invitado') THEN
    ALTER TABLE ronda_libre_jugadores ADD COLUMN telefono_invitado TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ronda_libre_jugadores' AND column_name = 'is_guest') THEN
    ALTER TABLE ronda_libre_jugadores ADD COLUMN is_guest BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ronda_libre_jugadores' AND column_name = 'tarjeta_aceptada') THEN
    ALTER TABLE ronda_libre_jugadores ADD COLUMN tarjeta_aceptada BOOLEAN DEFAULT null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ronda_libre_jugadores' AND column_name = 'pending_user_id') THEN
    ALTER TABLE ronda_libre_jugadores ADD COLUMN pending_user_id UUID;
  END IF;
END $$;
