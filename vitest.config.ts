import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  test: {
    coverage: {
      include: ['packages/*/src/**'],
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
