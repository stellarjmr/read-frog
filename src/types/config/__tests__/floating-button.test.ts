import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  floatingButtonClickActionSchema,
  floatingButtonSchema,
  floatingButtonSideSchema,
} from "../floating-button"

describe("floating button config validation", () => {
  it.each(["left", "right"])("allows the %s side", (side) => {
    expect(floatingButtonSideSchema.safeParse(side).success).toBe(true)
  })

  it("rejects unknown sides", () => {
    expect(floatingButtonSideSchema.safeParse("center").success).toBe(false)
  })

  it("allows the translate click action", () => {
    expect(floatingButtonClickActionSchema.parse("translate")).toBe("translate")
  })

  it("normalizes the removed panel action from older configs", () => {
    expect(floatingButtonClickActionSchema.parse("panel")).toBe("translate")
  })

  it("rejects unknown click actions", () => {
    expect(floatingButtonClickActionSchema.safeParse("open").success).toBe(false)
  })

  it("accepts the default floating button config", () => {
    expect(floatingButtonSchema.safeParse(DEFAULT_CONFIG.floatingButton).success).toBe(true)
  })
})
