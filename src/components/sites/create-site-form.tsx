"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createSiteAction, type CreateSiteState } from "@/app/(account)/sites/new/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";

const initialState: CreateSiteState = { values: { name: "", domain: "" } };

export function CreateSiteForm() {
  const [state, formAction, pending] = useActionState(createSiteAction, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-5">
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
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Creating site…" : "Create site"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/sites">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
