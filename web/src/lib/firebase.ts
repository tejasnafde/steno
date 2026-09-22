import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth"

// Public web config for the "steno" app in the teejayproject Firebase project. Not a secret.
const app = initializeApp({
  apiKey: "AIzaSyDRNv2eMMX7DwBAGrDo3PGXaGwBqsygtvM",
  authDomain: "teejayproject.firebaseapp.com",
  projectId: "teejayproject",
  appId: "1:974343814740:web:9bb6b0aba2cdbe893e37c1",
})
const auth = getAuth(app)

export async function googleIdToken() {
  const result = await signInWithPopup(auth, new GoogleAuthProvider())
  return result.user.getIdToken()
}

export function firebaseSignOutQuietly() {
  return firebaseSignOut(auth).catch(() => undefined)
}
