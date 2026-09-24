"use client"

import { useCallback, useEffect, useState } from "react"
import { WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"

const ONLINE_CHECK_MS = 15000
const OFFLINE_CHECK_MS = 3000

async function canReachInternet() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  const target = supabaseUrl ? `${supabaseUrl}/auth/v1/health` : "https://www.gstatic.com/generate_204"

  try {
    await fetch(target, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch {
    return false
  }
}

export function InternetStatus() {
  const [isOffline, setIsOffline] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  const checkConnection = useCallback(async () => {
    const online = await canReachInternet()
    setIsOffline(!online)
    return online
  }, [])

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const online = await canReachInternet()
      if (!cancelled) setIsOffline(!online)
    }

    const handleOffline = () => setIsOffline(true)
    const handleOnline = () => {
      void check()
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    void check()

    const timer = window.setInterval(check, isOffline ? OFFLINE_CHECK_MS : ONLINE_CHECK_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
    }
  }, [isOffline])

  const retry = async () => {
    setIsRetrying(true)
    try {
      await checkConnection()
    } finally {
      setIsRetrying(false)
    }
  }

  if (!isOffline) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      aria-describedby="offline-description"
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-muted">
          <WifiOff className="size-10 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 id="offline-title" className="text-2xl font-semibold">
          No internet connection
        </h1>
        <p id="offline-description" className="mt-2 text-muted-foreground">
          Check your network and try again. The app will continue automatically when the connection is back.
        </p>
        <Button className="mt-6" onClick={retry} disabled={isRetrying}>
          {isRetrying ? "Checking..." : "Try again"}
        </Button>
      </div>
    </div>
  )
}
