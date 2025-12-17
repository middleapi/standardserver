export const PACKAGE_NAME = '__PACKAGE_NAME_PLACEHOLDER__'
export const PACKAGE_VERSION = '__PACKAGE_VERSION_PLACEHOLDER__'

/**
 * Generates a unique symbol for the given name within the package scope.
 * The symbol is globally registered with `Symbol.for` to ensure consistency across different modules.
 *
 * @remarks Make sure to use unique names to avoid symbol collisions within the package.
 */
export function getPackageSymbol(name: string): symbol {
  return Symbol.for(`${PACKAGE_NAME}@${PACKAGE_VERSION}/${name}`)
}
