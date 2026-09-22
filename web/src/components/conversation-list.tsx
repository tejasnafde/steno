import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { Conversation } from "@/lib/api"

type Props = {
  conversations: Conversation[]
  currentId: string | null
  onOpen: (id: string) => void
  onCreate: () => void
}

export function ConversationList({ conversations, currentId, onOpen, onCreate }: Props) {
  return (
    <Sidebar>
      <SidebarHeader>
        <Button variant="outline" onClick={onCreate}>
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
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton isActive={c.id === currentId} onClick={() => onOpen(c.id)}>
                    <span className="truncate">{c.title ?? "New conversation"}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
