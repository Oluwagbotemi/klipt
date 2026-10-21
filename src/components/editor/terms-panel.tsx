"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, Plus, X } from "lucide-react";
import {
  createTermFromEditorAction,
  searchTermsAction,
  setEntryTermsAction,
} from "@/app/(site)/sites/[siteId]/taxonomy/actions";
import { SettingsSection } from "@/components/editor/settings-section";
import { slugify } from "@/lib/content";
import { flattenTree, type EntryTaxonomy, type TermOption } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * "Categories & tags" in the editor's settings column. Every change saves
 * right away through its own Server Action, separate from the entry's
 * autosave, so the two never conflict.
 */
export function TermsPanel({
  siteId,
  entryId,
  taxonomies,
  readOnly,
  taxonomyHref,
}: {
  siteId: string;
  entryId: string;
  taxonomies: EntryTaxonomy[];
  readOnly: boolean;
  /** Structure › Taxonomy, for managing terms. */
  taxonomyHref: string;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(taxonomies.map((taxonomy) => [taxonomy.key, taxonomy.selected])),
  );
  const summary = taxonomies
    .map((taxonomy) => {
      const n = selected[taxonomy.key]?.length ?? 0;
      return n > 0 ? `${taxonomy.name}: ${n}` : null;
    })
    .filter(Boolean)
    .join(" · ");

  if (taxonomies.length === 0) return null;
  return (
    <SettingsSection title="Categories & tags" description={summary || "None chosen"}>
      {taxonomies.map((taxonomy) => (
        <TaxonomyField
          key={taxonomy.key}
          siteId={siteId}
          entryId={entryId}
          taxonomy={taxonomy}
          readOnly={readOnly}
          taxonomyHref={taxonomyHref}
          onSelected={(ids) => setSelected((current) => ({ ...current, [taxonomy.key]: ids }))}
        />
      ))}
    </SettingsSection>
  );
}

/** Saves the latest selection, one request at a time, retrying with whatever changed meanwhile. */
function useTermSaver(siteId: string, entryId: string, taxonomyKey: string, initial: string[]) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(initial);
  const wanted = useRef(initial);
  const running = useRef(false);

  async function flush() {
    if (running.current) return;
    running.current = true;
    try {
      while (wanted.current.join() !== saved.current.join()) {
        const ids = wanted.current;
        setState("saving");
        const result = await setEntryTermsAction(siteId, entryId, taxonomyKey, ids);
        if (!result.ok) {
          setError(result.error);
          setState("error");
          return result.error;
        }
        saved.current = ids;
      }
      setError(null);
      setState("saved");
      return null;
    } catch {
      setState("error");
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      running.current = false;
    }
  }

  return {
    state,
    error,
    save(ids: string[]) {
      wanted.current = ids;
      void flush();
    },
  };
}

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  return (
    <span className="text-xs font-normal" aria-live="polite">
      {state === "saving" && (
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
        </span>
      )}
      {state === "saved" && (
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Check className="size-3" aria-hidden /> Saved
        </span>
      )}
      {state === "error" && <span className="text-destructive">{error ?? "Not saved"}</span>}
    </span>
  );
}

