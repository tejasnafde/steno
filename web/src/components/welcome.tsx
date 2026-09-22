import { ChevronRightIcon } from "lucide-react"

import type { Models } from "@/lib/api"

const PROMPTS = [
  "Explain Redis consumer groups in three short bullets.",
  "What is the difference between p50 and p95 latency? Two sentences.",
  "Write a Python function that redacts email addresses, with a docstring.",
]

type Props = { models: Models; onPrompt: (content: string) => void }

export function Welcome({ models, onPrompt }: Props) {
  const providers = Object.keys(models).length
  const count = Object.values(models).reduce((n, m) => n + m.length, 0)

  return (
    <div className="flex flex-1 flex-col justify-end overflow-y-auto px-4 py-8 md:justify-center">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <span className="meta">steno / inference recorder</span>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Every model call, recorded.</h1>
          <p className="max-w-prose text-muted-foreground">
            Chat with any model. Latency, time to first token, token counts and status land in Postgres about a second
            later, and the dashboards read straight from it.
          </p>
        </div>
        <div className="flex flex-col">
          <span className="meta pb-2">try one</span>
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPrompt(p)}
              className="group flex min-h-11 items-center justify-between gap-4 border-t py-3 text-left text-sm outline-none transition-colors last:border-b hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground/80"
            >
              <span>{p}</span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </button>
          ))}
        </div>
        <dl className="meta flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
          <div className="flex gap-2"><dt>providers</dt><dd className="text-foreground">{providers}</dd></div>
          <div className="flex gap-2"><dt>models</dt><dd className="text-foreground">{count}</dd></div>
          <div className="flex gap-2"><dt>storage</dt><dd className="text-foreground">postgres via redis streams</dd></div>
          <div className="flex gap-2"><dt>identity</dt><dd className="text-foreground">this browser only</dd></div>
        </dl>
      </div>
    </div>
  )
}
