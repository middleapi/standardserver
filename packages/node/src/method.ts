export function toStandardMethod(method: string | undefined): string {
  return method ?? 'GET'
}
