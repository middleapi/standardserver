import type { StandardMethod } from '@standard-server/core'

export function toStandardMethod(method: string | undefined): StandardMethod {
  return method ?? 'GET'
}