function TaxonomyField({
  siteId,
  entryId,
  taxonomy,
  readOnly,
  taxonomyHref,
  onSelected,
}: {
  siteId: string;
  entryId: string;
  taxonomy: EntryTaxonomy;
  readOnly: boolean;
  taxonomyHref: string;
  onSelected: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState(taxonomy.selected);
  const saver = useTermSaver(siteId, entryId, taxonomy.key, taxonomy.selected);

  function change(next: string[]) {
    setIds(next);
    onSelected(next);
    saver.save(next);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-sm font-medium">
        {taxonomy.name}
        <SaveStatus state={saver.state} error={null} />
      </legend>
      {taxonomy.hierarchical ? (
        <TermTree
          taxonomy={taxonomy}
          ids={ids}
          readOnly={readOnly}
          onChange={change}
          taxonomyHref={taxonomyHref}
        />
      ) : (
        <TermPicker
          siteId={siteId}
          taxonomy={taxonomy}
          ids={ids}
          readOnly={readOnly}
          onChange={change}
        />
      )}
      {saver.state === "error" && saver.error && (
        <p className="text-destructive text-sm" role="alert">
          {saver.error}
        </p>
      )}
    </fieldset>
  );
}

function TermTree({
  taxonomy,
  ids,
  readOnly,
  onChange,
  taxonomyHref,
}: {
  taxonomy: EntryTaxonomy;
  ids: string[];
  readOnly: boolean;
  onChange: (ids: string[]) => void;
  taxonomyHref: string;
}) {
  const rows = flattenTree(taxonomy.terms);
  const href =
    taxonomy.key === "category" ? taxonomyHref : `${taxonomyHref}/custom/${taxonomy.key}`;
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No {taxonomy.name.toLowerCase()} yet.{" "}
        <Link href={href} className="text-primary underline-offset-4 hover:underline">
          Manage {taxonomy.name.toLowerCase()}
        </Link>
      </p>
    );
  }
  return (
    <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1.5">
      {rows.map((term) => {
        const checked = ids.includes(term.id);
        return (
          <li key={term.id} style={{ paddingInlineStart: `${term.depth * 1.25}rem` }}>
            <label
              className={cn(
                "hover:bg-accent/50 has-focus-visible:ring-ring/50 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm has-focus-visible:ring-[3px]",
                readOnly ? "cursor-default hover:bg-transparent" : "cursor-pointer",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={readOnly}
                onChange={() =>
                  onChange(checked ? ids.filter((id) => id !== term.id) : [...ids, term.id])
                }
                className="accent-primary size-4 shrink-0 outline-none"
              />
              <span className="min-w-0 break-words">{term.name}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Chips for the assigned terms plus a type-ahead to add more (and create, where allowed). */
function TermPicker({
  siteId,
  taxonomy,
  ids,
  readOnly,
  onChange,
}: {
  siteId: string;
  taxonomy: EntryTaxonomy;
  ids: string[];
  readOnly: boolean;
  onChange: (ids: string[]) => void;
}) {
  const listId = useId();
  const inputId = useId();
  const [known, setKnown] = useState<Record<string, TermOption>>(() =>
    Object.fromEntries(taxonomy.terms.map((term) => [term.id, term])),
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TermOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();
  const singular = taxonomy.key === "tag" ? "tag" : "term";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchTermsAction(siteId, taxonomy.key, query.trim()).catch(() => []);
      if (!cancelled) {
        setResults(found);
        setActive(0);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, siteId, taxonomy.key]);

  const trimmed = query.trim();
  const available = results.filter((term) => !ids.includes(term.id));
  const exact = results.some((term) => term.slug === slugify(trimmed));
  const options: ({ kind: "term"; term: TermOption } | { kind: "create" })[] = [
    ...available.map((term) => ({ kind: "term" as const, term })),
    ...(taxonomy.canCreate && trimmed && !exact ? [{ kind: "create" as const }] : []),
  ];

  function add(term: TermOption) {
    setKnown((current) => ({ ...current, [term.id]: term }));
    if (!ids.includes(term.id)) onChange([...ids, term.id]);
    setQuery("");
    setActive(0);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.kind === "term") {
      add(option.term);
      return;
    }
    setError(null);
    startCreating(async () => {
      const result = await createTermFromEditorAction(siteId, taxonomy.key, trimmed);
      if (result.ok) add(result.term);
      else setError(result.error);
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {ids.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Chosen ${taxonomy.name.toLowerCase()}`}>
          {ids.map((id) => (
            <li
              key={id}
              className="bg-secondary text-secondary-foreground inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-sm"
            >
              <span className="min-w-0 truncate">{known[id]?.name ?? "…"}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onChange(ids.filter((item) => item !== id))}
                  aria-label={`Remove ${known[id]?.name ?? singular}`}
                  className="hover:bg-background/60 focus-visible:ring-ring/50 grid size-5 place-items-center rounded-full outline-none focus-visible:ring-[3px]"
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        readOnly && <p className="text-muted-foreground text-sm">None</p>
      )}
      {!readOnly && (
        <div className="relative">
          <label htmlFor={inputId} className="sr-only">
            Add {taxonomy.name.toLowerCase()}
          </label>
          <input
            id={inputId}
            role="combobox"
            aria-expanded={open && options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActive((n) => Math.min(n + 1, Math.max(options.length - 1, 0)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((n) => Math.max(n - 1, 0));
              } else if (event.key === "Enter") {
                if (open && options.length > 0) {
                  event.preventDefault();
                  choose(active);
                }
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={taxonomy.canCreate ? `Find or create a ${singular}` : `Find a ${singular}`}
            autoComplete="off"
            maxLength={80}
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]"
          />
          {open && options.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label={`${taxonomy.name} suggestions`}
              className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border p-1 shadow-md"
            >
              {options.map((option, index) => (
                <li
                  key={option.kind === "term" ? option.term.id : "create"}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm break-words",
                    index === active && "bg-accent text-accent-foreground",
                  )}
                >
                  {option.kind === "term" ? (
                    option.term.name
                  ) : (
                    <>
                      {creating ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <Plus className="size-4 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0">
                        Create {singular} “{trimmed}”
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
