/**
 * `ronda_libre_jugadores.perfil_sugerido_id` es SOLO una referencia: el perfil que el creador eligió
 * para un rival. No puede dar ninguno de los poderes que da `user_id` (anotar la ronda, avisos push,
 * índice desde el perfil, historial, calcular_indice_golfers). #581 dejó el user_id de los rivales en
 * null justamente porque el creador podía meter la ronda en la cuenta de cualquier usuario.
 *
 * Este test congela que en el schema la columna vive solo en su migración, sin policy, función ni
 * grant que la lea, salvo la anonimización de eliminar_cuenta. Y que ningún objeto la expone sin
 * nombrarla (función que devuelve la fila entera, row_to_json(alias), alias.*, SELECT *, vistas).
 * Si una migración futura la necesita, se edita esto a conciencia (y pasa por revisión de zona crítica).
 */
import { describe, expect, it } from 'vitest'
import {
  BASELINE,
  functionDefinition,
  migrationFiles,
  readMigration,
  sqlStatements,
  stripSqlComments,
} from '@/__tests__/helpers/migration-sql'

const COLUMNA = 'perfil_sugerido_id'
const MIGRACION = '20261026120000_ronda_libre_jugadores_perfil_sugerido.sql'

/** De `CREATE OR REPLACE FUNCTION public.eliminar_cuenta(` hasta su `$function$;`, tal cual. */
function eliminarCuenta(sql: string): string {
  const inicio = sql.indexOf('CREATE OR REPLACE FUNCTION public.eliminar_cuenta(')
  expect(inicio, 'eliminar_cuenta definida').toBeGreaterThanOrEqual(0)
  return sql.slice(inicio, sql.indexOf('$function$;', inicio) + '$function$;'.length)
}

type Migracion = { file: string; sql: string }
const realMigrations = (): Migracion[] => migrationFiles().map(file => ({ file, sql: readMigration(file) }))

/** La definición de eliminar_cuenta que queda vigente: la última, con las migraciones ordenadas por nombre. */
function ultimaEliminarCuenta(migraciones: Migracion[]): { file: string; def: string } | undefined {
  return [...migraciones]
    .sort((a, b) => a.file.localeCompare(b.file))
    .flatMap(m => {
      const def = functionDefinition(stripSqlComments(m.sql), 'eliminar_cuenta')
      return def ? [{ file: m.file, def }] : []
    })
    .at(-1)
}

const conservaAnonimizacion = (migraciones: Migracion[]) =>
  ultimaEliminarCuenta(migraciones)?.def.includes('perfil_sugerido_id = p_user_id') ?? false

/** El UPDATE que toda redefinición de eliminar_cuenta posterior al baseline tiene que traer. */
const UPDATE_ANONIMIZACION =
  /UPDATE ronda_libre_jugadores SET nombre = c_anonimo\s+WHERE\s+perfil_sugerido_id = p_user_id AND user_id IS NULL AND pending_user_id IS NULL;/

