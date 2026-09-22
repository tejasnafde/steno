import { MessageSquareIcon } from "lucide-react"

import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import type { Message as ChatMessage } from "@/lib/api"
import { seconds } from "@/lib/format"

type Props = { messages: ChatMessage[]; streaming: boolean }

export function Chat({ messages, streaming }: Props) {
  if (messages.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquareIcon />
          </EmptyMedia>
          <EmptyTitle>Start a conversation</EmptyTitle>
          <EmptyDescription>
            Pick a model above and ask anything. Every call is recorded: latency, time to first token, tokens, status.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const last = messages[messages.length - 1]

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((m) => {
              const live = streaming && m === last && m.role === "assistant"
              return (
                <MessageScrollerItem key={m.id} messageId={String(m.id)} scrollAnchor={m.role === "user"}>
                  {m.role === "user" ? (
                    <Message align="end">
                      <MessageContent>
                        <Bubble variant="default" align="end">
                          <BubbleContent className="whitespace-pre-wrap">{m.content}</BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  ) : (
                    <Message align="start">
                      <MessageContent className="w-full">
                        <Bubble variant="ghost" className="max-w-full">
                          <BubbleContent className="w-full">
                            {live && m.content === "" ? (
                              <span className="flex items-center gap-2 text-muted-foreground">
                                <Spinner /> Waiting for the first token
                              </span>
                            ) : (
                              <Markdown>{m.content}</Markdown>
                            )}
                            {live && m.content !== "" && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-foreground/70 align-text-bottom" />}
                          </BubbleContent>
                        </Bubble>
                        {(m.model || m.totalMs !== undefined) && (
                          <MessageFooter className="gap-2">
                            {m.model && <Badge variant="outline">{m.model}</Badge>}
                            {m.ttftMs !== undefined && <span>first token {seconds(m.ttftMs)}</span>}
                            {m.totalMs !== undefined && <span>total {seconds(m.totalMs)}</span>}
                          </MessageFooter>
                        )}
                      </MessageContent>
                    </Message>
                  )}
                </MessageScrollerItem>
              )
            })}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
