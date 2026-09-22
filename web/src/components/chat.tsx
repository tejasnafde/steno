import { useState } from "react"

import { Markdown } from "@/components/markdown"
import { MessageActions } from "@/components/message-actions"
import { Welcome } from "@/components/welcome"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import type { Message as ChatMessage } from "@/lib/api"
import { seconds } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  messages: ChatMessage[]
  streaming: boolean
  signedIn: boolean
  onPrompt: (content: string) => void
  onFork: (upto: number) => void
  onResend: (userMessageId: number, content: string) => void
  onSignIn: () => void
}

export function Chat({ messages, streaming, signedIn, onPrompt, onFork, onResend, onSignIn }: Props) {
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)

  if (messages.length === 0) return <Welcome onPrompt={onPrompt} />

  const last = messages[messages.length - 1]
  const userBefore = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (messages[j].role === "user") return messages[j]
    return null
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1">
        <MessageScrollerViewport className="overscroll-auto">
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((m, i) => {
              const live = streaming && m === last && m.role === "assistant"
              const stored = typeof m.id === "number"
              const fresh = !stored // created in this session; rows loaded from the server do not animate in
              const prevUser = userBefore(i)
              return (
                <MessageScrollerItem key={m.id} messageId={String(m.id)} scrollAnchor={m.role === "user"}>
                  <div className={cn("group/row", fresh && "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none")}>
                    {m.role === "user" ? (
                      <Message align="end">
                        <MessageContent className={cn(editing?.id === m.id && "w-full")}>
                          {editing?.id === m.id ? (
                            <form
                              className="flex flex-col gap-2"
                              onSubmit={(e) => {
                                e.preventDefault()
                                const text = editing.text.trim()
                                setEditing(null)
                                if (text) onResend(m.id as number, text)
                              }}
                            >
                              <Textarea autoFocus value={editing.text} onChange={(e) => setEditing({ id: m.id as number, text: e.target.value })} aria-label="Edit message" className="field-sizing-content" />
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                                  Cancel
                                </Button>
                                <Button type="submit" size="sm">
                                  Send again
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <Bubble variant="default" align="end">
                                <BubbleContent className="whitespace-pre-wrap">{m.content}</BubbleContent>
                              </Bubble>
                              {stored && !streaming && (
                                <MessageFooter className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                                  <MessageActions content={m.content} signedIn={signedIn} onSignIn={onSignIn} onEdit={() => setEditing({ id: m.id as number, text: m.content })} />
                                </MessageFooter>
                              )}
                            </>
                          )}
                        </MessageContent>
                      </Message>
                    ) : (
                      <Message align="start">
                        <MessageContent className="w-full">
                          {m.error && (
                            <Alert variant="destructive" className="mb-2">
                              <AlertTitle>The model did not answer</AlertTitle>
                              <AlertDescription className="break-words">{m.error}</AlertDescription>
                            </Alert>
                          )}
                          <Bubble variant="ghost" className={cn("max-w-full", m.error && m.content === "" && "hidden")}>
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
                              {stored && !streaming && (
                                <MessageActions
                                  content={m.content}
                                  signedIn={signedIn}
                                  onSignIn={onSignIn}
                                  onFork={() => onFork(m.id as number)}
                                  onRetry={prevUser && typeof prevUser.id === "number" ? () => onResend(prevUser.id as number, prevUser.content) : undefined}
                                />
                              )}
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
