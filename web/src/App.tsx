import { useEffect } from "react"

import { AccessPage } from "@/components/access-page"
import { Chat } from "@/components/chat"
import { Composer } from "@/components/composer"
import { ConversationList } from "@/components/conversation-list"
import { APP_NAME, SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useChat } from "@/hooks/use-chat"

export function App() {
  if (location.pathname === "/admin/access") return <AccessPage />
  return <ChatApp />
}

function ChatApp() {
  const chat = useChat()
  const title = chat.conversations.find((c) => c.id === chat.currentId)?.title ?? null

  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])

  const picker = { models: chat.models, provider: chat.provider, model: chat.model, onProvider: chat.selectProvider, onModel: chat.setModel }

  return (
    <SidebarProvider>
      <ConversationList
        conversations={chat.conversations}
        currentId={chat.currentId}
        onOpen={chat.open}
        onNew={chat.startNew}
        onDelete={chat.remove}
      />
      <SidebarInset className="h-svh">
        <SiteHeader title={title} streaming={chat.streaming} />
        <Chat messages={chat.messages} streaming={chat.streaming} models={chat.models} onPrompt={chat.send} />
        <div className="px-4 pb-4 pt-2">
          <Composer {...picker} streaming={chat.streaming} onSend={chat.send} onStop={chat.stop} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
