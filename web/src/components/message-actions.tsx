import { useState } from "react"
import { CheckIcon, CopyIcon, GitBranchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Props = { content: string; canFork: boolean; signedIn: boolean; onFork: () => void; onSignIn: () => void }

export function MessageActions({ content, canFork, signedIn, onFork, onSignIn }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon-xs" aria-label={copied ? "Copied" : "Copy message"} onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      {canFork &&
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
