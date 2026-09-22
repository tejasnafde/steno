import { useCallback, useEffect, useState } from "react"

import { api, type Me } from "@/lib/api"
import { firebaseSignOutQuietly, googleIdToken } from "@/lib/firebase"

const NOBODY: Me = { user: null, admin: false }

export function useAuth() {
  const [me, setMe] = useState<Me | null>(null) // null while loading

  useEffect(() => {
    api.me().then(setMe, () => setMe(NOBODY))
  }, [])

  const signIn = useCallback(async () => {
    const token = await googleIdToken()
    setMe(await api.signIn(token))
  }, [])

  const signOut = useCallback(async () => {
    await api.signOut()
    await firebaseSignOutQuietly()
    setMe(NOBODY)
  }, [])

  return { me, signIn, signOut }
}
