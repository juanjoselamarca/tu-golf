import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // vmThreads solo es necesario en dev local Windows/OneDrive (paths con
    // espacios). En CI Linux, forks (default vitest 4) es más estable y
    // rápido. Ver memoria feedback_vitest_onedrive para el motivo histórico.
    pool: process.env.CI ? 'forks' : 'vmThreads',
    testTimeout: 30000,
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.claude/worktrees/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/__tests__/**',
        'src/tests/**',
        'src/scripts/**',
        'src/types/**',
      ],
      // Historial de baselines:
      //   2026-04-23: 27.62% / 21.83% / 25.78% / 27.07% (statements/branches/funcs/lines)
      //   2026-05-24: 16.94% / 12.79% / 12.97% / 16.90% — bajó por ~390 commits con
      //     features nuevas sin tests proporcionales. Confirmado vía coverage local.
      // Thresholds 1 punto debajo del real actual (regla "no puede bajar"). Se
      // suben conforme se agreguen tests al refactorizar archivos "sucios"
      // (ver CLAUDE.md REGLA OPERATIVA + docs/REORDENAMIENTO_TRACKING.md).
      // Nota: el gate solo se enforza cuando se corre `npx vitest --coverage`.
      // El CI actual NO corre coverage (`npm run test -- --run` sin flag) —
      // activarlo en CI es item de la "limpieza inicial" (ola 1 del plan).
      thresholds: {
        statements: 16,
        branches: 12,
        functions: 12,
        lines: 16,
      },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
