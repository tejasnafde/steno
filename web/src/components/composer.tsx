import { useEffect, useRef, useState } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"

import { ModelPicker, type ModelPickerProps } from "@/components/model-picker"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"

type Props = ModelPickerProps & { streaming: boolean; onSend: (content: string) => void; onStop: () => void }

export function Composer({ streaming, onSend, onStop, ...picker }: Props) {
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
        placeholder="Ask anything. Enter sends, Shift+Enter adds a line."
        aria-label="Message"
        rows={1}
        className="max-h-48 field-sizing-content"
      />
      <InputGroupAddon align="block-end">
        <ModelPicker {...picker} />
        <div className="ml-auto">
          {streaming ? (
            <InputGroupButton size="icon-sm" variant="destructive" onClick={onStop} aria-label="Stop generating">
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton size="icon-sm" variant="default" onClick={submit} disabled={!text.trim()} aria-label="Send">
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </div>
      </InputGroupAddon>
    </InputGroup>
  )
}
