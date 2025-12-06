import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  rules: {
    'yaml/sort-keys': 'off',
    'pnpm/json-enforce-catalog': 'off',
    'pnpm/yaml-enforce-settings': 'off',
  },
})
