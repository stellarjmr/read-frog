import type { GuideDictionaryNotebaseCompletionInput } from "@/utils/guide/dictionary-notebase"
import { browser } from "#imports"
import { env } from "@/env"
import { markGuideDictionaryNotebaseCompleted } from "@/utils/guide/dictionary-notebase"
import { logger } from "@/utils/logger"
import { onMessage, sendMessage } from "@/utils/message"

export function newUserGuide() {
  guideSafariToolbar()
  guideDictionaryNotebase()
}

export function guideSafariToolbar() {
  // Safari does not implement action.getUserSettings or
  // action.onUserSettingsChanged. Report the toolbar action as available so
  // the web guide does not show instructions for another browser's pin UI.
  onMessage("getPinState", () => true)
}

export async function completeGuideDictionaryNotebaseAndNotify(
  completion: GuideDictionaryNotebaseCompletionInput,
) {
  const state = await markGuideDictionaryNotebaseCompleted(completion)

  await notifyGuideDictionaryNotebaseStateChanged(state)
}

function guideDictionaryNotebase() {
  onMessage("completeGuideDictionaryNotebase", async (message) => {
    await completeGuideDictionaryNotebaseAndNotify(message.data)
  })
}

async function notifyGuideDictionaryNotebaseStateChanged(state: { completed: boolean }) {
  const tabs = await browser.tabs.query({
    url: env.WXT_OFFICIAL_SITE_ORIGINS.map((origin: string) => `${origin}/*`),
  })

  for (const tab of tabs) {
    if (!tab.id) {
      continue
    }

    void sendMessage("guideDictionaryNotebaseStateChanged", state, tab.id).catch((error) => {
      logger.warn("[NewUserGuide] Failed to notify guide dictionary Notebase state", error)
    })
  }
}
