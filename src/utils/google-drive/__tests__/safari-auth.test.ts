import { afterEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"

const identity = browser.identity

describe("Google Drive without browser.identity", () => {
  afterEach(() => {
    Object.defineProperty(browser, "identity", { value: identity, configurable: true })
    vi.resetModules()
  })

  it("loads settings modules safely and rejects only a requested sign-in", async () => {
    Object.defineProperty(browser, "identity", { value: undefined, configurable: true })
    const auth = await import("../auth")
    expect(auth.isGoogleDriveAuthSupported()).toBe(false)
    await expect(auth.authenticateGoogleDriveAndSaveTokenToStorage()).rejects.toThrow(
      "Use file export/import",
    )
  })
})
