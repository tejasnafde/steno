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
      <SidebarHeader>
        <Button variant="outline" onClick={onNew}>
          <PlusIcon data-icon="inline-start" />
          New conversation
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.map((c) => (
                <SidebarMenuItem key={c.id} className="group/item">
                  <SidebarMenuButton isActive={c.id === currentId} onClick={() => onOpen(c.id)} className="h-auto py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{c.title ?? "New conversation"}</span>
                      <span className="text-xs text-muted-foreground">{relativeTime(c.updated_at)}</span>
                    </span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    aria-label="Delete conversation"
                    className="top-3 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"
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
      <SidebarFooter className="text-xs text-muted-foreground">Conversations belong to this browser. Nothing to sign in to.</SidebarFooter>
    </Sidebar>
  )
}
