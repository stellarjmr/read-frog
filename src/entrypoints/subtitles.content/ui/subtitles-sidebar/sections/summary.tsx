import { IconFileTextAi } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { match } from "ts-pattern"
import { browser } from "#imports"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Button } from "@/components/ui/base-ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/base-ui/empty"
import { Spinner } from "@/components/ui/base-ui/spinner"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import {
  checkVideoSummaryAvailability,
  providerIdentity,
  videoSummaryQueryKey,
} from "@/utils/subtitles/video-summary"
import { currentVideoIdAtom, subtitlesStore } from "../../../atoms"
import { useSubtitlesUI } from "../../subtitles-ui-context"

function StatusCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
}) {
  return (
    <Empty className="min-h-full p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle className="font-normal">{title}</EmptyTitle>
      </EmptyHeader>
      {children}
    </Empty>
  )
}

export function SummarySection() {
  const { generateVideoSummary } = useSubtitlesUI()
  const language = useAtomValue(configFieldsAtomMap.language)
  const videoSubtitles = useAtomValue(configFieldsAtomMap.videoSubtitles)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const videoId = useAtomValue(currentVideoIdAtom, { store: subtitlesStore })

  // Owned here rather than by the menu entry: the transcript tab needs no
  // model, so an unusable provider must not keep the panel shut.
  // Neither the key nor the freshness may be pinned to the id alone: repairing
  // the provider, or a quota that frees up, has to be able to reach this.
  const provider = useQuery({
    queryKey: [
      "subtitles",
      "summary-provider",
      providerIdentity(providersConfig, videoSubtitles.providerId),
    ],
    queryFn: checkVideoSummaryAvailability,
    retry: false,
    meta: { suppressToast: true },
  })

  const query = useQuery({
    queryKey: videoSummaryQueryKey(
      videoId,
      language.targetCode,
      providersConfig,
      videoSubtitles.providerId,
    ),
    enabled: provider.data?.status === "ok",
    queryFn: async () => {
      const summary = await generateVideoSummary()
      if (!summary) {
        throw new Error("Empty summary")
      }
      return summary
    },
    retry: false,
    staleTime: Infinity,
    // Default GC drops a finished summary five minutes after the sidebar closes.
    gcTime: Infinity,
    meta: { suppressToast: true },
  })

  if (provider.status === "error") {
    return (
      <StatusCard icon={<IconFileTextAi />} title={i18n.t("subtitles.sidebar.summary.failedTitle")}>
        <Button type="button" variant="brand" size="sm" onClick={() => void provider.refetch()}>
          {i18n.t("subtitles.sidebar.summary.retry")}
        </Button>
      </StatusCard>
    )
  }

  if (provider.data && provider.data.status !== "ok") {
    return (
      match(provider.data)
        .with({ status: "needsModel" }, () => (
          <StatusCard
            icon={<IconFileTextAi />}
            title={i18n.t("subtitles.sidebar.summary.needsModel")}
          >
            <Button
              type="button"
              variant="brand"
              size="sm"
              onClick={() =>
                void sendMessage("openPage", {
                  url: browser.runtime.getURL("/options.html#/api-providers"),
                  active: true,
                })
              }
            >
              {i18n.t("subtitles.sidebar.summary.openSettings")}
            </Button>
          </StatusCard>
        ))
        // Already actionable; a settings link would point away from it.
        .with({ status: "hostedUnavailable" }, ({ message }) => (
          <StatusCard icon={<IconFileTextAi />} title={message} />
        ))
        .exhaustive()
    )
  }

  return match(query)
    .with({ status: "pending" }, () => (
      <StatusCard icon={<Spinner />} title={i18n.t("subtitles.sidebar.summary.generating")} />
    ))
    .with({ status: "error" }, () => (
      <StatusCard icon={<IconFileTextAi />} title={i18n.t("subtitles.sidebar.summary.failedTitle")}>
        <Button type="button" variant="brand" size="sm" onClick={() => void query.refetch()}>
          {i18n.t("subtitles.sidebar.summary.retry")}
        </Button>
      </StatusCard>
    ))
    .with({ status: "success" }, ({ data }) => (
      <div className="px-4 pt-1 pb-4">
        <MarkdownRenderer content={data} />
      </div>
    ))
    .exhaustive()
}
