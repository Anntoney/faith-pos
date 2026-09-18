"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DollarSign, RotateCcw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

import { REVENUE_RESET_SETTING_KEY } from "@/lib/constants/dashboard"

export function RevenueStatCard({ value }: { value: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleReset = async () => {
    setIsResetting(true)
    setError(null)

    try {
      const supabase = createClient()
      const resetAt = new Date().toISOString()

      const { data: existing, error: fetchError } = await supabase
        .from("system_settings")
        .select("id")
        .eq("setting_key", REVENUE_RESET_SETTING_KEY)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (existing) {
        const { error: updateError } = await supabase
          .from("system_settings")
          .update({ setting_value: resetAt, updated_at: resetAt })
          .eq("setting_key", REVENUE_RESET_SETTING_KEY)

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from("system_settings").insert({
          setting_key: REVENUE_RESET_SETTING_KEY,
          setting_value: resetAt,
        })

        if (insertError) throw insertError
      }

      setConfirmOpen(false)
      router.refresh()
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to reset revenue"
      setError(message)
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <>
      <Card className="hover-lift">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          <div className="rounded-full p-2.5 bg-gradient-to-br from-primary/20 to-primary/5 bg-primary/10 shadow-sm">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
            {value}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              setError(null)
              setConfirmOpen(true)
            }}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset Revenue
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Total Revenue?</DialogTitle>
            <DialogDescription>
              This sets Total Revenue (and Total Sales on the dashboard) back to zero and starts counting from
              new sales only. Existing sales records are kept — nothing is deleted.
            </DialogDescription>
          </DialogHeader>
          {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-3 rounded-md">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={isResetting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleReset} disabled={isResetting}>
              {isResetting ? "Resetting..." : "Reset & Start Fresh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
