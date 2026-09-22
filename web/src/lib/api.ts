export type Conversation = { id: string; title: string | null; archived_at: string | null; share_token: string | null; created_at: string; updated_at: string }
export type Message = {
  id: number | string
  role: "user" | "assistant"
  content: string
  model?: string | null
  ttftMs?: number
  totalMs?: number
  error?: string
}
export type Models = Record<string, string[]>
export type SendBody = { content: string; provider: string; model: string | null }
export type Me = { user: { id: string; email: string; name: string | null; picture: string | null } | null; admin: boolean }

import { keyHeaders } from "@/lib/keys"

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, { ...init, headers: { ...keyHeaders(), ...(init?.headers as Record<string, string> | undefined) } })
  if (!response.ok) {
    const detail: unknown = await response.json().then((body) => body?.detail, () => undefined)
    throw new Error(typeof detail === "string" && detail ? detail : `${response.status} ${response.statusText}`)
  }
  return response
}

const json = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

export const api = {
  me: () => request("/me").then((r) => r.json() as Promise<Me>),
  signIn: (idToken: string) => request("/auth/session", json({ idToken })).then((r) => r.json() as Promise<Me>),
  signOut: () => request("/auth/session", { method: "DELETE" }),
  models: () => request("/models").then((r) => r.json() as Promise<Models>),
  conversations: () => request("/conversations").then((r) => r.json() as Promise<Conversation[]>),
  createConversation: () => request("/conversations", { method: "POST" }).then((r) => r.json() as Promise<{ id: string }>),
  patchConversation: (id: string, body: { title?: string; archived?: boolean }) =>
    request(`/conversations/${id}`, json(body, "PATCH")).then((r) => r.json() as Promise<Conversation>),
  deleteConversation: (id: string) => request(`/conversations/${id}`, { method: "DELETE" }),
  fork: (id: string, upto: number) => request(`/conversations/${id}/fork`, json({ upto })).then((r) => r.json() as Promise<{ id: string }>),
  exportUrl: (id: string) => `/api/conversations/${id}/export`,
  truncate: (id: string, after: number) => request(`/conversations/${id}/truncate`, json({ after })),
  share: (id: string) => request(`/conversations/${id}/share`, { method: "POST" }).then((r) => r.json() as Promise<{ token: string }>),
  unshare: (id: string) => request(`/conversations/${id}/share`, { method: "DELETE" }),
  shared: (token: string) => request(`/shared/${token}`).then((r) => r.json() as Promise<{ title: string | null; messages: Message[] }>),
  forkShared: (token: string) => request(`/shared/${token}/fork`, { method: "POST" }).then((r) => r.json() as Promise<{ id: string }>),
  messages: (id: string) => request(`/conversations/${id}/messages`).then((r) => r.json() as Promise<Message[]>),
  send: (id: string, body: SendBody, signal: AbortSignal) => request(`/conversations/${id}/messages`, { ...json(body), signal }),
  allowlist: () => request("/admin/allowlist").then((r) => r.json() as Promise<{ emails: string[]; me: string }>),
  saveAllowlist: (emails: string[]) => request("/admin/allowlist", json({ emails }, "PUT")).then((r) => r.json() as Promise<{ emails: string[]; me: string }>),
}

export async function* textChunks(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    yield value
  }
}
