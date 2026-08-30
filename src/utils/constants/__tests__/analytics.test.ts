import { describe, expect, it } from "vitest"
import { DEFAULT_ANALYTICS_ENABLED } from "../analytics"

describe("analytics constants", () => {
  it("enables analytics by default in Safari", () => {
    expect(DEFAULT_ANALYTICS_ENABLED).toBe(true)
  })
})
