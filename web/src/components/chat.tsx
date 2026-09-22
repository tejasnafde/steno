import { Markdown } from "@/components/markdown"
import { MessageActions } from "@/components/message-actions"
import { Welcome } from "@/components/welcome"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
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
import type { Message as ChatMessage, Models } from "@/lib/api"
import { seconds } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  messages: ChatMessage[]
  streaming: boolean
  models: Models
  signedIn: boolean
  onPrompt: (content: string) => void
  onFork: (upto: number) => void
  onSignIn: () => void
}

export function Chat({ messages, streaming, models, signedIn, onPrompt, onFork, onSignIn }: Props) {
  if (messages.length === 0) return <Welcome models={models} onPrompt={onPrompt} />

  const last = messages[messages.length - 1]

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((m) => {
              const live = streaming && m === last && m.role === "assistant"
              const fresh = typeof m.id === "string" // created in this session; rows loaded from the server have numeric ids and do not animate in
              const actions = !live && typeof m.id === "number" && (
                <MessageActions content={m.content} canFork={m.role === "assistant"} signedIn={signedIn} onFork={() => onFork(m.id as number)} onSignIn={onSignIn} />
              )
              return (
                <MessageScrollerItem key={m.id} messageId={String(m.id)} scrollAnchor={m.role === "user"}>
                  <div className={cn("group/row", fresh && "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none")}>
                    {m.role === "user" ? (
                      <Message align="end">
                        <MessageContent>
                          <Bubble variant="default" align="end">
                            <BubbleContent className="whitespace-pre-wrap">{m.content}</BubbleContent>
                          </Bubble>
                          <MessageFooter className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">{actions}</MessageFooter>
                        </MessageContent>
                      </Message>
                    ) : (
                      <Message align="start">
                        <MessageContent className="w-full">
                          <Bubble variant="ghost" className="max-w-full">
                            <BubbleContent className="w-full">
                              {live && m.content === "" ? (
                                <span role="status" className="flex items-center gap-2 text-muted-foreground">
                                  <Spinner /> Waiting for the first token
                                </span>
                              ) : (
                                <Markdown>{m.content}</Markdown>
                              )}
                              {live && m.content !== "" && (
                                <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-signal align-text-bottom motion-reduce:animate-none" />
                              )}
                            </BubbleContent>
                          </Bubble>
                          {!live && (
                            <MessageFooter className="gap-3">
                              {actions}
                              {m.model && <span className="ident text-foreground/70">{m.model}</span>}
                              {m.ttftMs !== undefined && <span className="ident">first token {seconds(m.ttftMs)}</span>}
                              {m.totalMs !== undefined && <span className="ident">total {seconds(m.totalMs)}</span>}
                            </MessageFooter>
                          )}
                        </MessageContent>
                      </Message>
                    )}
                  </div>
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
