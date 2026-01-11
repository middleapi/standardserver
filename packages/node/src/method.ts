import type { StandardMethod } from '@standardserver/core'

export function toStandardMethod(method: string | undefined): StandardMethod {
  return method ?? 'GET'
}
