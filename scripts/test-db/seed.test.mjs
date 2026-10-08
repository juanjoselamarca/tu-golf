import { describe, it, expect } from 'vitest'
import { verificarSinDatosPersonales, esEmailDePruebas, derivaHandleNewUser } from './seed.mjs'

const REAL = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'

describe('seed: ningún dato personal de usuarios reales llega a la base de pruebas', () => {
  const ids = new Set([REAL])

  it('acepta filas sin ids reales y con emails del dominio de pruebas', () => {
    expect(() => verificarSinDatosPersonales('t', { id: crypto.randomUUID(), email: 'e2e-test@golfersplus-test.local' }, ids)).not.toThrow()
  })

  it('aborta con el id de un usuario real en cualquier parte de la fila (también dentro de un jsonb)', () => {
    expect(() => verificarSinDatosPersonales('t', { organizer_id: REAL }, ids)).toThrow(/usuario real/)
    expect(() => verificarSinDatosPersonales('t', { config: { creado_por: REAL.toUpperCase() } }, ids)).toThrow(/usuario real/)
  })

  it('aborta con un email fuera de @golfersplus-test.local, aunque esté anidado', () => {
    expect(() => verificarSinDatosPersonales('t', { email: 'alguien@gmail.com' }, ids)).toThrow(/email fuera/)
    expect(() => verificarSinDatosPersonales('t', { meta: { contacto: 'x Juan.Perez@club.cl y' } }, ids)).toThrow(/email fuera/)
  })
})

describe('seed: emails (2ª vuelta Fable — puntos escapados)', () => {
  const ids = new Set()
  it('dos emails seguidos no se funden en uno que termine en el dominio de pruebas', () => {
    expect(() => verificarSinDatosPersonales('t', { nota: 'juan@gmail.com e2e@golfersplus-test.local' }, ids)).toThrow(/email fuera/)
  })
  it('un email de pruebas dentro de texto libre pasa', () => {
    expect(() => verificarSinDatosPersonales('t', { nota: 'escribe a e2e-test@golfersplus-test.local ya' }, ids)).not.toThrow()
  })
  it('un email real seguido de salto de línea se detecta', () => {
    expect(() => verificarSinDatosPersonales('t', { nota: 'contacto: maria@club.cl\nsiguiente línea' }, ids)).toThrow(/email fuera/)
  })
  it('esEmailDePruebas es el único predicado (mayúsculas incluidas)', () => {
    expect(esEmailDePruebas('E2E-Test@GolfersPlus-Test.local')).toBe(true)
    expect(esEmailDePruebas('x@golfersplus-test.local.evil.com')).toBe(false)
    expect(esEmailDePruebas(null)).toBe(false)
  })
})

describe('seed: deriva de handle_new_user', () => {
  const DEF_PROD = `CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'player'
  );
  RETURN NEW;
END;
$function$`
  it('la definición actual de prod calza', () => {
    expect(derivaHandleNewUser(DEF_PROD)).toEqual([])
  })
  it('un cambio de columnas o de rol por defecto se detecta', () => {
    expect(derivaHandleNewUser(DEF_PROD.replace('(id, email, name, role)', '(id, email, name, role, tier)'))).toHaveLength(1)
    expect(derivaHandleNewUser(DEF_PROD.replace("'player'", "'guest'"))).toEqual(["'player'"])
    expect(derivaHandleNewUser(null)).toHaveLength(3)
  })
})
