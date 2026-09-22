import { useState } from "react"
import { KeyRoundIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { BYOK_PROVIDERS, loadKeys, saveKeys, type ByokProvider } from "@/lib/keys"

const LABELS: Record<ByokProvider, string> = { openai: "OpenAI", anthropic: "Anthropic" }
const PLACEHOLDER: Record<ByokProvider, string> = { openai: "sk-...", anthropic: "sk-ant-..." }

export function KeyDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [keys, setKeys] = useState(loadKeys)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setKeys(loadKeys())
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label="Your API keys" />}>
        <KeyRoundIcon data-icon="inline-start" />
        Your keys
      </DialogTrigger>
      {/* stopPropagation: the trigger lives inside the composer's InputGroup, whose click handler focuses the
          textarea; through the portal that would fight the dialog's focus trap. */}
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            saveKeys(keys)
            setOpen(false)
            onSaved()
            toast.success(Object.values(keys).some((v) => v?.trim()) ? "Keys saved in this browser" : "Keys removed")
          }}
        >
          <DialogHeader>
            <DialogTitle>Use your own API keys</DialogTitle>
            <DialogDescription>
              Keys stay in this browser only. They go with each request to the provider and are never stored on the server, so
              signing in does not move them and other devices will not have them. Clear a field to remove a key.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {BYOK_PROVIDERS.map((p) => (
              <Field key={p}>
                <FieldLabel htmlFor={`key-${p}`}>{LABELS[p]}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`key-${p}`}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={PLACEHOLDER[p]}
                    value={keys[p] ?? ""}
                    onChange={(e) => setKeys({ ...keys, [p]: e.target.value })}
                    className="font-mono text-xs"
                  />
                  {keys[p] && (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton size="icon-xs" variant="ghost" aria-label={`Remove ${LABELS[p]} key`} onClick={() => setKeys({ ...keys, [p]: "" })}>
                        <XIcon />
                      </InputGroupButton>
                    </InputGroupAddon>
                  )}
                </InputGroup>
                {p === "anthropic" && <FieldDescription>Anthropic keys also list your available Claude models.</FieldDescription>}
              </Field>
            ))}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
