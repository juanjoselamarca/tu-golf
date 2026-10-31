/**
 * ¿El respaldo de hoy cubre lo que cubría ayer?
 *
 * Vive aparte de `respaldo-diario.mjs` porque ese archivo corre al importarse (top-level await), así
 * que no se puede probar: acá la lógica es pura y tiene canario propio (`cobertura.test.mjs`). Es el
 * guard que decide si un respaldo se declara completo, y un guard sin test es una promesa.
 *
 * Devuelve mensajes para `_manifiesto.json` → `errores`, NO excepciones: eso deja el día
 * `completo: false` (la retención no purga los respaldos buenos y el script avisa por Telegram) y
 * además deja que se dumpee todo el resto. Un `throw` cambiaba un hueco parcial por no tener
 * respaldo de NADA —ni `public` ni `auth`— todos los días hasta que alguien lo notara.
 */

/**
 * @param {object} p
 * @param {string[]} p.schemasExistentes  schemas de `SCHEMAS_RESPALDADOS` que EXISTEN en la base
 *   (preguntado a `pg_namespace`, no a `information_schema.schemata`, que filtra por privilegios y
 *   haría al guard tan ciego como al bug que busca). Uno que todavía no existe no es error: hasta
 *   que su migración corra no hay nada que respaldar.
 * @param {string[]} p.tablas  las tablas que se van a respaldar hoy, como `schema.tabla`.
 * @param {{ dia: string, tablas: Record<string, unknown> } | null} p.previo  manifiesto del último
 *   respaldo anterior a hoy, o null si es el primero.
 * @returns {string[]} avisos, vacío si la cobertura está igual o mejor que ayer.
 */
export function avisosDeCobertura({ schemasExistentes = [], tablas = [], previo = null }) {
  const avisos = []

  // (1) Un schema que existe pero no aportó ninguna tabla. `information_schema.tables` solo muestra
  // lo que el rol ve: si alguien dropea la tabla de respaldo, renombra el schema o `exec_sql` deja
  // de correr como su dueño, la consulta devuelve las de `public` y el respaldo se guardaría
  // completo sin ese schema adentro. Con `respaldos` eso es grave: ahí viven las copias que toma una
  // migración antes de anular datos, el ÚNICO lugar donde queda ese dato.
  for (const s of schemasExistentes) {
    if (!tablas.some(t => t.startsWith(`${s}.`))) {
      avisos.push(`el schema ${s} existe pero no aportó ninguna tabla: o quedó sin tablas, o este rol dejó de verlas. El respaldo de hoy NO cubre ese dato.`)
    }
  }

  // (2) Tablas que estaban en el último respaldo y hoy no aparecen. Sin esto el guard (1) tiene la
  // tolerancia del tamaño del error: con tres copias en `respaldos` y dos dropeadas, basta UNA para
  // que el schema "aporte tablas" y el respaldo pase verde. Un DROP a propósito (una migración que
  // limpia una copia ya devuelta a producción) avisa una sola vez: mañana el manifiesto de
  // referencia ya no la lista.
  if (previo && previo.tablas) {
    const hoy = new Set(tablas)
    const perdidas = Object.keys(previo.tablas).filter(t => !hoy.has(t))
    if (perdidas.length) {
      avisos.push(`estas tablas estaban en el respaldo del ${previo.dia} y hoy no aparecen: ${perdidas.join(', ')}. Si fue un DROP a propósito, este aviso no se repite mañana.`)
    }
  }

  return avisos
}
