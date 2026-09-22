import { ChartLineIcon, MoonIcon, ShieldIcon, SunIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export const APP_NAME = "Steno"

type Props = { title: string | null; streaming: boolean }

export function SiteHeader({ title, streaming }: Props) {
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="data-vertical:h-4 data-vertical:self-center" />
      <div className="flex items-baseline gap-2">
        <span className="font-semibold tracking-tight">{APP_NAME}</span>
        <span className="meta hidden sm:inline">inference recorder</span>
      </div>
      {title && (
        <>
          <Separator orientation="vertical" className="hidden data-vertical:h-4 data-vertical:self-center md:block" />
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">{title}</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        <span className="meta flex items-center gap-1.5 pr-2" aria-live="polite">
          <span className={streaming ? "size-1.5 rounded-full bg-signal animate-pulse motion-reduce:animate-none" : "size-1.5 rounded-full bg-border"} />
          {streaming ? "rec" : "idle"}
        </span>
        <Button variant="ghost" size="sm" render={<a href="/admin/" target="_blank" rel="noreferrer" />}>
          <ChartLineIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Dashboards</span>
        </Button>
        <Button variant="ghost" size="sm" render={<a href="/admin/access" />}>
          <ShieldIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Access</span>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  )
}
