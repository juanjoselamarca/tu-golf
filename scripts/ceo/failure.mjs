/**
 * scripts/ceo/failure.mjs — clasifica cómo terminó un intento de agente
 * y detecta violaciones de reglas en su stream.
 *
 * El escáner es DETECCIÓN de formas conocidas (léxico, comando por comando), no un candado completo: detiene en
 * el acto lo que reconoce y nada más. No ve lo que hace un script que el agente escribió y después corre, un cuerpo
 * escrito en un paso anterior, ni pipelines de objetos de PowerShell (docs/claude/escaner-nocturno-limites.md).
 * El control duro es server-side: el check de zona crítica, "Migraciones mergeadas intactas" y la aprobación
 * humana del workflow migraciones-prod; las etiquetas solo se ponen en el PR y quedan en su timeline.
 *
 * Forma real de una falla por límite (log 2026-09-29-0530-e2e-writer.log):
 *   {"type":"result","subtype":"success","is_error":true,
 *    "result":"You've hit your limit · resets 10am (America/Santiago)", "num_turns":1, ...}
 * OJO: subtype es "success" aunque falló. Nunca clasificar por subtype.
 */

import { parseQuota, windowExhausted } from './quota.mjs';
import { esRamaDeAgente } from '../lib/rama-nocturna.mjs';
import { PREFIJO_ETIQUETA } from '../lib/nombre-migracion.mjs';

const LIMIT_TEXT = /hit your limit|usage limit|rate limit reached|limit reached/i;

function parseLines(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { out.push(JSON.parse(t)); } catch { /* línea parcial */ }
  }
  return out;
}

/**
 * → { kind: 'ok'|'limit_five'|'limit_seven'|'timeout'|'cut_budget'|'cut_loop'|'real', resetsAt, numTurns, sessionId, resultText }
 * `cut` = el runner cortó la sesión por presupuesto o por vueltas en círculo (budget.mjs, loops.mjs).
 */
export function classifyAttempt({ output, code, killed, cut }) {
  const events = parseLines(output);
  const result = [...events].reverse().find(e => e.type === 'result');
  const init = events.find(e => e.type === 'system' && e.subtype === 'init');
  const quota = parseQuota(output);
  const numTurns = result?.num_turns ?? 0;
  const resultText = typeof result?.result === 'string' ? result.result : '';
  const base = { numTurns, sessionId: init?.session_id ?? result?.session_id ?? null, resultText: resultText.slice(0, 300), quota };

  if (killed) return { ...base, kind: 'timeout', resetsAt: null };
  if (cut) return { ...base, kind: cut === 'bucle' ? 'cut_loop' : 'cut_budget', resetsAt: null };

  const limitByText = result?.is_error === true && LIMIT_TEXT.test(resultText);
  const sevenOut = windowExhausted(quota.seven);
  const fiveOut = windowExhausted(quota.five);

  if (limitByText || ((sevenOut || fiveOut) && code !== 0)) {
    if (sevenOut) return { ...base, kind: 'limit_seven', resetsAt: quota.seven.resetsAt };
    return { ...base, kind: 'limit_five', resetsAt: quota.five.resetsAt };
  }

  if (code === 0 && result && result.is_error !== true) return { ...base, kind: 'ok', resetsAt: null };
  return { ...base, kind: 'real', resetsAt: null };
}

/** Uso de herramientas del agente (de los tool_use del stream) → [{ tool, input }]. */
function toolUses(output) {
  const out = [];
  for (const ev of parseLines(output)) {
    const content = ev?.message?.content;
    if (ev.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const c of content) if (c?.type === 'tool_use') out.push({ tool: c.name, input: c.input || {} });
  }
  return out;
}

export function bashCommands(output) {
  return toolUses(output).map(t => t.input.command).filter(c => typeof c === 'string');
}

const norm = s => String(s).replace(/\\/g, '/').toLowerCase();

