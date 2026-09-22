import { ChartLineIcon, LogOutIcon, MoonIcon, ShieldIcon, SunIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { Me } from "@/lib/api"

export const APP_NAME = "Steno"

type Props = { title: string | null; streaming: boolean; me: Me | null; onSignIn: () => void; onSignOut: () => void }

export function SiteHeader({ title, streaming, me, onSignIn, onSignOut }: Props) {
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  const user = me?.user

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
        <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Account" />}>
              <Avatar className="size-6">
                <AvatarImage src={user.picture ?? undefined} alt="" />
                <AvatarFallback>{(user.name ?? user.email).slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate">{user.name ?? user.email}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {me?.admin && (
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<a href="/admin/" target="_blank" rel="noreferrer" />}>
                    <ChartLineIcon />
                    Dashboards
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<a href="/admin/access" />}>
                    <ShieldIcon />
                    Who can open dashboards
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              )}
              {me?.admin && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onSignOut}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" size="sm" onClick={onSignIn} disabled={me === null}>
            Sign in with Google
          </Button>
        )}
      </div>
    </header>
  )
}
