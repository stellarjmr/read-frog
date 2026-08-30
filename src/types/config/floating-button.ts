import z from "zod"

export const floatingButtonSides = ["left", "right"] as const
export type FloatingButtonSide = (typeof floatingButtonSides)[number]
export const floatingButtonSideSchema = z.enum(floatingButtonSides)

export const floatingButtonClickActions = ["translate"] as const
export type FloatingButtonClickAction = (typeof floatingButtonClickActions)[number]
// Safari has no WebExtensions side-panel API. Accept the removed value while
// importing an older config and normalize it to the only supported action.
export const floatingButtonClickActionSchema = z.preprocess(
  (value) => (value === "panel" ? "translate" : value),
  z.enum(floatingButtonClickActions),
)

export const floatingButtonSchema = z.object({
  enabled: z.boolean(),
  position: z.number().min(0).max(1),
  side: floatingButtonSideSchema,
  disabledFloatingButtonPatterns: z.array(z.string()),
  clickAction: floatingButtonClickActionSchema,
  locked: z.boolean(),
})

export type FloatingButtonConfig = z.infer<typeof floatingButtonSchema>
