/**
 * scripts/ceo/coverage.mjs — rotación de secciones auditadas por noche.
 * (Movido sin cambios de lógica desde ceo-autonomo.mjs; las rutas ahora son absolutas
 * porque los worktrees viven fuera del repo.)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Mapeo agente → IDs de secciones que puede auditar
const AGENT_SCOPE = {
  'data-quality':    ['security-input', 'security-auth', 'security-deps', 'scorer', 'torneos', 'perfil', 'coach', 'import', 'inscripcion', 'leaderboard', 'drafts', 'auth', 'billing', 'fedegolf', 'push'],
  'dead-end-hunter': ['scorer', 'torneos', 'perfil', 'coach', 'import', 'inscripcion', 'leaderboard', 'drafts', 'auth', 'billing', 'fedegolf', 'admin'],
  'qa-design':       ['scorer', 'torneos', 'perfil', 'coach', 'import', 'inscripcion', 'leaderboard', 'drafts', 'auth', 'billing', 'admin'],
  'e2e-writer':      ['scorer', 'torneos', 'perfil', 'coach', 'import', 'inscripcion', 'leaderboard', 'drafts', 'billing'],
};
const PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 };

export function createCoverage({ promptsDir, logsDir, log = () => {} }) {
  const stateFile = resolve(logsDir, 'coverage-state.json');
  const manifestFile = resolve(promptsDir, 'coverage-manifest.json');
  const loadManifest = () => { try { return JSON.parse(readFileSync(manifestFile, 'utf8')); } catch { return { sections: [] }; } };
  const loadState = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return {}; } };
  const coverageFile = (nightId, agent) => resolve(logsDir, `${nightId}-coverage-${agent}.json`);

  function assigned(agent, round) {
    const state = loadState();
    const scope = AGENT_SCOPE[agent] || [];
    const eligible = loadManifest().sections.filter(s => scope.includes(s.id));
    eligible.sort((a, b) => {
      const pa = PRIORITY[a.priority] ?? 2;
      const pb = PRIORITY[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return (state[`${agent}:${a.id}`] || '2000-01-01').localeCompare(state[`${agent}:${b.id}`] || '2000-01-01');
    });
    const offset = round >= 2 ? 3 : 0;
    return eligible.slice(offset, offset + 3);
  }

  function promptBlock({ agent, round, nightId }) {
    const sections = assigned(agent, round);
    if (sections.length === 0) return '';
    const state = loadState();
    let block = `\n## SECCIONES ASIGNADAS ESTA NOCHE — Ronda ${round}\n\n`;
    block += `Estas son las secciones que DEBES auditar en profundidad esta noche.\n`;
    block += `No elijas tú qué revisar — la rotación ya decidió por ti.\n\n`;
    for (const s of sections) {
      block += `### ${s.name} (última auditoría: ${state[`${agent}:${s.id}`] || 'NUNCA'})\n`;
      if (s.pages.length > 0) block += `- Páginas: ${s.pages.join(', ')}\n`;
      if (s.apis.length > 0) block += `- APIs: ${s.apis.join(', ')}\n`;
      if (s.tables.length > 0) block += `- Tablas: ${s.tables.join(', ')}\n`;
      block += '\n';
    }
    block += `Al terminar, escribe el archivo \`${coverageFile(nightId, agent)}\` con formato:\n`;
    block += '```json\n';
    block += `{ "sections_covered": ["${sections.map(s => s.id).join('", "')}"], "round": ${round} }\n`;
    block += '```\n';
    if (round >= 2) {
      block += `\n### RONDA 2: CONTINUIDAD\nLee los pendientes de la ronda 1 antes de empezar:\n`;
      block += '```bash\n';
      block += `cat "$CEO_LOGS"/${nightId}-pendientes-*.md 2>/dev/null\n`;
      block += `cat "$CEO_LOGS"/${nightId}-coverage-*.json 2>/dev/null\n`;
      block += '```\n';
      block += `Retoma lo que quedó pendiente Y profundiza en las nuevas secciones asignadas.\n`;
    }
    return block;
  }

  function updateAfterRun({ agent, nightId }) {
    const file = coverageFile(nightId, agent);
    if (!existsSync(file)) return;
    try {
      const coverage = JSON.parse(readFileSync(file, 'utf8'));
      const state = loadState();
      for (const id of coverage.sections_covered || []) state[`${agent}:${id}`] = nightId;
      writeFileSync(stateFile, JSON.stringify(state, null, 2));
      log(`Coverage actualizado para ${agent}: ${(coverage.sections_covered || []).join(', ')}`);
    } catch (e) {
      log(`⚠ Error leyendo coverage de ${agent}: ${e.message}`);
    }
  }

  return { promptBlock, updateAfterRun };
}
