import { useEffect, useState } from "react"
import { ArrowLeftIcon, PlusIcon, XIcon } from "lucide-react"

import { APP_NAME } from "@/components/site-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api"

export function AccessPage() {
  const [emails, setEmails] = useState<string[] | null>(null)
  const [me, setMe] = useState("")
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.allowlist().then((r) => { setEmails(r.emails); setMe(r.me) }, (e) => setError(e.message))
  }, [])

  const save = async (next: string[]) => {
    setSaving(true)
    setError(null)
    try {
      const r = await api.saveAllowlist(next)
      setEmails(r.emails)
      setDraft("")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <Button variant="ghost" size="sm" className="self-start" render={<a href="/admin/" />}>
        <ArrowLeftIcon data-icon="inline-start" />
        Dashboards
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Who can open /admin</CardTitle>
          <CardDescription>
            Cloudflare Access checks this list before anything under /admin loads. Signed in as {me || "..."}. Your own
            address cannot be removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not load or save</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {emails === null && !error ? (
            <Spinner />
          ) : (
            <div className="flex flex-wrap gap-2">
              {(emails ?? []).map((e) => (
                <Badge key={e} variant="secondary" className="gap-1 pr-1">
                  {e}
                  {e !== me && (
                    <button aria-label={`Remove ${e}`} className="rounded-sm hover:bg-foreground/10" onClick={() => save(emails!.filter((x) => x !== e))}>
                      <XIcon className="size-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <form
            className="w-full"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) save([...(emails ?? []), draft.trim()])
            }}
          >
            <InputGroup>
              <InputGroupInput type="email" autoComplete="email" placeholder="name@example.com" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={saving || emails === null} />
              <InputGroupAddon align="inline-end">
                <InputGroupButton type="submit" size="icon-xs" disabled={saving || !draft.trim()} aria-label="Add">
                  {saving ? <Spinner /> : <PlusIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </CardFooter>
      </Card>
      <p className="text-center text-xs text-muted-foreground">{APP_NAME}</p>
    </main>
  )
}
