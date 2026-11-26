"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  Box,
  Check,
  Code2,
  FileText,
  Loader2,
  Newspaper,
  PenLine,
  LifeBuoy,
  ShoppingBag,
  Sparkles,
  Store,
  Briefcase,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import {
  chooseBuildingAction,
  chooseRoleAction,
  createFirstSiteAction,
  finishOnboardingAction,
  skipOnboardingAction,
  type ChoiceState,
  type FirstSiteState,
} from "@/app/(auth)/welcome/actions";
import { inviteMemberAction, type InviteState } from "@/app/(site)/sites/[siteId]/team/actions";
import {
  createApiKeyAction,
  type CreateApiKeyState,
} from "@/app/(site)/sites/[siteId]/settings/integrations/actions";
import { CopyButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { AuthCard, AuthHeading } from "@/components/onboarding/auth-card";
import {
  BuildingScene,
  ConnectScene,
  PeopleScene,
  RoleScene,
  SiteScene,
} from "@/components/onboarding/scenes";
import { Button } from "@/components/ui/button";
import {
  BUILDINGS,
  BUILDING_KEYS,
  ROLES,
  ROLE_KEYS,
  stepsFor,
  type OnboardingBuilding,
  type OnboardingRole,
  type OnboardingStep,
} from "@/lib/onboarding";
import { INVITABLE_ROLES, ROLE_DESCRIPTIONS, type InvitableRole } from "@/lib/team";
import { ROLE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE_ICONS: Record<OnboardingRole, LucideIcon> = {
  writer: PenLine,
  editor: UserRoundCheck,
  developer: Code2,
  agency: Briefcase,
  owner: Store,
  other: Sparkles,
};

const BUILDING_ICONS: Record<OnboardingBuilding, LucideIcon> = {
  blog: Newspaper,
  company: FileText,
  docs: LifeBuoy,
  store: ShoppingBag,
  other: Box,
};

interface Props {
  step: OnboardingStep;
  role: OnboardingRole | null;
  building: OnboardingBuilding | null;
  site: { id: string; name: string; domain: string | null } | null;
  joined: { id: string; name: string } | null;
  emailEnabled: boolean;
  apiBase: string;
}

/** One step of the welcome flow, in the sign-in card, with its illustration. */
export function WelcomeFlow(props: Props) {
  const { step, joined } = props;
  const steps = stepsFor(Boolean(joined));
  const index = steps.indexOf(step);
  const [role, setRole] = useState<OnboardingRole | null>(props.role);
  const [building, setBuilding] = useState<OnboardingBuilding | null>(props.building);
  const [siteName, setSiteName] = useState(props.site?.name ?? "");
  const [domain, setDomain] = useState(props.site?.domain ?? "");

  const visual = {
    role: <RoleScene role={role} />,
    building: <BuildingScene building={building} />,
    site: <SiteScene name={siteName} domain={domain} />,
    team: <PeopleScene />,
    connect: <ConnectScene />,
  }[step];

  return (
    <AuthCard visual={visual} wide logoHref="/welcome">
      <div className="flex items-center justify-between gap-4">
        <Progress index={index} total={steps.length} />
        {!joined && (
          <form action={skipOnboardingAction}>
            {props.site && <input type="hidden" name="site" value={props.site.id} />}
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
            >
              Skip for now
            </button>
          </form>
        )}
      </div>
      <div className="mt-8">
        {step === "role" && <RoleStep role={role} onRole={setRole} joined={joined} />}
        {step === "building" && <BuildingStep building={building} onBuilding={setBuilding} />}
        {step === "site" && (
          <SiteStep
            site={props.site}
            name={siteName}
            domain={domain}
            onName={setSiteName}
            onDomain={setDomain}
          />
        )}
        {step === "team" && props.site && (
          <TeamStep siteId={props.site.id} emailEnabled={props.emailEnabled} />
        )}
        {step === "connect" && props.site && (
          <ConnectStep siteId={props.site.id} apiBase={props.apiBase} />
        )}
      </div>
    </AuthCard>
  );
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-8 rounded-full transition-colors sm:w-10",
              i < index ? "bg-foreground" : i === index ? "bg-primary" : "bg-card-nested",
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {index + 1} of {total}
      </p>
    </div>
  );
}

/** A choice card (images 1 and 3): a real radio, so arrow keys move between them. */
function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  icon: Icon,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 transition-colors",
        "hover:border-card-border-hover has-focus-visible:ring-ring/50 has-focus-visible:ring-[3px]",
        checked ? "border-primary bg-primary-soft/40" : "bg-surface-card",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
        required
      />
      <span
        aria-hidden
        className={cn(
          "grid size-9 place-items-center rounded-xl transition-colors",
          checked ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary-strong",
        )}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs leading-relaxed">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute top-3 right-3 grid size-5 place-items-center rounded-full border transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "bg-background",
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
    </label>
  );
}

