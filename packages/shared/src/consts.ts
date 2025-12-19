export const PACKAGE_NAME = '__PACKAGE_NAME_PLACEHOLDER__'
export const PACKAGE_VERSION = '__PACKAGE_VERSION_PLACEHOLDER__'

/**
 * Generates a unique symbol for the specified name within the package scope.
 * The symbol is globally registered using `Symbol.for` to ensure consistency across modules.
 *
 * @remarks
 * - Ensure names are unique to avoid symbol collisions within the package.
 * - Ensure package versions are synchronized (e.g., when the core package is updated, this package should also be updated).
 */
export function getPackageSymbol(name: string): symbol {
  return Symbol.for(`${PACKAGE_NAME}@${PACKAGE_VERSION}/${name}`)
}
