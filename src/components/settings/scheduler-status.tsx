import { CalendarClock, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { SettingsCard } from "@/components/settings/settings-card";
import { InfoChip } from "@/components/visual/info-chip";
import { formatDateTime } from "@/lib/format";
import { SCHEDULER_GUIDE_URL } from "@/lib/scheduler";
import type { SchedulerStatus } from "@/lib/data/scheduler";

function ago(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Settings › Publishing: whether scheduled entries go live on the minute, and how to set it up. */
export function SchedulerStatusCard({
  status,
  endpoint,
}: {
  status: SchedulerStatus;
  /** Full URL of /api/cron/publish on this deployment. */
  endpoint: string;
}) {
  const { lastRun, connected, scheduledCount, nextScheduledAt, checkedAt: now } = status;
  return (
    <SettingsCard
      icon={CalendarClock}
      title="Scheduled publishing"
      description="How quickly scheduled entries go live and notify your website."
    >
      <div className="flex flex-col gap-4 text-sm" data-testid="scheduler-status">
        <InfoChip
          icon={connected ? CheckCircle2 : Clock}
          tone={connected ? "success" : "warning"}
          className="w-fit"
        >
          {connected ? "Running every minute" : "Only on visits and once a day"}
        </InfoChip>
        <p className="text-muted-foreground">
          {connected
            ? "Scheduled entries go live within a minute of their time, and your website's webhooks fire straight away."
            : "Without a scheduler, a scheduled entry goes live the next time someone opens Klipt or your website asks for content, or at the daily check at 06:00 UTC. Webhooks wait until then."}
        </p>
        <dl className="bg-card-nested grid gap-x-6 gap-y-2 rounded-[14px] p-4 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Last run</dt>
          <dd>
            {lastRun ? (
              <time dateTime={lastRun.at} title={formatDateTime(lastRun.at)}>
                {ago(lastRun.at, now)}
              </time>
            ) : (
              "Never"
            )}
          </dd>
          <dt className="text-muted-foreground">On this site</dt>
          <dd>
            {scheduledCount === 0
              ? "Nothing scheduled"
              : `${scheduledCount} scheduled${nextScheduledAt ? ` · next ${formatDateTime(nextScheduledAt)}` : ""}`}
          </dd>
        </dl>
        {!connected && (
          <div className="flex flex-col gap-2">
            <p className="font-medium">Set it up once, for every site</p>
            <p className="text-muted-foreground">
              Ask a free service such as cron-job.org to call this address every minute, with the
              header{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">Authorization: Bearer</code>{" "}
              and your <code className="bg-muted rounded px-1 py-0.5 text-xs">CRON_SECRET</code>.
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <code
                className="border-input bg-muted min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-xs"
                data-testid="scheduler-endpoint"
              >
                {endpoint}
              </code>
              <CopyButton value={endpoint} label="Copy address" />
            </div>
          </div>
        )}
        <a
          href={SCHEDULER_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex w-fit items-center gap-1 font-medium hover:underline"
        >
          Setup guide <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </SettingsCard>
  );
}
