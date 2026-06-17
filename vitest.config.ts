import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  test: {
    coverage: {
      include: ['packages/*/src/**'],
      exclude: ['**.test-d.*', '**.test.*'],
    },
    projects: [
      {
        test: {
          globals: true,
          include: ['**/*.test.ts'],
        },
      },
    ],
  },
}))
