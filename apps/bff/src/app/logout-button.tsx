'use client'

import { useState } from 'react'

export function LogoutButton() {
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    })
    // Local session is gone either way; hand off to Entra for the IdP session.
    const body = (await res.json().catch(() => ({}))) as { logoutUrl?: string }
    window.location.assign(body.logoutUrl ?? '/')
  }

  return (
    <button type="button" onClick={logout} disabled={busy}>
      Sign out
    </button>
  )
}
