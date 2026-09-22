import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import type { Models } from "@/lib/api"

export type ModelPickerProps = {
  models: Models
  provider: string
  model: string
  onSelect: (provider: string, model: string) => void
}

const LABELS: Record<string, string> = { google: "Gemini", groq: "Groq", openai: "OpenAI (your key)", anthropic: "Anthropic (your key)" }
type Item = { provider: string; id: string }
type Group = { value: string; items: Item[] }

export function ModelPicker({ models, provider, model, onSelect }: ModelPickerProps) {
  const [query, setQuery] = useState("")
  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase()
    const result = Object.entries(models).map(([p, ids]) => ({
      value: p,
      items: ids.filter((id) => !q || id.toLowerCase().includes(q)).map((id) => ({ provider: p, id })),
    }))
    // A typed id that matches nothing becomes an option under the current provider, so any model id can be used.
    if (q && !result.some((g) => g.items.length)) return [{ value: provider, items: [{ provider, id: query.trim() }] }]
    return result.filter((g) => g.items.length)
  }, [models, provider, query])

  const current: Item | null = model ? { provider, id: model } : null

  return (
    <Combobox<Item>
      items={groups}
      value={current}
      onValueChange={(item) => item && onSelect(item.provider, item.id)}
      onInputValueChange={setQuery}
      itemToStringLabel={(item) => item.id}
      itemToStringValue={(item) => `${item.provider}/${item.id}`}
      isItemEqualToValue={(a, b) => a.provider === b.provider && a.id === b.id}
      filter={null}
    >
      <ComboboxTrigger render={<Button variant="ghost" size="sm" aria-label="Model" className="min-w-0 max-w-72 gap-2" />}>
        <span className="text-xs text-muted-foreground">{LABELS[provider] ?? provider}</span>
        <span className="ident truncate">{model || "Choose a model"}</span>
      </ComboboxTrigger>
      <ComboboxContent className="w-88" align="start">
        <ComboboxInput showTrigger={false} placeholder="Search models, or type any model id" />
        <ComboboxEmpty>No model matches</ComboboxEmpty>
        <ComboboxList>
          {(group: Group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{LABELS[group.value] ?? group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item: Item) => (
                  <ComboboxItem key={`${item.provider}/${item.id}`} value={item} className="ident">
                    {item.id}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
