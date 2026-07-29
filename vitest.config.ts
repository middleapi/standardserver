import codspeedPlugin from '@codspeed/vitest-plugin'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  plugins: [codspeedPlugin()],
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    // bun/deno packages run e2e tests on their own runtimes, not vitest
    exclude: [...configDefaults.exclude, 'packages/bun/**', 'packages/deno/**'],
    coverage: {
      include: ['packages/*/src/**'],
      exclude: ['**.test-d.*', '**.test.*', '**/*.bench.ts'],
    },
    benchmark: {
      include: ['**/*.bench.ts'],
    },
  },
}))
