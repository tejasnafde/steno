import { MoonIcon, SunIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export const APP_NAME = "Steno"

type Props = { title: string | null; streaming: boolean }

export function SiteHeader({ title, streaming }: Props) {
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="data-vertical:h-4 data-vertical:self-center" />
      <span className="font-semibold tracking-tight">{APP_NAME}</span>
      {title && (
        <>
          <Separator orientation="vertical" className="hidden data-vertical:h-4 data-vertical:self-center md:block" />
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">{title}</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        {streaming && (
          <span className="flex items-center gap-1.5 pr-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="size-1.5 rounded-full bg-signal animate-pulse motion-reduce:animate-none" />
            Recording
          </span>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")} className="relative">
          <SunIcon className={cn("absolute transition-[opacity,scale,rotate] duration-300", dark ? "scale-100 opacity-100" : "scale-25 opacity-0 rotate-90")} />
          <MoonIcon className={cn("transition-[opacity,scale,rotate] duration-300", dark ? "scale-25 opacity-0 -rotate-90" : "scale-100 opacity-100")} />
        </Button>
      </div>
    </header>
  )
}
