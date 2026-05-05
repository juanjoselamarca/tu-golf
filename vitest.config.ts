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
      // Baseline 2026-04-23 (recalibrado): el primer baseline medía 77% pero
      // subestimaba — no recogía archivos sin tests. Con vi.mock de supabase
      // el coverage-v8 descubrió todo el árbol src/ real. Baseline real:
      //   Statements: 27.62%  Branches: 21.83%  Functions: 25.78%  Lines: 27.07%
      // Thresholds 2 puntos debajo del baseline — bloquean regresión sin
      // forzar fixes inmediatos. Política: subir 2 puntos cada vez que se
      // agregue cobertura a un archivo al 0%. Ver docs/audits/2026-04-23-
      // coverage-baseline.md (actualizado con números reales).
      thresholds: {
        statements: 25,
        branches: 20,
        functions: 23,
        lines: 25,
      },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
