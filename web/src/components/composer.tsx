import { useEffect, useRef, useState } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"

type Props = { streaming: boolean; onSend: (content: string) => void; onStop: () => void }

export function Composer({ streaming, onSend, onStop }: Props) {
  const [text, setText] = useState("")
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!streaming) input.current?.focus()
  }, [streaming])

  const submit = () => {
    const content = text.trim()
    if (!content || streaming) return
    setText("")
    onSend(content)
  }

  return (
    <InputGroup className="mx-auto w-full max-w-3xl">
      <InputGroupTextarea
        ref={input}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="Message. Enter sends, Shift+Enter for a new line."
        rows={1}
        className="max-h-48 field-sizing-content"
      />
      <InputGroupAddon align="inline-end">
        {streaming ? (
          <InputGroupButton size="icon-sm" variant="destructive" onClick={onStop} aria-label="Stop">
            <SquareIcon />
          </InputGroupButton>
        ) : (
          <InputGroupButton size="icon-sm" variant="default" onClick={submit} disabled={!text.trim()} aria-label="Send">
            <ArrowUpIcon />
          </InputGroupButton>
        )}
      </InputGroupAddon>
    </InputGroup>
  )
}
