import { useCallback, useEffect, useRef, useState } from "react"

import { api, textChunks, type Conversation, type Message, type Models } from "@/lib/api"

const PARAM = "c"

function urlConversation() {
  return new URLSearchParams(location.search).get(PARAM)
}

function setUrlConversation(id: string | null) {
  const url = new URL(location.href)
  if (id) url.searchParams.set(PARAM, id)
  else url.searchParams.delete(PARAM)
  history.replaceState(null, "", url)
}

export function useChat() {
  const [models, setModels] = useState<Models>({})
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<string | null>(urlConversation)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const controller = useRef<AbortController | null>(null)

  const refreshConversations = useCallback(() => api.conversations().then(setConversations), [])

  const patch = (id: Message["id"], change: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...(typeof change === "function" ? change(m) : change) } : m)))

  useEffect(() => {
    refreshConversations()
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
  }, [refreshConversations])

  const selectProvider = (next: string) => {
    setProvider(next)
    setModel(models[next]?.[0] ?? "")
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

  const remove = async (id: string) => {
    await api.deleteConversation(id)
    if (id === currentId) startNew()
    refreshConversations()
  }

  const stop = () => controller.current?.abort()

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
      refreshConversations()
    }
  }

  return { models, provider, model, selectProvider, setModel, conversations, currentId, messages, streaming, open, startNew, remove, send, stop }
}
