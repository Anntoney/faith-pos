/**
 * Global error handler for Supabase auth errors
 * This prevents unhandled promise rejections from cluttering logs
 *
 * Guarded so HMR / Turbopack re-imports of layout don't stack listeners
 * (MaxListenersExceededWarning on process).
 */

const GLOBAL_FLAG = "__faithPosErrorHandlersRegistered__"

declare global {
  // eslint-disable-next-line no-var
  var __faithPosErrorHandlersRegistered__: boolean | undefined
}

function isAuthRefreshError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || ""
  const errorCode = error?.code || ""
  const errorName = error?.name || ""

  return (
    errorName === "AuthApiError" &&
    (errorMessage.includes("refresh_token_not_found") ||
      errorMessage.includes("invalid refresh token") ||
      errorCode === "refresh_token_not_found")
  )
}

if (typeof process !== "undefined" && !globalThis[GLOBAL_FLAG]) {
  globalThis[GLOBAL_FLAG] = true

  process.on("unhandledRejection", (reason: any) => {
    // Suppress refresh_token_not_found errors - they're handled by proxy
    if (isAuthRefreshError(reason)) {
      return
    }

    console.error("Unhandled Rejection:", reason)
  })

  process.on("uncaughtException", (error: any) => {
    if (isAuthRefreshError(error)) {
      return
    }

    console.error("Uncaught Exception:", error)
  })
}
