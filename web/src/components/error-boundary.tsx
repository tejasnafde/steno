import { Component, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

type State = { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Empty className="h-svh">
        <EmptyHeader>
          <EmptyTitle>Something broke on this page</EmptyTitle>
          <EmptyDescription className="font-mono text-xs break-all">{this.state.error.message}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={() => location.reload()}>Reload</Button>
      </Empty>
    )
  }
}
