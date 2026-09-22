export function seconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`
}

export function dateBucket(iso: string): "Today" | "Yesterday" | "Previous 7 days" | "Older" {
  const day = 86_400_000
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const t = new Date(iso).getTime()
  if (t >= start.getTime()) return "Today"
  if (t >= start.getTime() - day) return "Yesterday"
  if (t >= start.getTime() - 7 * day) return "Previous 7 days"
  return "Older"
}
