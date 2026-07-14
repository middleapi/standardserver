import codspeedPlugin from '@codspeed/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  plugins: [codspeedPlugin()],
  test: {
    coverage: {
      include: ['packages/*/src/**'],
      exclude: ['**.test-d.*', '**.test.*'],
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
