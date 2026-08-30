import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  alarmsAddListener: vi.fn<(...args: any[]) => any>(),
  alarmsCreate: vi.fn<(...args: any[]) => any>(),
  alarmsGet: vi.fn<(...args: any[]) => any>(),
  cookiesGetAll: vi.fn<(...args: any[]) => any>(),
  loggerError: vi.fn<(...args: any[]) => any>(),
  loggerInfo: vi.fn<(...args: any[]) => any>(),
  loggerWarn: vi.fn<(...args: any[]) => any>(),
  storageGetItem: vi.fn<(...args: any[]) => any>(),
  storageSetItem: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("#imports", () => ({
  browser: {
    alarms: {
      create: mocks.alarmsCreate,
      get: mocks.alarmsGet,
      onAlarm: { addListener: mocks.alarmsAddListener },
    },
    cookies: { getAll: mocks.cookiesGetAll },
  },
  storage: {
    getItem: mocks.storageGetItem,
    setItem: mocks.storageSetItem,
  },
}))

vi.mock("wxt/browser", () => ({
  browser: {
    alarms: {
      create: mocks.alarmsCreate,
      get: mocks.alarmsGet,
      onAlarm: { addListener: mocks.alarmsAddListener },
    },
    cookies: { getAll: mocks.cookiesGetAll },
  },
}))

vi.mock("wxt/utils/storage", () => ({
  storage: {
    getItem: mocks.storageGetItem,
    setItem: mocks.storageSetItem,
  },
}))

vi.mock("@/env", () => ({
  env: { WXT_AUTH_COOKIE_DOMAINS: ["readfrog.app"] },
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}))

describe("Safari auth cookie monitor", () => {
  let storedSnapshot: string | null
  let cookies: Array<{
    domain: string
    name: string
    path: string
    storeId: string
    value: string
  }>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    storedSnapshot = null
    cookies = [
      {
        domain: ".readfrog.app",
        name: "better-auth.session_token",
        path: "/",
        storeId: "0",
        value: "first-session",
      },
      {
        domain: ".readfrog.app",
        name: "unrelated",
        path: "/",
        storeId: "0",
        value: "ignored",
      },
    ]

    mocks.cookiesGetAll.mockImplementation(async () => cookies)
    mocks.storageGetItem.mockImplementation(async () => storedSnapshot)
    mocks.storageSetItem.mockImplementation(async (_key, value) => {
      storedSnapshot = value as string
    })
    mocks.alarmsGet.mockResolvedValue(undefined)
    mocks.alarmsCreate.mockResolvedValue(undefined)
  })

  it("establishes a baseline and notifies only when an auth cookie value changes", async () => {
    const { checkSafariAuthCookies, onSafariAuthCookieChanged } =
      await import("../auth-cookie-monitor")
    const listener = vi.fn<() => void>()
    onSafariAuthCookieChanged(listener)

    await checkSafariAuthCookies()
    expect(listener).not.toHaveBeenCalled()
    expect(storedSnapshot).toContain("better-auth.session_token")
    expect(storedSnapshot).not.toContain("unrelated")

    await checkSafariAuthCookies()
    expect(listener).not.toHaveBeenCalled()

    cookies[0] = {
      domain: ".readfrog.app",
      name: "better-auth.session_token",
      path: "/",
      storeId: "0",
      value: "second-session",
    }
    await checkSafariAuthCookies()
    expect(listener).toHaveBeenCalledOnce()
  })

  it("checks immediately and schedules recurring Safari alarm checks", async () => {
    let alarmListener: ((alarm: { name: string }) => void) | undefined
    mocks.alarmsAddListener.mockImplementation((listener) => {
      alarmListener = listener
    })

    const { SAFARI_AUTH_COOKIE_ALARM, setupSafariAuthCookieMonitor } =
      await import("../auth-cookie-monitor")
    setupSafariAuthCookieMonitor()

    await vi.waitFor(() => expect(mocks.storageSetItem).toHaveBeenCalledOnce())
    expect(mocks.alarmsCreate).toHaveBeenCalledWith(SAFARI_AUTH_COOKIE_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: 1,
    })

    mocks.cookiesGetAll.mockClear()
    alarmListener?.({ name: "another-alarm" })
    expect(mocks.cookiesGetAll).not.toHaveBeenCalled()

    alarmListener?.({ name: SAFARI_AUTH_COOKIE_ALARM })
    await vi.waitFor(() => expect(mocks.cookiesGetAll).toHaveBeenCalledOnce())
  })

  it("keeps notifying other subscribers when one subscriber fails", async () => {
    const { checkSafariAuthCookies, onSafariAuthCookieChanged } =
      await import("../auth-cookie-monitor")
    const successfulListener = vi.fn<() => void>()
    onSafariAuthCookieChanged(() => Promise.reject(new Error("listener failed")))
    onSafariAuthCookieChanged(successfulListener)

    await checkSafariAuthCookies()
    cookies = []
    await checkSafariAuthCookies()

    expect(successfulListener).toHaveBeenCalledOnce()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "[AuthCookieMonitor] Change listener failed:",
      expect.any(Error),
    )
  })
})