function Footer({
  back,
  pending,
  label = "Continue",
  disabled,
  children,
}: {
  back?: string;
  pending?: boolean;
  label?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      {back ? (
        <Button asChild variant="outline" size="lg">
          <Link href={back}>Back</Link>
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        {children}
        <Button type="submit" size="lg" disabled={pending || disabled}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {label}
        </Button>
      </div>
    </div>
  );
}

function RoleStep({
  role,
  onRole,
  joined,
}: {
  role: OnboardingRole | null;
  onRole: (role: OnboardingRole) => void;
  joined: { id: string; name: string } | null;
}) {
  const [state, action, pending] = useActionState<ChoiceState, FormData>(chooseRoleAction, {});
  return (
    <form action={action}>
      <AuthHeading
        title="What best describes you?"
        description={
          joined
            ? `One question before you open ${joined.name}. It helps Klipt show you the right things first.`
            : "It helps Klipt show you the right things first. You can't get it wrong."
        }
      />
      {joined && <input type="hidden" name="joined" value={joined.id} />}
      {state.error && <InlineAlert className="mt-6">{state.error}</InlineAlert>}
      <fieldset className="mt-6">
        <legend className="sr-only">Your role</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROLE_KEYS.map((key) => (
            <ChoiceCard
              key={key}
              name="role"
              value={key}
              checked={role === key}
              onChange={() => onRole(key)}
              icon={ROLE_ICONS[key]}
              title={ROLES[key].label}
              description={ROLES[key].description}
            />
          ))}
        </div>
      </fieldset>
      <Footer
        pending={pending}
        disabled={!role}
        label={joined ? `Open ${joined.name}` : "Continue"}
      />
    </form>
  );
}

function BuildingStep({
  building,
  onBuilding,
}: {
  building: OnboardingBuilding | null;
  onBuilding: (building: OnboardingBuilding) => void;
}) {
  const [state, action, pending] = useActionState<ChoiceState, FormData>(chooseBuildingAction, {});
  return (
    <form action={action}>
      <AuthHeading
        title="What are you building?"
        description="Klipt sets up your first site to match. Everything it adds can be changed later."
      />
      {state.error && <InlineAlert className="mt-6">{state.error}</InlineAlert>}
      <fieldset className="mt-6">
        <legend className="sr-only">What you&apos;re building</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {BUILDING_KEYS.map((key) => (
            <ChoiceCard
              key={key}
              name="building"
              value={key}
              checked={building === key}
              onChange={() => onBuilding(key)}
              icon={BUILDING_ICONS[key]}
              title={BUILDINGS[key].label}
              description={BUILDINGS[key].description}
            />
          ))}
        </div>
      </fieldset>
      <div aria-live="polite" className="bg-card-nested mt-4 min-h-[76px] rounded-[14px] px-4 py-3">
        {building ? (
          <>
            <p className="text-sm font-medium">We&apos;ll set up:</p>
            <ul className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-sm">
              {BUILDINGS[building].setsUp.map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <Check className="text-success size-3.5 shrink-0" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Choose one to see what Klipt sets up.</p>
        )}
      </div>
      <Footer back="/welcome?step=role" pending={pending} disabled={!building} />
    </form>
  );
}

function SiteStep({
  site,
  name,
  domain,
  onName,
  onDomain,
}: {
  site: { id: string; name: string } | null;
  name: string;
  domain: string;
  onName: (value: string) => void;
  onDomain: (value: string) => void;
}) {
  const [state, action, pending] = useActionState<FirstSiteState, FormData>(createFirstSiteAction, {
    values: { name, domain },
  });

  if (site) {
    return (
      <div>
        <AuthHeading
          title="Your site is ready"
          description="You can rename it any time in Settings."
        />
        <div className="bg-card-nested mt-6 flex items-center gap-3 rounded-[14px] px-4 py-3">
          <Check className="text-success size-4 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">{site.name}</span> was created.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="lg">
            <Link href="/welcome?step=building">Back</Link>
          </Button>
          <Button asChild size="lg">
            <Link href={`/welcome?step=team&site=${site.id}`}>Continue</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action}>
      <AuthHeading
        title="Create your first site"
        description="You'll be the owner. A site is one website's content, team and settings."
      />
      <div className="mt-6 flex max-w-md flex-col gap-4">
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <FormField
          id="name"
          name="name"
          label="Site name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          error={state.errors?.name}
          hint="Shown to your team in Klipt. You can change it later."
          maxLength={80}
          autoComplete="off"
          required
          autoFocus
        />
        <FormField
          id="domain"
          name="domain"
          label="Primary domain"
          value={domain}
          onChange={(event) => onDomain(event.target.value)}
          error={state.errors?.domain}
          hint="For example, example.com. You can add it later in Settings → Domains."
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <Footer back="/welcome?step=building" pending={pending} label="Create site" />
    </form>
  );
}

function TeamStep({ siteId, emailEnabled }: { siteId: string; emailEnabled: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMemberAction, {
    values: { email: "", role: "editor" },
  });
  const [invited, setInvited] = useState<NonNullable<InviteState["invite"]>[]>([]);
  const [inviteRole, setInviteRole] = useState<InvitableRole>("editor");
  // Keep every invitation made on this step, newest last.
  const last = state.invite;
  if (last && !invited.some((item) => item.url === last.url)) setInvited([...invited, last]);

  const next = `/welcome?step=connect&site=${siteId}`;
  return (
    <div>
      <AuthHeading
        title="Invite your team"
        description={
          emailEnabled
            ? "We'll email each person a link to join. You can skip this and invite people later from Team."
            : "You'll get a link to send each person. You can skip this and invite people later from Team."
        }
      />
      <form action={action} key={invited.length} className="mt-6 flex max-w-xl flex-col gap-4">
        <input type="hidden" name="siteId" value={siteId} />
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-start">
          <FormField
            id="invite-email"
            name="email"
            type="email"
            label="Email"
            defaultValue={state.invite ? "" : state.values.email}
            error={state.errors?.email}
            autoComplete="off"
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as InvitableRole)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-lg border px-2 text-sm outline-none focus-visible:ring-[3px]"
            >
              {INVITABLE_ROLES.map((key: InvitableRole) => (
                <option key={key} value={key}>
                  {ROLE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" className="h-10 sm:mt-[26px]" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {emailEnabled ? "Send invite" : "Create link"}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {ROLE_DESCRIPTIONS[inviteRole]} You can change roles later in Team.
        </p>
      </form>

      {invited.length > 0 && (
        <ul aria-label="Invited" className="mt-6 flex max-w-xl flex-col gap-2">
          {invited.map((item) => (
            <li
              key={item.url}
              className="bg-card-nested flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] px-4 py-3"
            >
              <Check className="text-success size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{item.email}</span>
                <span className="text-muted-foreground"> · {ROLE_LABELS[item.role]}</span>
              </span>
              {item.emailed ? (
                <span className="text-muted-foreground text-xs">Emailed</span>
              ) : (
                <CopyButton value={item.url} label="Copy link" />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="lg">
          <Link href={`/welcome?step=site&site=${siteId}`}>Back</Link>
        </Button>
        <Button asChild size="lg" variant={invited.length > 0 ? "default" : "outline"}>
          <Link href={next}>{invited.length > 0 ? "Continue" : "Skip this step"}</Link>
        </Button>
      </div>
    </div>
  );
}

function ConnectStep({ siteId, apiBase }: { siteId: string; apiBase: string }) {
  const [state, action, pending] = useActionState<CreateApiKeyState, FormData>(createApiKeyAction, {
    values: { name: "Website" },
  });
  const created = state.created;
  const snippet = `// app/page.tsx (Next.js)
const res = await fetch("${apiBase}/entries?type=post", {
  headers: { Authorization: \`Bearer \${process.env.KLIPT_API_KEY}\` },
});
const { data: posts } = await res.json();`;

  return (
    <div>
      <AuthHeading
        title="Connect your website"
        description="Your website shows Klipt's content with its own design. It asks Klipt for published content with an API key."
      />
      {created ? (
        <div className="mt-6 flex max-w-xl flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="api-key" className="text-sm font-medium">
              Your API key
            </label>
            <div className="flex gap-2">
              <input
                id="api-key"
                readOnly
                value={created.token}
                onFocus={(event) => event.currentTarget.select()}
                className="border-input bg-muted h-10 min-w-0 flex-1 rounded-lg border px-3 font-mono text-xs outline-none"
              />
              <CopyButton value={created.token} label="Copy key" />
            </div>
            <p className="text-warning-strong text-xs">
              Copy it now: Klipt won&apos;t show it again. Store it as KLIPT_API_KEY on your
              website.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Fetch your posts</span>
              <CopyButton value={snippet} label="Copy code" variant="ghost" />
            </div>
            <pre className="bg-card-nested overflow-x-auto rounded-[14px] p-4 font-mono text-xs leading-relaxed">
              {snippet}
            </pre>
          </div>
        </div>
      ) : (
        <form action={action} className="mt-6 flex max-w-xl flex-col gap-4">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="name" value="Website" />
          {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
          <div className="bg-card-nested rounded-[14px] px-4 py-3 text-sm">
            <p className="font-medium">Have a developer handy?</p>
            <p className="text-muted-foreground mt-1">
              Create a key now and send it with the guide in Settings → Integrations. Or skip:
              everything here is also there later.
            </p>
          </div>
          <div>
            <Button type="submit" variant="outline" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Create API key
            </Button>
          </div>
        </form>
      )}
      <form action={finishOnboardingAction} className="mt-8">
        <input type="hidden" name="site" value={siteId} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="lg">
            <Link href={`/welcome?step=team&site=${siteId}`}>Back</Link>
          </Button>
          <Button type="submit" size="lg">
            {created ? "Finish" : "Skip and finish"}
          </Button>
        </div>
      </form>
    </div>
  );
}
