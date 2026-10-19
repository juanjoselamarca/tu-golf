/**
 * scripts/lib/rama-nocturna.mjs — qué rama es de un agente nocturno. Fuente única: la usan el scheduler
 * (safety.mjs: a qué PR culpar de una caída), el detector de violaciones (failure.mjs: un agente no puede
 * trabajar fuera de su rama) y el check de CI de evidencia (scripts/ci/evidencia-pr-nocturno.mjs).
 *
 * Forma: `<prefijo>/ceo-<agente>-…` (scripts/ceo/worktree.mjs). Los reverts automáticos del scheduler son
 * `fix/ceo-revert-<N>-claude`: son nocturnos, pero los crea el scheduler, nunca un agente.
 */

// Sin distinguir mayúsculas: GitHub conserva `Fix/CEO-x` y el detector de violaciones ve el comando en
// minúsculas; si no coinciden, un agente se salta el check con solo cambiar una letra (Fable, 19-oct).
const NOCTURNA = /^(refs\/heads\/)?[\w-]+\/ceo-/i;
const REVERT = /^(refs\/heads\/)?[\w-]+\/ceo-revert-/i;

/** ¿Rama nocturna (incluye los reverts del scheduler)? */
export const esRamaNocturna = rama => NOCTURNA.test(String(rama || ''));

/** ¿Revert automático del scheduler? */
export const esRevertAutomatico = rama => REVERT.test(String(rama || ''));

/** ¿Rama en la que un agente puede trabajar? Nocturna y no un revert (esos los crea solo el scheduler). */
export const esRamaDeAgente = rama => esRamaNocturna(rama) && !esRevertAutomatico(rama);
