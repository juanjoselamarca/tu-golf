/**
 * Columnas por tabla de supabase/schema.sql, con el formato que escribe generarDDL (scripts/test-db/sync-schema.mjs):
 * `create [unlogged ]table public."t" (`, una columna por línea (`  "col" tipo`) y `)[ with (...)];`. Los constraints
 * van aparte, en ALTER TABLE. Lanza si no lee todas las tablas: un formato nuevo no puede dejar pasar todo en silencio.
 */
export function columnasPorTabla(sql) {
  const texto = sql.replace(/\r\n/g, '\n')
  const out = new Map()
  for (const [, tabla, cuerpo] of texto.matchAll(/^create (?:unlogged )?table public\."([^"]+)" \(\n([\s\S]*?)\n\)(?: with \([^\n]*\))?;$/gm)) {
    out.set(tabla, new Set([...cuerpo.matchAll(/^ {2}"([^"]+)"/gm)].map(m => m[1])))
  }
  const declaradas = texto.match(/^create (?:unlogged )?table public\."/gm)?.length ?? 0
  if (out.size === 0 || out.size !== declaradas) {
    throw new Error(`supabase/schema.sql: se leyeron ${out.size} de ${declaradas} tablas; cambió el formato de generarDDL`)
  }
  return out
}
