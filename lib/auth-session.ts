import { signOut } from "firebase/auth"
import { auth } from "./firebase"

/** End the current Firebase session (no-op if already signed out). */
export async function terminatePortalSession(): Promise<void> {
  try {
    await signOut(auth)
  } catch {
    // Already signed out or auth unavailable.
  }
}
