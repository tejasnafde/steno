import { useState } from "react"
import { KeyRoundIcon } from "lucide-react"
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
import { Input } from "@/components/ui/input"
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
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            saveKeys(keys)
            setOpen(false)
            onSaved()
            toast.success("Keys saved in this browser")
          }}
        >
          <DialogHeader>
            <DialogTitle>Use your own API keys</DialogTitle>
            <DialogDescription>
              Keys stay in this browser and go with each request to the provider. They are not stored on the server.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {BYOK_PROVIDERS.map((p) => (
              <Field key={p}>
                <FieldLabel htmlFor={`key-${p}`}>{LABELS[p]}</FieldLabel>
                <Input
                  id={`key-${p}`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={PLACEHOLDER[p]}
                  value={keys[p] ?? ""}
                  onChange={(e) => setKeys({ ...keys, [p]: e.target.value })}
                  className="font-mono text-xs"
                />
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
