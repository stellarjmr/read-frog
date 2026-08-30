import { AUTH_COOKIE_PATTERNS } from "@read-frog/definitions"
import { browser, storage } from "#imports"
import { env } from "@/env"
import { logger } from "@/utils/logger"

export const SAFARI_AUTH_COOKIE_ALARM = "safari-auth-cookie-monitor"
export const AUTH_COOKIE_SNAPSHOT_KEY = "session:safariAuthCookieSnapshot" as const

const POLL_INTERVAL_MINUTES = 1
const listeners = new Set<() => Promise<void> | void>()
let checkInFlight: Promise<void> | undefined

function isAuthCookie(cookie: { name: string }) {
  return AUTH_COOKIE_PATTERNS.some((pattern) => cookie.name.includes(pattern))
}

async function readAuthCookieSnapshot() {
  const cookieGroups = await Promise.all(
    env.WXT_AUTH_COOKIE_DOMAINS.map((domain) => browser.cookies.getAll({ domain })),
  )

  const records = cookieGroups
    .flat()
    .filter(isAuthCookie)
    .map((cookie) => ({
      domain: cookie.domain,
      name: cookie.name,
      path: cookie.path,
      storeId: cookie.storeId,
      value: cookie.value,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))

  return JSON.stringify(records)
}

async function performAuthCookieCheck() {
  const nextSnapshot = await readAuthCookieSnapshot()
  const previousSnapshot = await storage.getItem<string>(AUTH_COOKIE_SNAPSHOT_KEY)

  if (previousSnapshot === nextSnapshot) {
    return
  }

  await storage.setItem(AUTH_COOKIE_SNAPSHOT_KEY, nextSnapshot)

  // Establish a baseline on first run. Session-backed consumers are empty at
  // this point, so there is nothing stale to invalidate.
  if (previousSnapshot === null || previousSnapshot === undefined) {
    return
  }

  logger.info("[AuthCookieMonitor] Safari auth cookie state changed")
  const results = await Promise.allSettled([...listeners].map(async (listener) => await listener()))
  for (const result of results) {
    if (result.status === "rejected") {
      logger.error("[AuthCookieMonitor] Change listener failed:", result.reason)
    }
  }
}

export function checkSafariAuthCookies() {
  checkInFlight ??= performAuthCookieCheck().finally(() => {
    checkInFlight = undefined
  })

  return checkInFlight
}

async function checkSafariAuthCookiesSafely() {
  try {
    await checkSafariAuthCookies()
  } catch (error) {
    logger.warn("[AuthCookieMonitor] Could not inspect Safari auth cookies:", error)
  }
}

export function onSafariAuthCookieChanged(listener: () => Promise<void> | void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setupSafariAuthCookieMonitor() {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SAFARI_AUTH_COOKIE_ALARM) {
      void checkSafariAuthCookiesSafely()
    }
  })

  void browser.alarms
    .get(SAFARI_AUTH_COOKIE_ALARM)
    .then((existingAlarm) => {
      if (!existingAlarm) {
        void browser.alarms.create(SAFARI_AUTH_COOKIE_ALARM, {
          delayInMinutes: POLL_INTERVAL_MINUTES,
          periodInMinutes: POLL_INTERVAL_MINUTES,
        })
      }
    })
    .catch((error) => {
      logger.warn("[AuthCookieMonitor] Could not schedule Safari cookie checks:", error)
    })

  void checkSafariAuthCookiesSafely()
}
