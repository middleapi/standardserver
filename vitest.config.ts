import codspeedPlugin from '@codspeed/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  test: {
    coverage: {
      include: ['packages/*/src/**'],
      exclude: ['**.test-d.*', '**.test.*', '**/*.bench.ts'],
    },
    projects: [
      {
        plugins: [codspeedPlugin()],
        test: {
          globals: true,
          include: ['**/*.test.ts'],
          benchmark: {
            include: ['**/*.bench.ts'],
          },
        },
      },
    ],
  },
}))
