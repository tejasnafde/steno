import { ChevronRightIcon } from "lucide-react"

import type { Models } from "@/lib/api"

const PROMPTS = [
  "Explain Redis consumer groups in three short bullets.",
  "What is the difference between p50 and p95 latency? Two sentences.",
  "Write a Python function that redacts email addresses, with a docstring.",
]

type Props = { models: Models; onPrompt: (content: string) => void }

export function Welcome({ models, onPrompt }: Props) {
  const count = Object.values(models).reduce((n, m) => n + m.length, 0)

  return (
    <div className="flex flex-1 flex-col justify-end overflow-y-auto px-4 py-8 md:justify-center">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Chat with any model. Every reply comes with its receipt.</h1>
          <p className="max-w-prose text-muted-foreground">
            Pick from {count || "dozens of"} models across Gemini, Groq and OpenAI. Each answer shows which model wrote it, how long the first
            token took, and how long the whole reply took. Switch models mid-conversation whenever you like.
          </p>
        </div>
        <div className="flex flex-col">
          <span className="pb-2 text-xs text-muted-foreground">Start with one of these</span>
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPrompt(p)}
              className="group flex min-h-11 items-center justify-between gap-4 border-t py-3 text-left text-sm text-foreground/80 outline-none transition-colors last:border-b hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span>{p}</span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
