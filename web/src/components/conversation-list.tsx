import { useState } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, ChartLineIcon, ChevronsUpDownIcon, DownloadIcon, Link2Icon, Link2OffIcon, LogOutIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, ShieldIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

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
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar"
import { api, type Conversation, type Me } from "@/lib/api"
import { dateBucket } from "@/lib/format"

type Props = {
  conversations: Conversation[] | null
  currentId: string | null
  me: Me | null
  onOpen: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onArchive: (id: string, archived: boolean) => void
  onDelete: (id: string) => void
  onShare: (id: string) => Promise<string>
  onUnshare: (id: string) => void
  onSignIn: () => void
  onSignOut: () => void
}

const BUCKETS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const

export function ConversationList({ conversations, currentId, me, onOpen, onNew, onRename, onArchive, onDelete, onShare, onUnshare, onSignIn, onSignOut }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [showArchived, setShowArchived] = useState(false)

  const active = (conversations ?? []).filter((c) => !c.archived_at)
  const archived = (conversations ?? []).filter((c) => c.archived_at)

  const commitRename = (id: string) => {
    if (draft.trim()) onRename(id, draft.trim())
    setEditing(null)
  }

  const row = (c: Conversation) => (
    <SidebarMenuItem key={c.id} className="group/item">
      {editing === c.id ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitRename(c.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(c.id)
            if (e.key === "Escape") setEditing(null)
          }}
          aria-label="Conversation title"
          className="h-8"
        />
      ) : (
        <SidebarMenuButton isActive={c.id === currentId} onClick={() => onOpen(c.id)}>
          <span className="truncate">{c.title ?? "New conversation"}</span>
        </SidebarMenuButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuAction aria-label="Conversation options" className="opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 data-open:opacity-100" />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setDraft(c.title ?? "")
                setEditing(c.id)
              }}
            >
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive(c.id, !c.archived_at)}>
              {c.archived_at ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {c.archived_at ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={api.exportUrl(c.id)} download />}>
              <DownloadIcon />
              Download as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                const url = await onShare(c.id)
                await navigator.clipboard.writeText(url)
                toast.success("Link copied. Anyone with it can read this conversation.")
              }}
            >
              <Link2Icon />
              {c.share_token ? "Copy share link" : "Share a read-only link"}
            </DropdownMenuItem>
            {c.share_token && (
              <DropdownMenuItem
                onClick={() => {
                  onUnshare(c.id)
                  toast("Sharing turned off")
                }}
              >
                <Link2OffIcon />
                Stop sharing
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(c.id)}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )

  return (
    <Sidebar>
      <SidebarHeader className="h-12 justify-center border-b">
        <Button variant="outline" size="sm" onClick={onNew}>
          <PlusIcon data-icon="inline-start" />
          New conversation
        </Button>
      </SidebarHeader>
      <SidebarContent>
        {conversations === null ? (
          <SidebarGroup>
            <SidebarGroupLabel>Today</SidebarGroupLabel>
            <SidebarMenu>
              {[0, 1, 2].map((i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          <>
            {active.length === 0 && (
              <SidebarGroup>
                <SidebarGroupLabel>No conversations yet</SidebarGroupLabel>
              </SidebarGroup>
            )}
            {BUCKETS.map((bucket) => {
              const items = active.filter((c) => dateBucket(c.updated_at) === bucket)
              if (items.length === 0) return null
              return (
                <SidebarGroup key={bucket}>
                  <SidebarGroupLabel>{bucket}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>{items.map(row)}</SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )
            })}
            {archived.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel
                  render={<button type="button" onClick={() => setShowArchived((v) => !v)} className="w-full cursor-pointer text-left" />}
                >
                  Archived · {archived.length} {showArchived ? "▾" : "▸"}
                </SidebarGroupLabel>
                {showArchived && (
                  <SidebarGroupContent>
                    <SidebarMenu>{archived.map(row)}</SidebarMenu>
                  </SidebarGroupContent>
                )}
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t">
        {me?.user ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<SidebarMenuButton size="lg" aria-label="Account" className="data-open:bg-sidebar-accent" />}
            >
              <Avatar className="size-8">
                <AvatarImage src={me.user.picture ?? undefined} alt="" />
                <AvatarFallback>{(me.user.name ?? me.user.email).slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                <span className="truncate text-sm font-medium">{me.user.name ?? me.user.email}</span>
                <span className="truncate text-xs text-muted-foreground">{me.user.email}</span>
              </span>
              <ChevronsUpDownIcon className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-56">
              <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{me.user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {me.admin && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem render={<a href="/admin/" target="_blank" rel="noreferrer" />}>
                      <ChartLineIcon />
                      Dashboards
                    </DropdownMenuItem>
                    <DropdownMenuItem render={<a href="/admin/access" />}>
                      <ShieldIcon />
                      Dashboard access
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onSignOut}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" onClick={onSignIn} disabled={me === null}>
            Sign in
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
