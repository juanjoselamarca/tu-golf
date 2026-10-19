/**
 * scripts/lib/rama-nocturna.mjs — qué rama es de un agente nocturno. Fuente única: la usan el scheduler
 * (safety.mjs: a qué PR culpar de una caída), el detector de violaciones (failure.mjs: un agente no puede
 * trabajar fuera de su rama) y el check de CI de evidencia (scripts/ci/evidencia-pr-nocturno.mjs).
 *
 * Forma: `<prefijo>/ceo-<agente>-…` (scripts/ceo/worktree.mjs). Los reverts automáticos del scheduler son
 * `fix/ceo-revert-<N>-claude`: son nocturnos, pero los crea el scheduler, nunca un agente.
 */

const NOCTURNA = /^(refs\/heads\/)?[\w-]+\/ceo-/;
const REVERT = /^(refs\/heads\/)?[\w-]+\/ceo-revert-/;

/** ¿Rama nocturna (incluye los reverts del scheduler)? */
export const esRamaNocturna = rama => NOCTURNA.test(String(rama || ''));

/** ¿Revert automático del scheduler? */
export const esRevertAutomatico = rama => REVERT.test(String(rama || ''));

/** ¿Rama en la que un agente puede trabajar? Nocturna y no un revert (esos los crea solo el scheduler). */
export const esRamaDeAgente = rama => esRamaNocturna(rama) && !esRevertAutomatico(rama);
