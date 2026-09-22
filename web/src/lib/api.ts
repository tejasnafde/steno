export type Conversation = { id: string; title: string | null; created_at: string; updated_at: string }
export type Message = { id: number | string; role: "user" | "assistant"; content: string }
export type Models = Record<string, string[]>
export type SendBody = { content: string; provider: string; model: string | null }

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response
}

export const api = {
  models: () => request("/models").then((r) => r.json() as Promise<Models>),
  conversations: () => request("/conversations").then((r) => r.json() as Promise<Conversation[]>),
  createConversation: () => request("/conversations", { method: "POST" }).then((r) => r.json() as Promise<{ id: string }>),
  messages: (id: string) => request(`/conversations/${id}/messages`).then((r) => r.json() as Promise<Message[]>),
  send: (id: string, body: SendBody, signal: AbortSignal) =>
    request(`/conversations/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }),
}

export async function* textChunks(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    yield value
  }
}
