export function tryDecodeURIComponent(value: string): string {
  try {
    // eslint-disable-next-line ban/ban
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}
