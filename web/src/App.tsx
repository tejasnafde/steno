import { Chat } from "@/components/chat"
import { Composer } from "@/components/composer"
import { ConversationList } from "@/components/conversation-list"
import { ModelPicker } from "@/components/model-picker"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useChat } from "@/hooks/use-chat"

export function App() {
  const chat = useChat()

  return (
    <SidebarProvider>
      <ConversationList conversations={chat.conversations} currentId={chat.currentId} onOpen={chat.open} onCreate={chat.create} />
      <SidebarInset className="h-svh">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <ModelPicker
            models={chat.models}
            provider={chat.provider}
            model={chat.model}
            onProvider={chat.selectProvider}
            onModel={chat.setModel}
          />
        </header>
        <Chat messages={chat.messages} streaming={chat.streaming} />
        <div className="p-4">
          <Composer streaming={chat.streaming} onSend={chat.send} onStop={chat.stop} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
