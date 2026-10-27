import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { verificarSinDatosPersonales, esEmailDePruebas, derivaHandleNewUser, leerSeedData, columnasASembrar, verificarMismasColumnas, manifiesto, DIR_SEED_DATA } from './seed.mjs'

describe('seed: ningún dato personal de usuarios reales llega a la base de pruebas', () => {
  const usuarios = { organizer_id: 'dueno', user_id: 'null' }

  it('acepta columnas de persona con null o su rol y emails del dominio de pruebas', () => {
    expect(() => verificarSinDatosPersonales('t', { organizer_id: 'dueno', user_id: null, email: 'e2e-test@golfersplus-test.local' }, usuarios)).not.toThrow()
    expect(() => verificarSinDatosPersonales('t', { organizer_id: null, user_id: null }, usuarios)).not.toThrow()
  })

  it('aborta si una columna de persona trae un id (o un rol en una columna que va en null)', () => {
    expect(() => verificarSinDatosPersonales('t', { organizer_id: crypto.randomUUID(), user_id: null }, usuarios)).toThrow(/organizer_id/)
    expect(() => verificarSinDatosPersonales('t', { organizer_id: null, user_id: 'dueno' }, usuarios)).toThrow(/user_id/)
  })

  it('aborta si la columna de persona no está en la fila', () => {
    expect(() => verificarSinDatosPersonales('t', { user_id: null }, usuarios)).toThrow(/organizer_id no está/)
  })

  it('aborta con un email fuera de @golfersplus-test.local, aunque esté anidado', () => {
    expect(() => verificarSinDatosPersonales('t', { email: 'alguien@gmail.com' }, {})).toThrow(/email fuera/)
    expect(() => verificarSinDatosPersonales('t', { meta: { contacto: 'x Juan.Perez@club.cl y' } }, {})).toThrow(/email fuera/)
  })
})

describe('seed: seed-data', () => {
  it('trae un archivo por cada tabla del manifiesto y ninguno de más', () => {
    const tablas = [...manifiesto.catalogo, ...manifiesto.fixtures.map(f => f.tabla)].map(t => `${t}.json`).sort()
    expect(readdirSync(DIR_SEED_DATA).sort()).toEqual(tablas)
  })

  it('todas sus filas pasan la verificación de datos personales', () => {
    expect(leerSeedData().every(l => l.filas.length > 0)).toBe(true)
  })
})

describe('seed: columnas que siembra', () => {
  const columnas = [{ c: 'id' }, { c: 'nombre' }, { c: 'total', g: 'ALWAYS' }, { c: 'nueva_con_default' }]

  it('solo las que trae seed-data: una columna agregada después del export queda con su DEFAULT', () => {
    expect(columnasASembrar('t', columnas, [{ id: 1, nombre: 'a', total: 3 }])).toEqual(['id', 'nombre'])
  })

  it('aborta si seed-data trae una columna que la tabla ya no tiene', () => {
    expect(() => columnasASembrar('t', columnas, [{ id: 1, renombrada: 'a' }])).toThrow(/renombrada/)
  })

  it('aborta si una fila no trae las mismas columnas que las demás', () => {
    expect(() => verificarMismasColumnas('t', [{ id: 1, nombre: 'a' }, { nombre: 'b', id: 2 }])).not.toThrow()
    expect(() => verificarMismasColumnas('t', [{ id: 1, nombre: 'a' }, { id: 2 }])).toThrow(/fila 1/)
  })
})

describe('seed: emails (2ª vuelta Fable — puntos escapados)', () => {
  it('dos emails seguidos no se funden en uno que termine en el dominio de pruebas', () => {
    expect(() => verificarSinDatosPersonales('t', { nota: 'juan@gmail.com e2e@golfersplus-test.local' }, {})).toThrow(/email fuera/)
  })
  it('un email de pruebas dentro de texto libre pasa', () => {
    expect(() => verificarSinDatosPersonales('t', { nota: 'escribe a e2e-test@golfersplus-test.local ya' }, {})).not.toThrow()
  })
  it('un email real seguido de salto de línea se detecta', () => {
    expect(() => verificarSinDatosPersonales('t', { nota: 'contacto: maria@club.cl\nsiguiente línea' }, {})).toThrow(/email fuera/)
  })
  it('esEmailDePruebas es el único predicado (mayúsculas incluidas)', () => {
    expect(esEmailDePruebas('E2E-Test@GolfersPlus-Test.local')).toBe(true)
    expect(esEmailDePruebas('x@golfersplus-test.local.evil.com')).toBe(false)
    expect(esEmailDePruebas(null)).toBe(false)
  })
})

describe('seed: deriva de handle_new_user (cuerpo completo)', () => {
  const DEF_PROD = `CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
$function$
`
  it('la definición actual de prod calza', () => {
    expect(derivaHandleNewUser(DEF_PROD)).toBeNull()
  })
  it('no depende de que el esquema venga calificado', () => {
    expect(derivaHandleNewUser(DEF_PROD.replace('INSERT INTO public.profiles', 'INSERT INTO profiles'))).toBeNull()
  })
  it('una ADICIÓN (otro insert antes de RETURN NEW) se detecta y reporta esperado/actual', () => {
    const d = derivaHandleNewUser(DEF_PROD.replace('  RETURN NEW;', "  insert into public.user_settings (user_id) values (NEW.id);\n  RETURN NEW;"))
    expect(d).not.toBeNull()
    expect(d.actual).toContain('insert into user_settings')
    expect(d.esperado).not.toContain('user_settings')
  })
  it('los literales no se normalizan: mayúsculas dentro de comillas son deriva', () => {
    expect(derivaHandleNewUser(DEF_PROD.replace("'player'", "'Player'"))).not.toBeNull()
    expect(derivaHandleNewUser(DEF_PROD.replace("->>'name'", "->>'Name'"))).not.toBeNull()
    expect(derivaHandleNewUser(DEF_PROD.replace("'@', 1", "' @', 1"))).not.toBeNull()
  })
  it('un ON CONFLICT o un cambio de rol se detectan', () => {
    expect(derivaHandleNewUser(DEF_PROD.replace("'player'\n  );", "'player'\n  ) ON CONFLICT (id) DO UPDATE SET role = 'player';"))).not.toBeNull()
    expect(derivaHandleNewUser(DEF_PROD.replace("'player'", "'guest'"))).not.toBeNull()
    expect(derivaHandleNewUser(null)).not.toBeNull()
  })
})
