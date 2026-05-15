import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSummary,
  readCache,
  writeCache,
} from './inbox-bootstrap.mjs';

const CACHE_PATH = '.claude/inbox-pending.json';

describe('inbox-bootstrap', () => {
  beforeEach(() => {
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
  });
  afterEach(() => {
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
  });

  describe('buildSummary', () => {
    it('emite resumen con count y 1 línea truncada por reporte', () => {
      const rows = [
        { id: '1', recibido_en: '2026-05-15T10:00:00Z', texto: 'scorer cuelga hoyo 14', caption: null, status: 'nuevo' },
        { id: '2', recibido_en: '2026-05-15T11:00:00Z', texto: null, caption: 'widget pga light mode no se ven nombres aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa muy largo', status: 'nuevo' },
      ];
      const out = buildSummary(rows);
      expect(out).toContain('2 pendientes');
      expect(out).toContain('scorer cuelga hoyo 14');
      expect(out).toMatch(/widget pga light mode no se ven nombres.{0,40}\.\.\./);
      const lines = out.split('\n');
      expect(lines.length).toBeLessThanOrEqual(6);
    });

    it('pluralización: 1 pendiente (sin "s")', () => {
      const out = buildSummary([{ id: '1', texto: 'uno solo', status: 'nuevo' }]);
      expect(out).toContain('1 pendiente en');
      expect(out).not.toContain('1 pendientes');
    });

    it('inbox vacío produce output vacío', () => {
      expect(buildSummary([])).toBe('');
      expect(buildSummary(null)).toBe('');
      expect(buildSummary(undefined)).toBe('');
    });

    it('limita a 10 líneas con sumario "... y N más" si hay >10', () => {
      const rows = Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        texto: `reporte ${i}`,
        status: 'nuevo',
      }));
      const out = buildSummary(rows);
      expect(out).toContain('15 pendientes');
      expect(out).toContain('... y 5 más');
      // Header + 10 bullets + footer
      expect(out.split('\n').length).toBe(12);
    });

    it('usa caption si texto es null', () => {
      const out = buildSummary([{ id: '1', texto: null, caption: 'solo caption', status: 'nuevo' }]);
      expect(out).toContain('solo caption');
    });

    it('fallback "(sin texto)" si ambos null', () => {
      const out = buildSummary([{ id: '1', texto: null, caption: null, status: 'nuevo' }]);
      expect(out).toContain('(sin texto)');
    });
  });

  describe('cache', () => {
    it('readCache devuelve null si no existe el archivo', () => {
      expect(readCache()).toBeNull();
    });

    it('readCache devuelve data si <5 min de antigüedad', () => {
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_PATH, JSON.stringify({
        ts: Date.now() - 60_000,
        rows: [{ id: '1', texto: 'cached', status: 'nuevo' }],
      }));
      const result = readCache();
      expect(result).not.toBeNull();
      expect(result.rows[0].texto).toBe('cached');
    });

    it('readCache devuelve null si >5 min de antigüedad', () => {
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_PATH, JSON.stringify({
        ts: Date.now() - 6 * 60_000,
        rows: [{ id: '1', texto: 'old', status: 'nuevo' }],
      }));
      expect(readCache()).toBeNull();
    });

    it('readCache devuelve null si JSON corrupto', () => {
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_PATH, 'not json');
      expect(readCache()).toBeNull();
    });

    it('writeCache persiste rows con timestamp actual', () => {
      writeCache([{ id: '1', texto: 'fresh', status: 'nuevo' }]);
      const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      expect(raw.rows).toHaveLength(1);
      expect(raw.rows[0].texto).toBe('fresh');
      expect(raw.ts).toBeGreaterThan(Date.now() - 1000);
      expect(raw.ts).toBeLessThanOrEqual(Date.now());
    });
  });
});
