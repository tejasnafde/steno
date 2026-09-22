import { useEffect } from "react"

import { AccessPage } from "@/components/access-page"
import { Chat } from "@/components/chat"
import { Composer } from "@/components/composer"
import { ConversationList } from "@/components/conversation-list"
import { SharedPage } from "@/components/shared-page"
import { APP_NAME, SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/use-auth"
import { useChat } from "@/hooks/use-chat"

export function App() {
  if (location.pathname === "/admin/access") return <AccessPage />
  const shared = location.pathname.match(/^\/s\/([\w-]+)$/)
  if (shared) return <SharedPage token={shared[1]} />
  return <ChatApp />
}

function ChatApp() {
  const auth = useAuth()
  const chat = useChat(auth.me?.user?.id ?? null)
  const title = chat.conversations?.find((c) => c.id === chat.currentId)?.title ?? null

  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])

  // Arriving from a protected page (/admin) without a session: offer sign-in, then go back there.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get("signin") && auth.me && !auth.me.user) {
      const next = params.get("next") ?? "/"
      auth.signIn().then(() => location.assign(next), () => undefined)
    }
  }, [auth.me]) // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = () => auth.signIn().catch(() => undefined)

  return (
    <SidebarProvider>
      <ConversationList
        conversations={chat.conversations}
        currentId={chat.currentId}
        me={auth.me}
        onOpen={chat.open}
        onNew={chat.startNew}
        onRename={chat.rename}
        onArchive={chat.archive}
        onDelete={chat.remove}
        onShare={chat.share}
        onUnshare={chat.unshare}
        onSignIn={signIn}
        onSignOut={auth.signOut}
      />
      <SidebarInset className="h-svh">
        <SiteHeader title={title} streaming={chat.streaming} />
        <Chat
          messages={chat.messages}
          streaming={chat.streaming}
          signedIn={Boolean(auth.me?.user)}
          onPrompt={chat.send}
          onFork={chat.fork}
          onResend={chat.resend}
          onSignIn={signIn}
        />
        <div className="px-4 pb-4 pt-2">
          <Composer models={chat.models} provider={chat.provider} model={chat.model} onSelect={chat.select} streaming={chat.streaming} onSend={chat.send} onStop={chat.stop} onKeysSaved={chat.loadModels} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
