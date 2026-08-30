import { beforeEach, describe, expect, it, vi } from "vitest"

const { onMessageMock } = vi.hoisted(() => ({
  onMessageMock: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("@/utils/message", () => ({
  onMessage: onMessageMock,
  sendMessage: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("@/utils/guide/dictionary-notebase", () => ({
  markGuideDictionaryNotebaseCompleted: vi.fn<(...args: any[]) => any>(),
}))

import { guideSafariToolbar } from "../new-user-guide"

describe("guideSafariToolbar", () => {
  beforeEach(() => {
    onMessageMock.mockReset()
  })

  it("reports the Safari toolbar action without unsupported pin-state APIs", () => {
    guideSafariToolbar()

    expect(onMessageMock).toHaveBeenCalledWith("getPinState", expect.any(Function))
    const handler = onMessageMock.mock.calls[0]?.[1] as (() => boolean) | undefined
    expect(handler?.()).toBe(true)
  })
})
