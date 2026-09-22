import { ChartLineIcon, MoonIcon, ShieldIcon, SunIcon } from "lucide-react"

import { ModelPicker } from "@/components/model-picker"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { Models } from "@/lib/api"

export const APP_NAME = "llmlog"

type Props = {
  models: Models
  provider: string
  model: string
  onProvider: (provider: string) => void
  onModel: (model: string) => void
}

export function SiteHeader(props: Props) {
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
      <span className="font-semibold tracking-tight">{APP_NAME}</span>
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
      <ModelPicker {...props} />
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" render={<a href="/admin/" target="_blank" rel="noreferrer" />}>
          <ChartLineIcon data-icon="inline-start" />
          Dashboards
        </Button>
        <Button variant="ghost" size="sm" render={<a href="/admin/access" />}>
          <ShieldIcon data-icon="inline-start" />
          Access
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  )
}
