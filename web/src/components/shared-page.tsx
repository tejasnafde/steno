import { useEffect, useState } from "react"
import { ArrowRightIcon } from "lucide-react"
import { toast } from "sonner"

import { Markdown } from "@/components/markdown"
import { APP_NAME } from "@/components/site-header"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import { Spinner } from "@/components/ui/spinner"
import { api, type Message as ChatMessage } from "@/lib/api"

export function SharedPage({ token }: { token: string }) {
  const [data, setData] = useState<{ title: string | null; messages: ChatMessage[] } | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    api.shared(token).then(setData, () => setMissing(true))
  }, [token])

  useEffect(() => {
    document.title = data?.title ? `${data.title} · ${APP_NAME}` : APP_NAME
  }, [data])

  const continueHere = async () => {
    try {
      const { id } = await api.forkShared(token)
      location.assign(`/?c=${id}`)
    } catch {
      toast.error("Could not copy this conversation")
    }
  }

  if (missing) {
    return (
      <Empty className="h-svh">
        <EmptyHeader>
          <EmptyTitle>This link is no longer shared</EmptyTitle>
          <EmptyDescription>The owner turned sharing off, or the link is wrong.</EmptyDescription>
        </EmptyHeader>
        <Button render={<a href="/" />}>Open {APP_NAME}</Button>
      </Empty>
    )
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <a href="/" className="font-semibold tracking-tight">
          {APP_NAME}
        </a>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{data?.title ?? "Shared conversation"}</span>
        <Button size="sm" className="ml-auto" onClick={continueHere} disabled={!data}>
          Continue this conversation
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {!data && <Spinner className="self-center" />}
          {data?.messages.map((m) =>
            m.role === "user" ? (
              <Message key={m.id} align="end">
                <MessageContent>
                  <Bubble variant="default" align="end">
                    <BubbleContent className="whitespace-pre-wrap">{m.content}</BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            ) : (
              <Message key={m.id} align="start">
                <MessageContent className="w-full">
                  <Bubble variant="ghost" className="max-w-full">
                    <BubbleContent className="w-full">
                      <Markdown>{m.content}</Markdown>
                    </BubbleContent>
                  </Bubble>
                  {m.model && (
                    <MessageFooter>
                      <span className="ident text-foreground/70">{m.model}</span>
                    </MessageFooter>
                  )}
                </MessageContent>
              </Message>
            ),
          )}
        </div>
      </main>
    </div>
  )
}
