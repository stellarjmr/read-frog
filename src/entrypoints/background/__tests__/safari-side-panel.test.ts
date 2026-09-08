import type { browser } from "#imports"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setupSidePanelMessageHandler } from "../side-panel"

describe("Safari panel tab", () => {
  beforeEach(() => vi.stubEnv("BROWSER", "safari"))
  afterEach(() => vi.unstubAllEnvs())

  function setup(tabs: { id: number; url: string }[] = []) {
    const extensionBrowser = {
      runtime: { getURL: (path: string) => `safari-web-extension://test${path}` },
      tabs: {
        query: vi.fn<(...args: any[]) => any>().mockResolvedValue(tabs),
        create: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: 1 }),
        update: vi.fn<(...args: any[]) => any>().mockResolvedValue({ id: 1 }),
      },
    }
    const register = vi.fn<(...args: any[]) => any>()
    setupSidePanelMessageHandler({
      extensionBrowser: extensionBrowser as unknown as typeof browser,
      logger: { warn: vi.fn<(...args: any[]) => any>(), error: vi.fn<(...args: any[]) => any>() },
      registerMessageHandler: register,
    })
    const handler = register.mock.calls[0]![1]
    return { extensionBrowser, handler }
  }

  it("opens the upstream panel in the sender window", async () => {
    const { extensionBrowser, handler } = setup()
    await expect(handler({ sender: { tab: { windowId: 7 } } })).resolves.toEqual({
      ok: true,
      action: "opened",
    })
    expect(extensionBrowser.tabs.create).toHaveBeenCalledWith({
      url: "safari-web-extension://test/sidepanel.html",
      windowId: 7,
    })
  })

  it("reuses an existing panel after a background restart", async () => {
    const { extensionBrowser, handler } = setup([
      { id: 5, url: "safari-web-extension://test/sidepanel.html" },
    ])
    await handler({ sender: {} })
    expect(extensionBrowser.tabs.update).toHaveBeenCalledWith(5, { active: true })
    expect(extensionBrowser.tabs.create).not.toHaveBeenCalled()
  })

  it("reports a tab creation failure to the caller", async () => {
    const { extensionBrowser, handler } = setup()
    extensionBrowser.tabs.create.mockRejectedValue(new Error("window closed"))
    await expect(handler({ sender: {} })).resolves.toEqual({
      ok: false,
      reason: "toggle-failed",
    })
  })
})
