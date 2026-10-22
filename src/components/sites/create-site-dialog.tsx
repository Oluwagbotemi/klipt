"use client";

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2 } from "lucide-react";
import { createSiteAction, type CreateSiteState } from "@/app/(account)/sites/new/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const initialState: CreateSiteState = { values: { name: "", domain: "" } };

interface CreateSiteControls {
  /** Opens the Create site modal; `closeTo` is where to go if it's dismissed. */
  openCreateSite: (options?: { closeTo?: string }) => void;
}

const CreateSiteContext = createContext<CreateSiteControls | null>(null);

export function useCreateSite(): CreateSiteControls {
  const value = useContext(CreateSiteContext);
  if (!value) throw new Error("useCreateSite must be used inside <CreateSiteProvider>");
  return value;
}

/**
 * Renders the Create site modal once per shell, opened from any trigger. After
 * creating, the action redirects into the new site, whose shell replaces this one.
 */
export function CreateSiteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closeTo, setCloseTo] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const openCreateSite = useCallback((options?: { closeTo?: string }) => {
    setFormKey((key) => key + 1);
    setCloseTo(options?.closeTo ?? null);
    setOpen(true);
  }, []);

  const controls = useMemo(() => ({ openCreateSite }), [openCreateSite]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && closeTo) router.replace(closeTo);
  }

  return (
    <CreateSiteContext.Provider value={controls}>
      {children}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <CreateSiteDialogContent key={formKey} />
      </Dialog>
    </CreateSiteContext.Provider>
  );
}

function CreateSiteDialogContent() {
  const [state, formAction, pending] = useActionState(createSiteAction, initialState);

  return (
    <DialogContent size="lg">
      <DialogForm action={formAction}>
        <DialogHeader icon={Globe}>
          <DialogTitle>Create site</DialogTitle>
          <DialogDescription>
            You&apos;ll be the owner. You can invite your team and connect a domain afterwards.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
          <FormField
            id="name"
            name="name"
            label="Site name"
            defaultValue={state.values.name}
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
            defaultValue={state.values.domain}
            error={state.errors?.domain}
            hint="For example, example.com. You can add it later; DNS setup and verification happen in Settings → Domains."
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Creating site…" : "Create site"}
          </Button>
        </DialogFooter>
      </DialogForm>
    </DialogContent>
  );
}

/** A button that opens the Create site modal in place. */
export function CreateSiteButton(props: Omit<React.ComponentProps<typeof Button>, "onClick">) {
  const { openCreateSite } = useCreateSite();
  return <Button type="button" onClick={() => openCreateSite()} {...props} />;
}

/** Opens the modal once on mount (used by the /sites/new route). */
export function OpenCreateSite({ closeTo }: { closeTo: string }) {
  const { openCreateSite } = useCreateSite();
  useEffect(() => {
    openCreateSite({ closeTo });
  }, [openCreateSite, closeTo]);
  return null;
}