const MASK = '\u0000';
// Cuerpo de heredoc: desde <<TERM hasta la línea del terminador (lo que viene después
// del terminador SÍ se revisa). Si no hay terminador, hasta el final.
const HEREDOC = /<<-?\s*['"]?(\w+)['"]?[^\n]*(?:\n[\s\S]*?\n\s*\1\s*(?=\n|$)|[\s\S]*$)/g;
const QUOTED = /'[^']*'|"(?:\\.|[^"\\])*"/g;
const SEPARATORS = /;|&&|\|\||\||\n/;
const PLACEHOLDER = new RegExp(`${MASK}(\\d+)${MASK}`, 'g');
// Comentario de Bash o PowerShell: `#` al comienzo de una palabra, hasta el fin de la línea (lo entrecomillado ya
// está enmascarado). Se quita ANTES de unir líneas continuadas: una barra al final de un comentario no continúa nada.
const COMENTARIO = /(^|[ \t;&|])#[^\n]*/gm;
// Línea continuada: barra invertida + salto en Bash, backtick + salto en PowerShell.
const CONTINUACION_SH = /\\\r?\n/g;
const CONTINUACION_PS = /`\r?\n/g;

/**
 * Divide un comando en segmentos (; && || | salto de línea), sin cuerpos de heredoc.
 * Cada segmento tiene dos vistas:
 *   bare — lo entrecomillado vaciado: para flags y estructura. Así
 *          `git commit -m "no usar --no-verify"` no dispara el candado (falso
 *          positivo que mataba agentes legítimos — hallazgo Fable 01-oct).
 *   full — con el contenido de las comillas: para valores (label, ruta, URL).
 *   tokens — palabras del comando; lo entrecomillado es UNA palabra (un `-m "no hacer push"` no aporta
 *          la palabra `push`) y las redirecciones (`2>&1`, `> log`) no cuentan. Para leer argumentos.
 */
export function commandSegments(cmd, tool = 'Bash') {
  const quoted = [];
  const masked = String(cmd).replace(HEREDOC, '').replace(QUOTED, (m) => {
    quoted.push(m.slice(1, -1));
    return `${MASK}${quoted.length - 1}${MASK}`;
  }).replace(COMENTARIO, '$1').replace(tool === 'PowerShell' ? CONTINUACION_PS : CONTINUACION_SH, ' ');
  const unmask = s => norm(s.replace(PLACEHOLDER, (_, i) => quoted[Number(i)]));
  return masked.split(SEPARATORS).map(x => x.trim()).filter(Boolean).map(seg => {
    const palabras = sinEntorno(seg.split(/\s+/));
    return {
      bare: norm(palabras.join(' ').replace(PLACEHOLDER, '""')),
      full: unmask(palabras.join(' ')),
      tokens: sinRedirecciones(palabras).map(unmask),
    };
  }).filter(s => s.bare);
}

const ASIGNACION = /^[a-z_][a-z0-9_]*=/i;
/**
 * Quita lo que va delante del comando sin cambiarlo: `env` (con sus opciones) y las asignaciones `VAR=v`.
 * Lo aplica commandSegments a todo segmento, así cada regla ve `env git push --no-verify` como `git push --no-verify`.
 */
export function sinEntorno(palabras) {
  let i = 0;
  while (i < palabras.length) {
    if (/^env$/i.test(palabras[i])) { i++; while (i < palabras.length && palabras[i].startsWith('-')) i++; continue; }
    if (ASIGNACION.test(palabras[i])) { i++; continue; }
    break;
  }
  return palabras.slice(i);
}

// `>`, `>>`, `2>`, `&>`, `<` sueltos (el destino es la palabra siguiente) o pegados (`2>&1`, `>log`).
const REDIR_SOLA = /^(\d*|&)(>>?|<)$/;
const REDIR_PEGADA = /^(\d*|&)(>>?|<)/;
function sinRedirecciones(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (REDIR_SOLA.test(words[i])) { i++; continue; }
    if (REDIR_PEGADA.test(words[i])) continue;
    out.push(words[i]);
  }
  return out;
}

// Archivos que definen los guards del CI (zona crítica, evidencia de revisión, migraciones mergeadas intactas, el
// job obligatorio de verificación y el db push a prod): un agente que los edita se los salta. Todos están también en
// .github/critical-zone-paths.txt (lo vigila guard-etiquetas.test.mjs). En minúsculas: se comparan contra norm().
export const GUARD_FILES = [
  '.github/workflows/critical-zone-guard.yml', '.github/critical-zone-paths.txt',
  '.github/workflows/evidencia-pr-nocturno.yml', 'scripts/ci/evidencia-pr-nocturno.mjs', 'scripts/lib/rama-nocturna.mjs',
  '.github/workflows/migraciones-inmutables.yml', 'scripts/ci/migraciones-inmutables.mjs',
  'scripts/lib/nombre-migracion.mjs', '.github/workflows/ci.yml', '.github/workflows/migraciones-prod.yml',
];
// Etiquetas que apagan un guard y solo pone un humano: fable-reviewed (tras el review de Fable) y la salida del
// check de migraciones (PREFIJO_ETIQUETA). Se juzga cada VALOR de etiqueta, no el comando entero.
// Valor centinela: la llamada pone etiquetas pero su valor no se ve (cuerpo en un archivo, IDs de graphql).
export const ETIQUETA_SIN_VER = '\u0000sin-ver';
const ETIQUETAS_DE_HUMANO = [
  [v => v === 'fable-reviewed', 'auto-label-fable'],
  [v => v.startsWith(PREFIJO_ETIQUETA), 'auto-label-migracion'],
  [v => v === ETIQUETA_SIN_VER, 'etiqueta-sin-ver'],
];
/**
 * Único lector de flags: todos los valores de las flags `nombres` en `args`, en todas sus formas: `--f v`,
 * `--f=v`, corta pegada (`-lv`) y cortas agrupadas (`-dl v`, `-dlv`: la primera letra que lleva valor se queda
 * con el resto). Los args vienen en minúsculas (norm), así que `-F` se lee como `-f`.
 */
function valoresDe(args, nombres) {
  const out = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (nombres.includes(a)) { if (k + 1 < args.length) out.push(args[++k]); continue; }
    const larga = nombres.find(n => n.startsWith('--') && a.startsWith(`${n}=`));
    if (larga) { out.push(a.slice(larga.length + 1)); continue; }
    if (!/^-[a-z]/.test(a)) continue;
    for (const n of nombres.filter(x => /^-[a-z]$/.test(x))) {
      const m = a.match(new RegExp(`^-[a-z]*?${n[1]}(.*)$`));
      if (!m) continue;
      if (m[1]) out.push(m[1]);
      else if (k + 1 < args.length) out.push(args[++k]);
      break;
    }
  }
  return out;
}
const valorDe = (args, nombres) => valoresDe(args, nombres)[0] ?? null;

// Campos de `gh api` (`-F` se ve como `-f`). Método: el explícito; sin él, gh usa POST si hay campos o --input.
const CAMPOS = ['-f', '--field', '--raw-field'];
const conInputDe = args => args.some(a => a === '--input' || a.startsWith('--input='));
const metodoHttp = args => valorDe(args, ['-x', '--method']);
/** ¿Esta llamada `gh api` (args tras `api`) escribe? Lo usan las reglas de etiquetas, ramas y protección de main. */
function apiEscribe(args) {
  const m = metodoHttp(args);
  if (m) return !/^(get|head)$/.test(m);
  return conInputDe(args) || valoresDe(args, CAMPOS).length > 0;
}

// Rutas REST que ponen etiquetas: crear un issue, editarlo (también un PR: es un issue) o su lista de etiquetas.
const RUTA_DE_ETIQUETAS = /(^|\/)repos\/[^/]+\/[^/]+\/issues(\/\d+(\/labels)?)?\/?(\?.*)?$/;
const ES_GRAPHQL = /^(\/?|https?:\/\/api\.github\.com\/)graphql$/;
const MUTACION_DE_ETIQUETAS = /\b(addlabelstolabelable|labelids)\b/;
/**
 * Etiquetas que pone un comando `gh` (tokens de commandSegments, ya en minúsculas y sin env/VAR=):
 * `gh pr|issue edit --add-label`, `gh pr|issue create|new --label/-l` (valores separados por coma) y `gh api` que
 * escribe con campos `labels…=v`. Con `gh api --input` se juzga por la RUTA: si pone etiquetas y el cuerpo se ve en
 * `texto` (el comando completo, con heredocs), cada palabra del cuerpo; si no se ve, ETIQUETA_SIN_VER. En graphql
 * las etiquetas van por ID: una mutation de etiquetas, o un cuerpo que no se ve, también es ETIQUETA_SIN_VER.
 */
export function etiquetasQuePone(tokens, texto = tokens.join(' ')) {
  const t = sinEntorno(tokens);
  if (t[0] !== 'gh') return [];
  let valores = [];
  if ((t[1] === 'pr' || t[1] === 'issue') && t[2] === 'edit') valores = valoresDe(t, ['--add-label']);
  else if ((t[1] === 'pr' || t[1] === 'issue') && (t[2] === 'create' || t[2] === 'new')) valores = valoresDe(t, ['--label', '-l']);
  else if (t[1] === 'api') {
    const args = t.slice(2);
    if (!apiEscribe(args)) return [];
    if (args.some(a => ES_GRAPHQL.test(a))) {
      if (MUTACION_DE_ETIQUETAS.test(texto)) return [ETIQUETA_SIN_VER];
      // Query desde un archivo (`--input f`, `-F query=@f`): no se ve. Falla cerrado; la forma visible es `-f query='…'`.
      return conInputDe(args) || args.some(a => /query=@/.test(a)) ? [ETIQUETA_SIN_VER] : [];
    }
    if (conInputDe(args)) {
      if (!args.some(a => RUTA_DE_ETIQUETAS.test(a))) return [];
      if (/"labels"\s*:/.test(texto)) return texto.match(/[a-z0-9:_.-]+/g) ?? [];
      return /\{|<</.test(texto) ? [] : [ETIQUETA_SIN_VER]; // cuerpo visible (JSON o heredoc) sin etiquetas
    }
    valores = valoresDe(args, CAMPOS).filter(v => v.startsWith('labels')).map(v => v.slice(v.indexOf('=') + 1));
  }
  return valores.flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean);
}
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const IS_GIT = /^git\b/; // commandSegments ya quitó env y VAR=
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Escribir un guard: un comando que modifica archivos, o un intérprete con código en línea o por stdin
// (`perl -pi -e`, `node --input-type=module -e`, `python -`). `node scripts/ci/…mjs` solo lo CORRE (validar la
// descripción del PR antes de pushear es el uso normal), y leerlo no es editarlo. Los agentes nocturnos tienen también
// la herramienta PowerShell (runner.mjs no restringe --tools y toolUses lee `command` de cualquier herramienta): sus
// cmdlets, alias y [IO.File]:: de escritura cuentan igual. Las rutas con `\` ya llegan como `/` (norm).
// Los cmdlets y alias de PowerShell cuentan solo en posición de comando (inicio del segmento, dentro de `{`/`(` o
// tras `&`): `grep -c copy archivo` no es un Copy-Item.
const GUARD_EDIT = new RegExp([
  /(^|\s)(sed\s+-i|tee|cp|mv|rm|truncate|git\s+(rm|mv|checkout|restore|apply))\b/.source,
  /(^|[{(]\s*|&\s*)(set-content|add-content|clear-content|out-file|new-item|remove-item|move-item|copy-item|rename-item|del|erase|ren|copy|move|ni|sc|ac|ri|rd|rmdir|cpi|mi|rni|clc)(?=\s|$|[;)}])/.source,
  /(^|[\s(\]=])\[(system\.)?io\.file\]::/.source,
  /(^|\s)(node|perl|python3?|deno|bun)\b.*\s(-[a-z]*[ecp][a-z]*|--eval|--print|-)(\s|$)/.source,
].join('|'));
// Variables asignadas en el mismo comando (`$p = 'ruta'` en PowerShell, `p=ruta` en Bash): se expanden antes de
// buscar guards y etiquetas, así `$p='…ci.yml'; Remove-Item $p` se lee con la ruta.
const ASIGNACION_DE_VARIABLE = /(?:^|[\s;&|(])\$?([a-z_]\w*)\s*=\s*(?:'([^']*)'|"([^"$`]*)"|([^\s;&|'"`$]+))/gi;
export function expandirVariables(cmd) {
  const vars = new Map();
  for (const m of String(cmd).matchAll(ASIGNACION_DE_VARIABLE)) vars.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]);
  if (!vars.size) return String(cmd);
  return String(cmd).replace(/\$\{?([a-z_]\w*)\}?/gi, (all, n) => (vars.has(n.toLowerCase()) ? vars.get(n.toLowerCase()) : all));
}
// Un intérprete que recibe su código por heredoc: el cuerpo (que commandSegments descarta) nombra al guard.
const INTERPRETE_CON_HEREDOC = /(^|[\s;&|(])(node|perl|python3?|deno|bun|bash|sh)\b[^\n]*<</;
// Redirigir HACIA un guard (`> archivo`); redirigir la salida de un grep sobre él a otro archivo no lo toca.
const GUARD_REDIRECT = new RegExp(`>\\s*\\S*(${GUARD_FILES.map(escapeRe).join('|')})`);

/**
 * Rama fuera de la noche: un agente que crea, renombra, se cambia a o empuja una rama sin `/ceo-` (o un
 * revert, que solo crea el scheduler) esquiva el check de evidencia de revisión, que se aplica por nombre de
 * rama. Como todo camino a otra rama pasa por acá, `git push origin HEAD` es siempre la rama del agente.
 * `tokens` de commandSegments (minúsculas; lo entrecomillado es una palabra).
 * → nombre (P0) | { aviso: nombre } (solo aviso: volver a main/master/develop es parte del flujo normal) | null.
 */
export function ramaFueraDeLaNoche(tokens) {
  const t = sinEntorno(tokens);
  if (t[0] === 'git') {
    let i = 1;
    while (i < t.length && t[i].startsWith('-')) i += GIT_GLOBAL_CON_VALOR.has(t[i]) ? 2 : 1;
    return ramaGit(t[i], t.slice(i + 1));
  }
  if (t[0] === 'gh' && t[1] === 'pr' && t[2] === 'create') {
    const head = valorDe(t.slice(3), ['--head', '-h']);
    return head ? fuera(head.replace(/^[\w-]+:/, '')) : null;
  }
  if (t[0] === 'gh' && t[1] === 'api') return ramaPorApi(t.slice(2));
  return null;
}

const fuera = rama => (rama && !esRamaDeAgente(rama) ? rama : null);
const GIT_GLOBAL_CON_VALOR = new Set(['-c', '--git-dir', '--work-tree', '--namespace']); // -C se ve como -c
// Opciones que llevan valor por subcomando (en minúsculas: -B/-C/-M/-D se ven como -b/-c/-m/-d).
const CON_VALOR = {
  checkout: ['-b', '-c', '--orphan'], switch: ['-b', '-c', '--orphan'], worktree: ['-b', '--reason'],
  push: ['-o', '--push-option', '--repo', '--receive-pack', '--exec'],
  branch: ['-u', '--set-upstream-to', '--format', '--sort', '--contains', '--merged', '--no-merged', '--points-at'],
};
// `git branch` que no crea ni renombra (listar, borrar, upstream).
const BRANCH_SIN_CREAR = new Set(['-d', '--delete', '--list', '-l', '-r', '--remotes', '-a', '--all', '--show-current',
  '-v', '-vv', '--verbose', '-u', '--set-upstream-to', '--unset-upstream', '--contains', '--merged', '--no-merged', '--points-at']);
// A dónde un agente puede pararse: su rama, un commit suelto o una rama remota (quedan sin rama: no se empujan con HEAD).
const refLibre = r => esRamaDeAgente(r) || /^[0-9a-f]{7,40}$/.test(r) || /^(head|@)([~^]\d*)*$/.test(r) || r === '-' || r.startsWith('origin/');
// `git checkout <x>` es ambiguo (rama o archivo): solo se juzga lo que tiene forma de rama del repo.
// `docs/` y `e2e/` también son carpetas (`git checkout docs/claude` restaura archivos): de esos prefijos solo
// cuenta lo que termina en sufijo de operador, como las ramas de día que ya existen en origin.
const FORMA_DE_RAMA = /^(main|master|develop|(feat|fix|chore|refactor|test|perf|ci|hotfix|release|style|build|revert)\/[^.]+|(docs|e2e)\/[^.]+-(juanjo|max|claude))$/;
// Volver a la rama base es parte del flujo (e2e-writer parte de main) y no se puede empujar: la protección
// de main exige checks con enforce_admins, así que un push directo se rechaza. Solo aviso.
const RAMA_BASE = /^(main|master|develop)$/;

function posicionales(args, conValor = []) {
  const out = [];
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--') break;
    if (args[k].startsWith('-')) { if (conValor.includes(args[k])) k++; continue; }
    out.push(args[k]);
  }
  return out;
}

function ramaGit(sub, args) {
  const pos = posicionales(args, CON_VALOR[sub]);
  if (sub === 'checkout' || sub === 'switch') {
    const nueva = valorDe(args, ['-b', '-c', '--orphan']);
    if (nueva) return fuera(nueva);
    if (args.includes('--') || pos.length !== 1) return null;
    // --track origin/x crea la rama local x.
    const track = args.some(a => a === '-t' || a.startsWith('--track'));
    const destino = track ? pos[0].replace(/^origin\//, '') : pos[0];
    if (RAMA_BASE.test(destino)) return { aviso: destino };
    if (track) return fuera(destino);
    if (refLibre(destino)) return null;
    return sub === 'switch' || FORMA_DE_RAMA.test(destino) ? destino : null;
  }
  if (sub === 'branch') {
    if (args.some(a => BRANCH_SIN_CREAR.has(a))) return null;
    // -m/-c (renombrar/copiar): el nombre nuevo es el último; si no, el primero es la rama que se crea.
    const nombre = args.some(a => ['-m', '--move', '-c', '--copy'].includes(a)) ? pos.at(-1) : pos[0];
    return fuera(nombre);
  }
  if (sub === 'worktree' && pos[0] === 'add') {
    const nueva = valorDe(args, ['-b']);
    if (nueva) return fuera(nueva);
    if (pos[2] && RAMA_BASE.test(pos[2])) return { aviso: pos[2] };
    if (pos[2]) return refLibre(pos[2]) ? null : pos[2];
    // Sin rama ni --detach, git crea una con el nombre de la carpeta.
    if (!pos[1] || args.some(a => a === '-d' || a === '--detach')) return null;
    return fuera(pos[1].split(/[\\/]/).filter(Boolean).pop());
  }
  if (sub === 'push') {
    if (args.some(a => a === '--all' || a === '--mirror' || a === '--branches')) return '--all';
    // Primer posicional = remoto; el resto son refspecs (o nombres a borrar con --delete).
    for (const spec of pos.slice(1)) {
      const dest = spec.replace(/^\+/, '').split(':').pop();
      if (!dest || dest === 'head' || dest.startsWith('refs/tags/')) continue;
      // `$(git branch --show-current)` o `$BRANCH` no se pueden juzgar acá: lo prescrito es `origin HEAD`.
      if (dest.includes('$')) return { aviso: dest };
      if (fuera(dest)) return dest;
    }
  }
  return null;
}

// Por la API de GitHub también se crea una rama, se commitea y se abre un PR sin `git push`.
const CAMPO_PEGADO = /^(--field=|--raw-field=|-f(?!$))/;
const MUTACION_DE_RAMA = /\b(createref|updateref|updaterefs|createpullrequest|createcommitonbranch|mergebranch)\b/;
// Lo que crea o mueve una rama por REST; con --input el cuerpo viene de un archivo que no se ve.
const RUTA_DE_RAMA = /\/git\/refs\/?$|\/contents\/|\/pulls\/?$|\/merges\/?$|\/branches\/[^/]+\/rename/;
function ramaPorApi(args) {
  const ruta = args.find(a => /(^\/?|api\.github\.com\/)repos\//.test(a)) || '';
  const conInput = conInputDe(args);
  if (args.some(a => /^(\/?|https?:\/\/api\.github\.com\/)graphql$/.test(a))) {
    if (args.some(a => MUTACION_DE_RAMA.test(a))) return 'rama desconocida (graphql)';
    // La query viene de un archivo: puede ser una lectura legítima, pero no se ve.
    return conInput || args.some(a => /query=@/.test(a)) ? { aviso: 'graphql desde archivo' } : null;
  }
  if (!apiEscribe(args)) return null;
  if (/\/pulls\/\d+\/merge/.test(ruta)) return null; // lo cubre merge-api
  const valor = clave => {
    for (let k = 0; k < args.length; k++) {
      const campo = CAMPOS.includes(args[k]) ? args[k + 1] ?? '' : args[k].replace(CAMPO_PEGADO, '');
      if (campo !== args[k] && campo.startsWith(`${clave}=`)) return campo.slice(clave.length + 1);
    }
    return null;
  };
  const enRuta = ruta.match(/\/git\/refs\/heads\/(.+)$/)?.[1];
  if (enRuta) return fuera(enRuta);
  if (conInput && RUTA_DE_RAMA.test(ruta)) return 'rama desconocida (gh api --input)';
  if (/\/git\/refs\/?$/.test(ruta)) {
    const ref = valor('ref');
    if (!ref) return 'rama desconocida (gh api git/refs)';
    return ref.startsWith('refs/tags/') ? null : fuera(ref);
  }
  if (/\/contents\//.test(ruta)) return fuera(valor('branch') || 'main'); // sin branch = la rama por defecto
  if (/\/pulls\/?$/.test(ruta)) return fuera((valor('head') || '').replace(/^[\w-]+:/, ''));
  if (/\/merges\/?$/.test(ruta)) return fuera(valor('base'));
  if (/\/branches\/[^/]+\/rename/.test(ruta)) return fuera(valor('new_name'));
  return null;
}

/**
 * Violaciones de reglas nocturnas. Puro: recibe el texto y la raíz del repo.
 * → [{ rule, severity: 'p0'|'warn', detail }]
 */
export function scanViolations(output, { repoRoot }) {
  const v = [];
  const add = (rule, detail) => v.push({ rule, severity: 'p0', detail: String(detail).slice(0, 200) });
  const mainEnv = `${norm(repoRoot)}/.env.local`;
  const uses = toolUses(output);
  let pushes = 0;

  for (const { tool, input } of uses) {
    if (typeof input.command !== 'string') continue;
    const cmd = expandirVariables(input.command);
    // La ruta exacta del .env.local principal (donde sigue el token que se le quitó).
    if (norm(cmd).includes(mainEnv)) add('env-principal', cmd);
    if (INTERPRETE_CON_HEREDOC.test(norm(cmd)) && GUARD_FILES.some(g => norm(cmd).includes(g))) add('guard-editado', cmd);

    for (const { bare, full, tokens } of commandSegments(cmd, tool)) {
      const git = IS_GIT.test(bare);
      const ghApi = /^gh\s+api\b/.test(bare);
      if (git && /\bpush\b/.test(bare)) pushes++;
      if (git && /\b(push|commit)\b/.test(bare) && /(^|\s)--no-verify(\s|$)/.test(bare)) add('no-verify', cmd);
      if (/^gh\s+pr\s+merge\b/.test(bare) && /(^|\s)--admin(\s|$)/.test(bare)) add('merge-admin', cmd);
      // Merge por API: se salta `gh pr merge` y sus flags.
      if (ghApi && (/pulls\/\d+\/merge/.test(full) || /\bmergepullrequest\b/.test(full))) add('merge-api', cmd);
      // Esas etiquetas las pone un humano; si el agente se las pone, anula el guard.
      // `texto`: el comando completo, con el cuerpo de un heredoc (para `gh api --input -`).
      const valores = etiquetasQuePone(tokens, norm(cmd));
      for (const [esDeHumano, regla] of ETIQUETAS_DE_HUMANO) if (valores.some(esDeHumano)) add(regla, cmd);
      if (ghApi && /branches\/main\/protection|\/rulesets/.test(full) && apiEscribe(tokens.slice(2))) add('branch-protection', cmd);
      if (/^(npx\s+)?supabase\s+(db\s+push|db\s+reset|migration\s+up)/.test(bare)
        || (/^(curl|wget|node|python)\b/.test(bare) && /api\.supabase\.com\/v1\/projects\/\S+\/database\/query/.test(full))) add('sql-directo', cmd);
      if ((GUARD_FILES.some(g => full.includes(g)) && GUARD_EDIT.test(bare)) || GUARD_REDIRECT.test(full)) add('guard-editado', cmd);
      const rama = ramaFueraDeLaNoche(tokens);
      if (rama?.aviso) {
        v.push({ rule: 'rama-a-revisar', severity: 'warn', detail: `${rama.aviso ?? rama}: ${cmd}`.slice(0, 200) });
      } else if (rama) add('rama-fuera-de-la-noche', `${rama}: ${cmd}`);
    }
  }

  for (const { tool, input } of uses) {
    const p = input.file_path || input.path || input.notebook_path;
    if (typeof p !== 'string') continue;
    const np = norm(p);
    if (np === mainEnv) add('env-principal', p);
    if (WRITE_TOOLS.has(tool) && GUARD_FILES.some(g => np.endsWith(g))) add('guard-editado', p);
  }

  // Aviso (no P0): la regla es 3 ciclos por PR; 9 push ≈ 3 PRs al límite en una sesión.
  if (pushes > 9) v.push({ rule: 'bucle-push', severity: 'warn', detail: `${pushes} git push en una sesión` });
  return v;
}

/** Detección incremental: ¿esta línea del stream es una violación P0? (para matar en caliente) */
export function lineViolation(line, { repoRoot }) {
  if (!line.includes('"tool_use"')) return null;
  const found = scanViolations(line, { repoRoot }).filter(x => x.severity === 'p0');
  return found[0] || null;
}
