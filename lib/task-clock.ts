export function taskStartFromClockIn(clockInAt: string | null | undefined, fallbackStartedAt: string) {
  return clockInAt || fallbackStartedAt;
}
