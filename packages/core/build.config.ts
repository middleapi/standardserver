import { defineBuildConfig } from 'unbuild'
import pkg from './package.json'

export default defineBuildConfig({
  replace: {
    __PACKAGE_NAME_PLACEHOLDER__: pkg.name,
    __PACKAGE_VERSION_PLACEHOLDER__: pkg.version,
  },
})
