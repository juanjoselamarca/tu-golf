import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'vmThreads',
    testTimeout: 30000,
    exclude: ['**/node_modules/**', '**/e2e/**'],
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
      // Baseline 2026-04-23: 76.88% statements, 72.41% branches, 83.32% functions, 78.64% lines.
      // Thresholds fijados conservadoramente debajo del baseline — bloquean regresión.
      // Subir gradualmente a medida que se agregan tests.
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 75,
        lines: 70,
      },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
