import { useCallback, useEffect, useRef, useState } from "react"

import { api, textChunks, type Conversation, type Message, type Models } from "@/lib/api"

const PARAM = "c"
const TITLE_SETTLE_MS = 3000 // the server names a conversation a moment after the first reply

function urlConversation() {
  return new URLSearchParams(location.search).get(PARAM)
}

function setUrlConversation(id: string | null) {
  const url = new URL(location.href)
  if (id) url.searchParams.set(PARAM, id)
  else url.searchParams.delete(PARAM)
  history.replaceState(null, "", url)
}

export function useChat(refreshKey: unknown) {
  const [models, setModels] = useState<Models>({})
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(urlConversation)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const controller = useRef<AbortController | null>(null)

  const refreshConversations = useCallback(() => api.conversations().then(setConversations), [])

  const patch = (id: Message["id"], change: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...(typeof change === "function" ? change(m) : change) } : m)))

  useEffect(() => {
    api.models().then((m) => {
      const first = Object.keys(m)[0]
      setModels(m)
      if (first) {
        setProvider(first)
        setModel(m[first][0] ?? "")
      }
    })
    const initial = urlConversation()
    if (initial) api.messages(initial).then(setMessages, () => setUrlConversation(null))
  }, [])

  // Re-read the list whenever identity changes: signing in moves this browser's conversations to the account.
  useEffect(() => {
    refreshConversations()
  }, [refreshConversations, refreshKey])

  const select = (nextProvider: string, nextModel: string) => {
    setProvider(nextProvider)
    setModel(nextModel)
  }

  const open = async (id: string) => {
    controller.current?.abort()
    setCurrentId(id)
    setUrlConversation(id)
    setMessages(await api.messages(id))
  }

  const startNew = () => {
    controller.current?.abort()
    setCurrentId(null)
    setUrlConversation(null)
    setMessages([])
  }

  const rename = async (id: string, title: string) => {
    await api.patchConversation(id, { title })
    refreshConversations()
  }

  const archive = async (id: string, archived: boolean) => {
    await api.patchConversation(id, { archived })
    if (archived && id === currentId) startNew()
    refreshConversations()
  }

  const remove = async (id: string) => {
    await api.deleteConversation(id)
    if (id === currentId) startNew()
    refreshConversations()
  }

  const fork = async (upto: number) => {
    if (!currentId) return
    const { id } = await api.fork(currentId, upto)
    await refreshConversations()
    await open(id)
  }

  const stop = () => controller.current?.abort()

  // Retry and edit are the same move: drop everything from a user message on, then send again.
  const resend = async (userMessageId: number, content: string) => {
    if (!currentId) return
    const idx = messages.findIndex((m) => m.id === userMessageId)
    if (idx < 0) return
    const before = messages[idx - 1]
    await api.truncate(currentId, typeof before?.id === "number" ? before.id : 0)
    setMessages((prev) => prev.slice(0, idx))
    await send(content)
  }

  const share = async (id: string) => {
    const { token } = await api.share(id)
    refreshConversations()
    return `${location.origin}/s/${token}`
  }

  const unshare = async (id: string) => {
    await api.unshare(id)
    refreshConversations()
  }

  const send = async (content: string) => {
    let id = currentId
    if (!id) {
      id = (await api.createConversation()).id
      setCurrentId(id)
      setUrlConversation(id)
    }
    const userMessage: Message = { id: `u-${Date.now()}`, role: "user", content }
    const reply: Message = { id: `a-${Date.now()}`, role: "assistant", content: "" }
    setMessages((prev) => [...prev, userMessage, reply])
    setStreaming(true)
    controller.current = new AbortController()
    const started = performance.now()
    try {
      const response = await api.send(id, { content, provider, model: model || null }, controller.current.signal)
      patch(reply.id, { model: response.headers.get("X-Model") })
      for await (const chunk of textChunks(response)) {
        patch(reply.id, (m) => ({ content: m.content + chunk, ttftMs: m.ttftMs ?? performance.now() - started }))
      }
    } catch (error) {
      const note = (error as Error).name === "AbortError" ? "" : `\n\n[error] ${(error as Error).message}`
      patch(reply.id, (m) => ({ content: m.content + note }))
    } finally {
      patch(reply.id, { totalMs: performance.now() - started })
      setStreaming(false)
      controller.current = null
      // Client ids are provisional; reload so fork and copy work on real message ids.
      api.messages(id).then(setMessages)
      refreshConversations()
      setTimeout(refreshConversations, TITLE_SETTLE_MS)
    }
  }

  return { models, provider, model, select, conversations, currentId, messages, streaming, open, startNew, rename, archive, remove, fork, send, resend, share, unshare, stop }
}
