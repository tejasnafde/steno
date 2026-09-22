import { useState } from "react"
import { CheckIcon, CopyIcon, GitBranchIcon, PencilIcon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Props = {
  content: string
  signedIn: boolean
  onSignIn: () => void
  onFork?: () => void
  onRetry?: () => void
  onEdit?: () => void
}

export function MessageActions({ content, signedIn, onSignIn, onFork, onRetry, onEdit }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon-xs" aria-label={copied ? "Copied" : "Copy message"} onClick={copy} className="relative">
        <CopyIcon className={cn("absolute transition-[opacity,scale] duration-200", copied ? "scale-25 opacity-0" : "scale-100 opacity-100")} />
        <CheckIcon className={cn("transition-[opacity,scale] duration-200", copied ? "scale-100 opacity-100" : "scale-25 opacity-0")} />
      </Button>
      {onEdit && (
        <Button variant="ghost" size="icon-xs" aria-label="Edit and resend" onClick={onEdit}>
          <PencilIcon />
        </Button>
      )}
      {onRetry && (
        <Button variant="ghost" size="icon-xs" aria-label="Retry with the selected model" onClick={onRetry}>
          <RefreshCwIcon />
        </Button>
      )}
      {onFork &&
        (signedIn ? (
          <Button variant="ghost" size="icon-xs" aria-label="Branch from here" onClick={onFork}>
            <GitBranchIcon />
          </Button>
        ) : (
          <Popover>
            <PopoverTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Branch from here" />}>
              <GitBranchIcon />
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-72 flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Sign in to branch</span>
                <span className="text-sm text-muted-foreground">
                  A branch copies the conversation up to this reply into a new one, so you can take it somewhere else or ask another model.
                </span>
              </div>
              <Button size="sm" onClick={onSignIn}>
                Sign in with Google
              </Button>
            </PopoverContent>
          </Popover>
        ))}
    </div>
  )
}
