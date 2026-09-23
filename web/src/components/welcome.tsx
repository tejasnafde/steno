import { ChevronRightIcon } from "lucide-react"


const PROMPTS = [
  "Explain Redis consumer groups in three short bullets.",
  "What is the difference between p50 and p95 latency? Two sentences.",
  "Write a Python function that redacts email addresses, with a docstring.",
]

type Props = { onPrompt: (content: string) => void }

export function Welcome({ onPrompt }: Props) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-8">
      <div className="mx-auto my-auto flex w-full max-w-3xl flex-col gap-10 [&>*]:animate-in [&>*]:fade-in-0 [&>*]:slide-in-from-bottom-2 [&>*]:fill-mode-both [&>*]:duration-300 [&>*:nth-child(2)]:delay-100 motion-reduce:[&>*]:animate-none">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">Chat with any model. Every reply comes with its receipt.</h1>
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
