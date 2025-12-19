export function toArray<T>(value: T): T extends readonly any[] ? T : Exclude<T, undefined | null>[] {
  return (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]) as any
}
