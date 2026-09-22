import { useState } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"

type Props = { streaming: boolean; onSend: (content: string) => void; onStop: () => void }

export function Composer({ streaming, onSend, onStop }: Props) {
  const [text, setText] = useState("")

  const submit = () => {
    const content = text.trim()
    if (!content || streaming) return
    setText("")
    onSend(content)
  }

  return (
    <InputGroup className="mx-auto w-full max-w-3xl">
      <InputGroupTextarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="Message"
        rows={2}
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
