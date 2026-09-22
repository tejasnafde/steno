import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Models } from "@/lib/api"

export type ModelPickerProps = {
  models: Models
  provider: string
  model: string
  onProvider: (provider: string) => void
  onModel: (model: string) => void
}

const LABELS: Record<string, string> = { google: "Gemini", groq: "Groq", openai: "OpenAI", anthropic: "Anthropic" }

export function ModelPicker({ models, provider, model, onProvider, onModel }: ModelPickerProps) {
  const [query, setQuery] = useState("")
  // A typed id that matches nothing becomes its own option, so any model id can be used.
  const items = useMemo(() => {
    const known = models[provider] ?? []
    return query && !known.includes(query) ? [query, ...known] : known
  }, [models, provider, query])
  const providers = Object.keys(models).map((p) => ({ value: p, label: LABELS[p] ?? p }))

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Select items={providers} value={provider} onValueChange={(v) => v && onProvider(v)}>
        <SelectTrigger size="sm" aria-label="Provider" className="w-28">
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
        <ComboboxTrigger render={<Button variant="ghost" size="sm" aria-label="Model" className="min-w-0 max-w-64 font-mono text-xs" />}>
          <span className="truncate">
            <ComboboxValue />
          </span>
        </ComboboxTrigger>
        <ComboboxContent className="w-80" align="start">
          <ComboboxInput showTrigger={false} placeholder="Search, or type any model id" className="font-mono text-xs" />
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
