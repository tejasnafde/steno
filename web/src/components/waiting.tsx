import { useEffect, useState } from "react"

import { Spinner } from "@/components/ui/spinner"

// Plain status that gets more specific the longer the first token takes. No cute verbs.
function phrase(seconds: number, model: string | null | undefined) {
  if (seconds < 1.5) return model ? `Sending to ${model}` : "Sending"
  if (seconds < 5) return "Thinking"
  if (seconds < 12) return "Still thinking. Reasoning models take a few seconds before the first word."
  return "Taking longer than usual. You can stop and retry with another model."
}

export function Waiting({ model }: { model?: string | null }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const started = performance.now()
    const id = setInterval(() => setSeconds((performance.now() - started) / 1000), 500)
    return () => clearInterval(id)
  }, [])

  return (
    <span role="status" className="flex items-center gap-2 text-muted-foreground">
      <Spinner />
      <span className="animate-in fade-in-0 duration-300" key={phrase(seconds, model)}>
        {phrase(seconds, model)}
      </span>
    </span>
  )
}
