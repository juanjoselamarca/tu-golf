import { describe, it, expect } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { construirAviso, nocheCorrio, repoPrincipal } from '../aviso-sesion.mjs';

// 17-nov-2026 15:00 hora local (el test no depende de la zona: se arma con el constructor local).
const AHORA = new Date(2026, 10, 17, 15, 0, 0).getTime();
const corrio = id => ({ nightId: id, jobs: [{ status: 'ok', attempts: [{}] }, { status: 'pending', attempts: [] }], notifications: [] });
const muerta = (id, notifications = []) => ({ nightId: id, jobs: [{ status: 'pending', attempts: [] }, { status: 'pending', attempts: [] }], notifications });

describe('aviso de sesión de los agentes nocturnos', () => {
  it('silencio si las últimas noches corrieron', () => {
    const nights = ['2026-11-15', '2026-11-16', '2026-11-17'].map(corrio);
    expect(construirAviso({ nights, now: AHORA, pausa: false })).toBe('');
  });

  it('reproduce el 15→17-nov: dos noches sin agentes, la de hoy sin abrir y P0 sin enviar', () => {
    const p0 = { kind: 'p0', sent: false, at: '2026-11-16T03:03:00Z', text: '🚨 CEO Autónomo: el CLI de Claude no respondió al leer el cupo (exit null). La noche no corre.' };
    const nights = [corrio('2026-11-14'), muerta('2026-11-15'), muerta('2026-11-16', [p0, { kind: 'info', sent: false, at: 'x', text: 'info' }])];
    const aviso = construirAviso({ nights, now: AHORA, pausa: false });
    expect(aviso).toContain('la noche 2026-11-17 no abrió');
    expect(aviso).toContain('las noches 2026-11-15, 2026-11-16 no corrieron');
    expect(aviso).toContain('1 alerta(s) P0');
    expect(aviso).toContain('el CLI de Claude no respondió');
  });

  it('antes de las 08:00 no exige la noche de hoy (puede estar corriendo)', () => {
    const temprano = new Date(2026, 10, 17, 3, 0, 0).getTime();
    const nights = [corrio('2026-11-15'), corrio('2026-11-16')];
    expect(construirAviso({ nights, now: temprano, pausa: false })).toBe('');
  });

  it('una noche reintentada (-2) cuenta como la noche de ese día', () => {
    const nights = [corrio('2026-11-15'), corrio('2026-11-16'), corrio('2026-11-17-2')];
    expect(construirAviso({ nights, now: AHORA, pausa: false })).toBe('');
  });

  it('ignora noches viejas fuera de la ventana', () => {
    const nights = [muerta('2026-11-01'), corrio('2026-11-15'), corrio('2026-11-16'), corrio('2026-11-17')];
    expect(construirAviso({ nights, now: AHORA, pausa: false })).toBe('');
  });

  it('con PAUSE avisa la pausa y nada más', () => {
    expect(construirAviso({ nights: [], now: AHORA, pausa: true })).toMatch(/PAUSE/);
  });

  it('nocheCorrio: basta un intento en cualquier trabajo', () => {
    expect(nocheCorrio(muerta('x'))).toBe(false);
    expect(nocheCorrio(corrio('x'))).toBe(true);
    expect(nocheCorrio({ nightId: 'x' })).toBe(false);
  });
});

describe('repoPrincipal: las noches se leen del repo principal, no del worktree', () => {
  it('desde un worktree devuelve la carpeta del repo principal (antes: «la noche no abrió» falso)', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'aviso-wt-')));
    // Sin GIT_DIR heredado de un hook de git: apuntaría al repo real.
    const env = { ...process.env }; delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_INDEX_FILE;
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, stdio: 'ignore' });
    try {
      const principal = join(base, 'principal');
      git(base, 'init', '-q', principal);
      git(principal, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
      git(principal, 'worktree', 'add', '-q', join(principal, 'wt'));
      const norm = p => p.replace(/\\/g, '/').toLowerCase();
      expect(norm(repoPrincipal(join(principal, 'wt')))).toBe(norm(principal));
      expect(norm(repoPrincipal(principal))).toBe(norm(principal));
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('sin repo de git, se queda con la carpeta dada', () => {
    const base = mkdtempSync(join(tmpdir(), 'aviso-nogit-'));
    try { expect(repoPrincipal(base)).toBe(base); } finally { rmSync(base, { recursive: true, force: true }); }
  });
});
