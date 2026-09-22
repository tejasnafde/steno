import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
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
} from "@/components/ui/sidebar"
import type { Conversation } from "@/lib/api"
import { relativeTime } from "@/lib/format"

type Props = {
  conversations: Conversation[]
  currentId: string | null
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export function ConversationList({ conversations, currentId, onOpen, onNew, onDelete }: Props) {
  return (
    <Sidebar>
      <SidebarHeader className="h-12 justify-center border-b">
        <Button variant="outline" size="sm" onClick={onNew}>
          <PlusIcon data-icon="inline-start" />
          New conversation
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="meta">conversations · {conversations.length}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.map((c) => (
                <SidebarMenuItem key={c.id} className="group/item">
                  <SidebarMenuButton isActive={c.id === currentId} onClick={() => onOpen(c.id)} className="h-auto py-2">
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="truncate">{c.title ?? "New conversation"}</span>
                      <span className="meta ml-auto shrink-0 tabular-nums">{relativeTime(c.updated_at)}</span>
                    </span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    aria-label={`Delete conversation: ${c.title ?? "untitled"}`}
                    className="opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    onClick={() => onDelete(c.id)}
                  >
                    <Trash2Icon />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="meta border-t normal-case tracking-normal">Conversations belong to this browser. Nothing to sign in to.</SidebarFooter>
    </Sidebar>
  )
}