/** TODAS las definiciones de eliminar_cuenta de un archivo (no solo la última), sin comentarios. */
function definicionesEliminarCuenta(sql: string): string[] {
  const limpio = stripSqlComments(sql)
  const inicios = [...limpio.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?eliminar_cuenta"?\s*\(/gi)]
  return inicios.map(m => {
    const siguiente = [...limpio.matchAll(/create\s+(?:or\s+replace\s+)?function\s/gi)].find(n => n.index > m.index)
    return limpio.slice(m.index, siguiente?.index)
  })
}

/**
 * Archivos (fuera del baseline) con alguna definición de eliminar_cuenta sin la anonimización. El
 * workflow aplica con --include-all: una migración de timestamp anterior mergeada después corre
 * DESPUÉS en prod aunque por nombre no sea la "última", así que se exige en todas.
 */
const redefinicionesSinAnonimizar = (migraciones: Migracion[]) =>
  migraciones
    .filter(m => m.file !== BASELINE)
    .filter(m => definicionesEliminarCuenta(m.sql).some(def => !UPDATE_ANONIMIZACION.test(def)))
    .map(m => m.file)

const PERMISOS_ELIMINAR_CUENTA = /^(?:revoke|grant) [^;\n]* on function public\.eliminar_cuenta\(uuid\) [^;\n]*;$/gim
const ANONIMIZACION = /\n\n  -- Tarjetas en que un creador lo eligió como rival \(perfil_sugerido_id\)[^\n]*\n(?:  --[^\n]*\n)*  UPDATE ronda_libre_jugadores SET nombre = c_anonimo\n  WHERE  perfil_sugerido_id = p_user_id AND user_id IS NULL AND pending_user_id IS NULL;\n/

describe('perfil_sugerido_id no da poderes', () => {
  it('solo su propia migración la menciona (ninguna otra policy, función ni grant la lee)', () => {
    const mencionan = migrationFiles().filter(f => stripSqlComments(readMigration(f)).includes(COLUMNA))
    expect(mencionan).toEqual([MIGRACION])
  })

  it('su migración solo agrega la columna (privada para la sesión), el comentario, el índice y eliminar_cuenta', () => {
    const migracion = readMigration(MIGRACION)
    const permisos = (sql: string) => stripSqlComments(sql).match(PERMISOS_ELIMINAR_CUENTA) ?? []
    // Los permisos de eliminar_cuenta se redeclaran idénticos a los del baseline (solo service_role).
    expect(permisos(migracion)).toEqual(permisos(readMigration(BASELINE)))
    const resto = stripSqlComments(migracion.replace(eliminarCuenta(migracion), '')).replace(PERMISOS_ELIMINAR_CUENTA, '')
    expect(resto).toMatch(/ADD COLUMN IF NOT EXISTS perfil_sugerido_id uuid NULL\s+REFERENCES public\.profiles\(id\) ON DELETE SET NULL/)
    expect(resto).toMatch(/REVOKE SELECT \(perfil_sugerido_id\) ON public\.ronda_libre_jugadores FROM PUBLIC, anon, authenticated;/)
    expect(resto).not.toMatch(/\b(GRANT|POLICY|FUNCTION|TRIGGER|VIEW|UPDATE|DELETE FROM|INSERT INTO)\b/i)
  })

  it('eliminar_cuenta es la del baseline EXACTA más la anonimización de las tarjetas en que lo eligieron', () => {
    const nueva = eliminarCuenta(readMigration(MIGRACION))
    expect(nueva).toMatch(ANONIMIZACION)
    expect(nueva.replace(ANONIMIZACION, '\n')).toBe(eliminarCuenta(readMigration(BASELINE)))
    // La anonimización va antes de borrar el perfil (después, el ON DELETE SET NULL ya apagó la referencia).
    expect(nueva.search(ANONIMIZACION)).toBeLessThan(nueva.indexOf('DELETE FROM auth.users'))
  })

  it('la ÚLTIMA definición de eliminar_cuenta en las migraciones conserva la anonimización', () => {
    // Una migración futura que redefina la función sin copiar esta versión la perdería en silencio.
    expect(ultimaEliminarCuenta(realMigrations())?.file).toBe(MIGRACION)
    expect(conservaAnonimizacion(realMigrations())).toBe(true)
    // Guard del detector: una redefinición posterior sin la anonimización se caza; con ella, no.
    const base = readMigration(BASELINE)
    const sin = { file: '20991231000000_redefine.sql', sql: functionDefinition(base, 'eliminar_cuenta')! }
    expect(conservaAnonimizacion([sin, ...realMigrations()])).toBe(false)
    const con = { file: '20991231000000_redefine.sql', sql: eliminarCuenta(readMigration(MIGRACION)) }
    expect(conservaAnonimizacion([...realMigrations(), con])).toBe(true)
  })

  it('TODA redefinición de eliminar_cuenta fuera del baseline trae la anonimización (--include-all no respeta el orden)', () => {
    expect(redefinicionesSinAnonimizar(realMigrations())).toEqual([])
    // Guard: una migración de timestamp ANTERIOR que la redefine sin el UPDATE se caza aunque no sea la última.
    const vieja = { file: '20261025000000_redefine.sql', sql: functionDefinition(readMigration(BASELINE), 'eliminar_cuenta')! }
    expect(conservaAnonimizacion([...realMigrations(), vieja])).toBe(true)
    expect(redefinicionesSinAnonimizar([...realMigrations(), vieja])).toEqual([vieja.file])
    // Y también dos definiciones en el mismo archivo, la primera sin el UPDATE.
    const doble = { file: '20991231000000_doble.sql', sql: `${vieja.sql};\n${eliminarCuenta(readMigration(MIGRACION))}` }
    expect(redefinicionesSinAnonimizar([doble])).toEqual([doble.file])
  })

  it('antes de esta migración, la definición vigente de eliminar_cuenta es la del baseline', () => {
    expect(ultimaEliminarCuenta(realMigrations().filter(m => m.file < MIGRACION))?.file).toBe(BASELINE)
  })

  it('el rollback devuelve eliminar_cuenta EXACTA del baseline antes de borrar la columna', () => {
    const rollback = readMigration('rollback/20261026_ronda_libre_jugadores_perfil_sugerido_rollback.sql')
    expect(eliminarCuenta(rollback)).toBe(eliminarCuenta(readMigration(BASELINE)))
    expect(rollback.indexOf('eliminar_cuenta(')).toBeLessThan(rollback.indexOf('DROP COLUMN'))
  })

  it('los lectores de permisos e índice siguen mirando user_id', () => {
    // Si alguno de estos se redefine en una migración posterior, la primera prueba ya lo vigila;
    // esto fija además que hoy dependen de user_id (el poder que el rival NO recibe).
    const baseline = readMigration(BASELINE)
    for (const fn of ['puede_anotar_ronda', 'calcular_indice_golfers']) {
      const def = functionDefinition(baseline, fn)
      expect(def, fn).toBeDefined()
      expect(def).toMatch(/user_id/)
      expect(def).not.toContain(COLUMNA)
    }
  })
})

const TABLA = String.raw`(?:"?public"?\.)?"?ronda_libre_jugadores"?(?!\w)`
const NO_ALIAS = new Set([
  'where', 'on', 'set', 'join', 'left', 'right', 'inner', 'full', 'cross', 'using', 'values', 'select', 'group', 'order',
  'limit', 'for', 'returning', 'as', 'and', 'or', 'union', 'except', 'intersect', 'window', 'having', 'offset', 'into',
  'add', 'alter', 'drop', 'enable', 'disable', 'owner', 'to', 'from', 'with', 'is', 'in', 'language', 'returns', 'then',
])

/**
 * Lugares donde un statement que toca ronda_libre_jugadores expone la fila entera (y con ella
 * perfil_sugerido_id) sin nombrar la columna. Se mira statement por statement, también dentro de los
 * cuerpos de función.
 */
function exposicionesSinNombrarla(sql: string): string[] {
  const hallazgos: string[] = []
  for (const stmt of sqlStatements(stripSqlComments(sql), { insideBodies: true })) {
    if (!new RegExp(TABLA, 'i').test(stmt)) continue
    const alias = [...stmt.matchAll(new RegExp(String.raw`${TABLA}\s+(?:as\s+)?"?([a-z_]\w*)"?`, 'gi'))]
      .map(m => m[1].toLowerCase())
      .filter(a => !NO_ALIAS.has(a))
    const nombres = ['ronda_libre_jugadores', ...alias].map(a => String.raw`"?${a}"?`).join('|')
    const reglas: [string, RegExp][] = [
      ['devuelve la fila entera', new RegExp(String.raw`\breturns\s+(?:setof\s+)?${TABLA}`, 'i')],
      ['variable %rowtype', new RegExp(String.raw`${TABLA}%rowtype`, 'i')],
      ['vista sobre la tabla', /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\b/i],
      // El trigger recibe NEW/OLD: la fila entera, perfil_sugerido_id incluido.
      ['trigger sobre la tabla', /\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\b/i],
      ['SELECT *', /\bselect\s+(?:distinct\s+)?\*/i],
      ['RETURNING *', /\breturning\s+\*/i],
      ['alias.*', new RegExp(String.raw`(?:^|[^\w"])(?:${nombres})\.\*`, 'i')],
      // La fila como argumento de CUALQUIER función y en cualquier posición: f(j), f(DISTINCT j),
      // f(j ORDER BY …), jsonb_build_object('jugador', j); FILTER (WHERE …) va después del paréntesis.
      ['fila como argumento', new RegExp(String.raw`\b\w+\s*\((?:[^;]*?[(,])?\s*(?:distinct\s+)?(?:${nombres})\s*(?:[,)]|order\s+by\b)`, 'i')],
      ['SELECT de la fila por alias', new RegExp(String.raw`\bselect\s+(?:distinct\s+)?(?:${nombres})(?:\s+(?:as\s+)?"?\w+"?)?\s*(?:,|\s(?:from|into)\b)`, 'i')],
    ]
    for (const [regla, re] of reglas) if (re.test(stmt)) hallazgos.push(`${regla}: ${stmt.slice(0, 120).replace(/\s+/g, ' ')}`)
  }
  return hallazgos
}

describe('perfil_sugerido_id no se expone sin nombrarla', () => {
  it('ninguna migración expone la fila entera de ronda_libre_jugadores', () => {
    const hallazgos = migrationFiles().flatMap(f => exposicionesSinNombrarla(readMigration(f)).map(h => `${f}: ${h}`))
    expect(hallazgos).toEqual([])
  })

  it('detecta cada forma de exponer la fila (guard del detector)', () => {
    const casos = [
      'CREATE FUNCTION f() RETURNS SETOF public.ronda_libre_jugadores LANGUAGE sql AS $$ SELECT j.id FROM ronda_libre_jugadores j $$;',
      'CREATE FUNCTION f() RETURNS ronda_libre_jugadores LANGUAGE sql AS $$ SELECT 1 $$;',
      'CREATE FUNCTION f() RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r ronda_libre_jugadores%ROWTYPE; BEGIN RETURN 1; END $$;',
      'CREATE FUNCTION f() RETURNS jsonb LANGUAGE sql AS $$ SELECT row_to_json(j) FROM public.ronda_libre_jugadores j $$;',
      'CREATE FUNCTION f() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_agg(jug) FROM ronda_libre_jugadores AS jug $$;',
      'CREATE FUNCTION f() RETURNS jsonb LANGUAGE sql AS $$ SELECT to_jsonb(ronda_libre_jugadores) FROM ronda_libre_jugadores $$;',
      'CREATE FUNCTION f() RETURNS TABLE (x int) LANGUAGE sql AS $$ SELECT j.* FROM ronda_libre_jugadores j $$;',
      'CREATE FUNCTION f() RETURNS void LANGUAGE sql AS $$ SELECT * FROM public.ronda_libre_jugadores WHERE id = 1 $$;',
      'CREATE VIEW v AS SELECT j.id, j.nombre FROM public.ronda_libre_jugadores j;',
      'CREATE FUNCTION f() RETURNS void LANGUAGE sql AS $$ INSERT INTO ronda_libre_jugadores (nombre) VALUES (1) RETURNING * $$;',
      'SELECT array_agg(j) FROM ronda_libre_jugadores j;',
      'SELECT json_agg(DISTINCT j) FROM ronda_libre_jugadores j;',
      'SELECT jsonb_agg(j ORDER BY j.id) FROM ronda_libre_jugadores j;',
      'SELECT json_agg(j) FILTER (WHERE j.user_id IS NULL) FROM ronda_libre_jugadores j;',
      'SELECT array_to_json(array_agg(j)) FROM ronda_libre_jugadores j;',
      'SELECT array_to_json(j) FROM ronda_libre_jugadores j;',
      'SELECT j FROM ronda_libre_jugadores j;',
      'SELECT DISTINCT j, j.id FROM public.ronda_libre_jugadores AS j;',
      'CREATE FUNCTION f() RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r record; BEGIN SELECT jug INTO r FROM ronda_libre_jugadores jug; RETURN 1; END $$;',
      'SELECT j AS fila FROM ronda_libre_jugadores j;',
      'SELECT j fila, j.id FROM ronda_libre_jugadores j;',
      "SELECT jsonb_build_object('jugador', j) FROM ronda_libre_jugadores j;",
      "SELECT jsonb_build_object('id', j.id, 'jugador', j, 'n', 1) FROM ronda_libre_jugadores j;",
      "SELECT coalesce(nullif(j.nombre, ''), 'x'), my_fn(1, j) FROM public.ronda_libre_jugadores j;",
      'CREATE TRIGGER t AFTER UPDATE ON public.ronda_libre_jugadores FOR EACH ROW EXECUTE FUNCTION f();',
      'CREATE OR REPLACE TRIGGER t BEFORE INSERT ON ronda_libre_jugadores FOR EACH ROW EXECUTE FUNCTION f();',
    ]
    for (const caso of casos) expect(exposicionesSinNombrarla(caso), caso).not.toEqual([])
  })

  it('no confunde lecturas por columna ni otras tablas con exposiciones (guard del detector)', () => {
    const limpios = [
      'CREATE FUNCTION f() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object(\'id\', j.id) FROM ronda_libre_jugadores j WHERE j.user_id = auth.uid() $$;',
      'CREATE FUNCTION f() RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN PERFORM 1 FROM ronda_libre_jugadores j; FOR k, v IN SELECT * FROM jsonb_each(p) LOOP END LOOP; END $$;',
      'CREATE FUNCTION f() RETURNS SETOF public.ronda_libre_jugadores_x LANGUAGE sql AS $$ SELECT 1 $$;',
      'UPDATE ronda_libre_jugadores SET pending_user_id = NULL WHERE pending_user_id = p_user_id;',
      'SELECT count(*) FROM ronda_libre_jugadores;',
      'SELECT jsonb_agg(j.id ORDER BY j.id) FROM ronda_libre_jugadores j;',
      'SELECT array_agg(DISTINCT j.ronda_id) FROM ronda_libre_jugadores j;',
      "SELECT json_agg(jsonb_build_object('n', j.nombre)) FILTER (WHERE j.user_id IS NULL) FROM ronda_libre_jugadores j;",
      'SELECT j.id, j.nombre FROM ronda_libre_jugadores j;',
      'SELECT jugadas FROM ronda_libre_jugadores j;',
      'SELECT array_to_json(array_agg(j.id)) FROM ronda_libre_jugadores j;',
      "SELECT jsonb_build_object('jugador', j.nombre) FROM ronda_libre_jugadores j;",
      "SELECT jsonb_build_object('j', 1, 'k', j.id) FROM ronda_libre_jugadores j;",
      'SELECT j.id AS fila FROM ronda_libre_jugadores j;',
      'SELECT j.id fila, j.nombre FROM ronda_libre_jugadores j;',
      'CREATE TRIGGER t AFTER UPDATE ON public.rondas_libres FOR EACH ROW EXECUTE FUNCTION f();',
      'INSERT INTO ronda_libre_jugadores (ronda_id, nombre) VALUES (1, 2);',
    ]
    for (const caso of limpios) expect(exposicionesSinNombrarla(caso), caso).toEqual([])
  })
})
