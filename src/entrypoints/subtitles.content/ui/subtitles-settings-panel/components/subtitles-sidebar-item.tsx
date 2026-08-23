import { IconBook, IconLoader2 } from "@tabler/icons-react"
import { useAtom, useAtomValue } from "jotai"
import { useRef, useState } from "react"
import { i18n } from "@/utils/i18n"
import { showAnchoredSubtitlesToast } from "@/utils/subtitles/toast"
import { sourceTrackAtom, subtitlesSidebarOpenAtom, subtitlesStore } from "../../../atoms"
import { useSubtitlesUI } from "../../subtitles-ui-context"
import { SubpageMenuEntry } from "./subpage-menu-entry"

export function SubtitlesSidebarItem() {
  const { supportsSidebar, hasSubtitlesAvailable } = useSubtitlesUI()
  const [isOpen, setOpen] = useAtom(subtitlesSidebarOpenAtom, { store: subtitlesStore })
  const sourceTrack = useAtomValue(sourceTrackAtom, { store: subtitlesStore })
  const [checking, setChecking] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)

  if (!supportsSidebar) {
    return null
  }

  const open = async () => {
    // A loaded track is proof the video has subtitles, so the probe below would
    // only re-answer a question already settled.
    if (sourceTrack.length > 0) {
      setOpen(true)
      return
    }

    setChecking(true)
    try {
      if (!(await hasSubtitlesAvailable())) {
        showAnchoredSubtitlesToast(i18n.t("subtitles.sidebar.needsSubtitles"), anchor.current)
        return
      }
      setOpen(true)
    } finally {
      setChecking(false)
    }
  }

  return (
    <SubpageMenuEntry
      ref={anchor}
      icon={
        checking ? <IconLoader2 className="size-4 animate-spin" /> : <IconBook className="size-4" />
      }
      label={i18n.t("subtitles.sidebar.menu.label")}
      onClick={() => (isOpen ? setOpen(false) : void open())}
      pressed={isOpen}
    />
  )
}
