import { useCallback, useEffect, useRef, useState } from "react"

import { api, textChunks, type Conversation, type Message, type Models } from "@/lib/api"

export function useChat() {
  const [models, setModels] = useState<Models>({})
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const controller = useRef<AbortController | null>(null)

  const refreshConversations = useCallback(() => api.conversations().then(setConversations), [])

  useEffect(() => {
    refreshConversations()
    api.models().then((m) => {
      setModels(m)
      const first = Object.keys(m)[0]
      if (first) {
        setProvider(first)
        setModel(m[first][0] ?? "")
      }
    })
  }, [refreshConversations])

  const selectProvider = (next: string) => {
    setProvider(next)
    setModel(models[next]?.[0] ?? "")
  }

  const open = async (id: string) => {
    controller.current?.abort()
    setCurrentId(id)
    setMessages(await api.messages(id))
  }

  const create = async () => {
    const { id } = await api.createConversation()
    await refreshConversations()
    await open(id)
    return id
  }

  const stop = () => controller.current?.abort()

  const send = async (content: string) => {
    const id = currentId ?? (await create())
    const userMessage: Message = { id: `u-${Date.now()}`, role: "user", content }
    const reply: Message = { id: `a-${Date.now()}`, role: "assistant", content: "" }
    setMessages((prev) => [...prev, userMessage, reply])
    setStreaming(true)
    controller.current = new AbortController()
    try {
      const response = await api.send(id, { content, provider, model: model || null }, controller.current.signal)
      for await (const chunk of textChunks(response)) {
        setMessages((prev) => prev.map((m) => (m.id === reply.id ? { ...m, content: m.content + chunk } : m)))
      }
    } catch (error) {
      const note = (error as Error).name === "AbortError" ? " [stopped]" : ` [error] ${(error as Error).message}`
      setMessages((prev) => prev.map((m) => (m.id === reply.id ? { ...m, content: m.content + note } : m)))
    } finally {
      setStreaming(false)
      controller.current = null
      refreshConversations()
    }
  }

  return { models, provider, model, selectProvider, setModel, conversations, currentId, messages, streaming, open, create, send, stop }
}
