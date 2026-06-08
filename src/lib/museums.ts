import type { Hours, Museum } from '@/db/schema'

export type { Museum, Hours }

export function hasCoords(
  m: Museum,
): m is Museum & { latitude: number; longitude: number } {
  return (
    typeof m.latitude === 'number' &&
    typeof m.longitude === 'number' &&
    !Number.isNaN(m.latitude) &&
    !Number.isNaN(m.longitude)
  )
}

/**
 * museums.hours are indexed 0=Monday..6=Sunday with [openHourDecimal, closeHourDecimal].
 * Date.getDay() returns 0=Sunday..6=Saturday, so shift to align.
 */
export function isOpenNow(
  hours: Hours | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!hours) return false
  const jsDay = now.getDay()
  const dataDay = (jsDay + 6) % 7
  const lookup = hours as Record<string, Array<number> | undefined>
  const window = lookup[String(dataDay)]
  if (!window || window.length < 2) return false
  const [open, close] = window
  const decimal = now.getHours() + now.getMinutes() / 60
  return decimal >= open && decimal < close
}
