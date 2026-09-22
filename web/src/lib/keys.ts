// Bring-your-own API keys. Kept in this browser's localStorage and sent as X-Key-<provider> headers;
// the server forwards them to the provider for that request and does not store them.
export const BYOK_PROVIDERS = ["openai", "anthropic"] as const
export type ByokProvider = (typeof BYOK_PROVIDERS)[number]
const STORAGE = "steno.keys"

export function loadKeys(): Partial<Record<ByokProvider, string>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "{}")
  } catch {
    return {}
  }
}

export function saveKeys(keys: Partial<Record<ByokProvider, string>>) {
  const clean = Object.fromEntries(Object.entries(keys).filter(([, v]) => v && v.trim()))
  localStorage.setItem(STORAGE, JSON.stringify(clean))
}

export function keyHeaders(): Record<string, string> {
  return Object.fromEntries(Object.entries(loadKeys()).map(([p, v]) => [`X-Key-${p}`, v as string]))
}
