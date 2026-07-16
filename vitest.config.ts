import codspeedPlugin from '@codspeed/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  plugins: [codspeedPlugin()],
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    coverage: {
      include: ['packages/*/src/**'],
      exclude: ['**.test-d.*', '**.test.*', '**/*.bench.ts'],
    },
    benchmark: {
      include: ['**/*.bench.ts'],
    },
  },
}))
