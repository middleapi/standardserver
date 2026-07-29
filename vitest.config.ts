import codspeedPlugin from '@codspeed/vitest-plugin'
import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  plugins: [codspeedPlugin()],
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    exclude: [...defaultExclude, '**/.claude/**', './packages/bun/**', './packages/deno/**'],
    coverage: {
      include: ['packages/*/src/**'],
      exclude: ['**.test-d.*', '**.test.*', '**/*.bench.ts', './packages/bun/**', './packages/deno/**'],
    },
    benchmark: {
      include: ['**/*.bench.ts'],
      exclude: [...defaultExclude, '**/.claude/**'],
    },
  },
}))
