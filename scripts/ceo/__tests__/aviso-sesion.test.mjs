import { describe, it, expect } from 'vitest';
import { construirAviso, nocheCorrio } from '../aviso-sesion.mjs';

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
