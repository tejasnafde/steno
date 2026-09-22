import { useMemo, useState } from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Models } from "@/lib/api"

type Props = {
  models: Models
  provider: string
  model: string
  onProvider: (provider: string) => void
  onModel: (model: string) => void
}

const LABELS: Record<string, string> = { google: "Gemini", groq: "Groq", openai: "OpenAI", anthropic: "Anthropic" }

export function ModelPicker({ models, provider, model, onProvider, onModel }: Props) {
  const [query, setQuery] = useState("")
  const known = models[provider] ?? []
  // A typed id that matches nothing becomes its own option, so any model id can be used.
  const items = useMemo(() => (query && !known.includes(query) ? [query, ...known] : known), [known, query])
  const providers = Object.keys(models).map((p) => ({ value: p, label: LABELS[p] ?? p }))

  return (
    <div className="flex items-center gap-2">
      <Select items={providers} value={provider} onValueChange={(v) => v && onProvider(v)}>
        <SelectTrigger className="w-28" aria-label="Provider">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {providers.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Combobox items={items} value={model} onValueChange={(v) => onModel(v ?? "")} onInputValueChange={setQuery}>
        <ComboboxInput placeholder="Model" aria-label="Model" className="w-72 **:data-[slot=input-group-control]:font-mono **:data-[slot=input-group-control]:text-xs" />
        <ComboboxContent>
          <ComboboxEmpty>Type a model id</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item} className="font-mono text-xs">
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
