"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isSafeHref, richTextExtensions, type RichTextDoc } from "@/lib/editor/rich-text";
import { cn } from "@/lib/utils";

/** Body editor (Tiptap). Emits the document as JSON on every change. */
export function RichTextEditor({
  initialContent,
  editable,
  onChange,
  onReady,
  labelledBy,
}: {
  initialContent: RichTextDoc;
  editable: boolean;
  onChange: (doc: RichTextDoc) => void;
  /** Called once with the editor's normalized copy of the initial content. */
  onReady?: (doc: RichTextDoc) => void;
  labelledBy?: string;
}) {
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
  });

  const editor = useEditor({
    extensions: [...richTextExtensions(), Placeholder.configure({ placeholder: "Start writing…" })],
    content: initialContent,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "rich-text min-h-80 px-1 py-4 outline-none",
        role: "textbox",
        "aria-multiline": "true",
        ...(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": "Body" }),
      },
    },
    onCreate: ({ editor }) => onReadyRef.current?.(editor.getJSON() as RichTextDoc),
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON() as RichTextDoc),
  });

  useEffect(() => {
    // false: toggling editability is not a content change.
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  if (!editor) {
    return (
      <div aria-hidden className="flex flex-col gap-3 py-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

type ToolbarItem = {
  label: string;
  shortcut?: string;
  icon: typeof Bold;
  isActive?: (e: Editor) => boolean;
  run: (e: Editor) => void;
  canRun?: (e: Editor) => boolean;
};

const GROUPS: ToolbarItem[][] = [
  [
    {
      label: "Heading 2",
      icon: Heading2,
      isActive: (e) => e.isActive("heading", { level: 2 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Heading 3",
      icon: Heading3,
      isActive: (e) => e.isActive("heading", { level: 3 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Heading 4",
      icon: Heading4,
      isActive: (e) => e.isActive("heading", { level: 4 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 4 }).run(),
    },
  ],
  [
    {
      label: "Bold",
      shortcut: "Ctrl+B",
      icon: Bold,
      isActive: (e) => e.isActive("bold"),
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      shortcut: "Ctrl+I",
      icon: Italic,
      isActive: (e) => e.isActive("italic"),
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
    {
      label: "Underline",
      shortcut: "Ctrl+U",
      icon: Underline,
      isActive: (e) => e.isActive("underline"),
      run: (e) => e.chain().focus().toggleUnderline().run(),
    },
    {
      label: "Strikethrough",
      icon: Strikethrough,
      isActive: (e) => e.isActive("strike"),
      run: (e) => e.chain().focus().toggleStrike().run(),
    },
    {
      label: "Inline code",
      icon: Code,
      isActive: (e) => e.isActive("code"),
      run: (e) => e.chain().focus().toggleCode().run(),
    },
  ],
  [
    {
      label: "Bulleted list",
      icon: List,
      isActive: (e) => e.isActive("bulletList"),
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: ListOrdered,
      isActive: (e) => e.isActive("orderedList"),
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Quote",
      icon: Quote,
      isActive: (e) => e.isActive("blockquote"),
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Code block",
      icon: SquareCode,
      isActive: (e) => e.isActive("codeBlock"),
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Divider",
      icon: Minus,
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ],
  [
    {
      label: "Undo",
      shortcut: "Ctrl+Z",
      icon: Undo2,
      run: (e) => e.chain().focus().undo().run(),
      canRun: (e) => e.can().undo(),
    },
    {
      label: "Redo",
      shortcut: "Ctrl+Shift+Z",
      icon: Redo2,
      run: (e) => e.chain().focus().redo().run(),
      canRun: (e) => e.can().redo(),
    },
  ],
];

const ITEMS = GROUPS.flat();

/** Formatting toolbar: one tab stop, arrow keys move between buttons (ARIA toolbar pattern). */
function Toolbar({ editor }: { editor: Editor }) {
  const ref = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      active: ITEMS.map((item) => item.isActive?.(e) ?? false),
      enabled: ITEMS.map((item) => item.canRun?.(e) ?? true),
      link: e.isActive("link"),
    }),
  });

  function onKeyDown(event: React.KeyboardEvent) {
    const buttons = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>("[data-tb]:not(:disabled)") ?? [],
    );
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next].focus(); // onFocus records the new roving index
  }

  let index = 0;
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Formatting"
      onKeyDown={onKeyDown}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-14 z-10 -mx-1 flex [scrollbar-width:thin] items-center gap-0.5 overflow-x-auto border-b py-1.5 backdrop-blur"
    >
      {GROUPS.map((group, g) => (
        <div key={g} className="flex shrink-0 items-center gap-0.5">
          {g > 0 && <span aria-hidden className="bg-border mx-1 h-5 w-px" />}
          {group.map((item) => {
            const i = index++;
            const active = state.active[i];
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-tb
                    tabIndex={i === focusIndex ? 0 : -1}
                    aria-label={item.label}
                    aria-keyshortcuts={item.shortcut?.replace("Ctrl", "Control")}
                    aria-pressed={item.isActive ? active : undefined}
                    disabled={!state.enabled[i]}
                    onClick={() => item.run(editor)}
                    onFocus={() => setFocusIndex(i)}
                    className={cn(active && "bg-accent text-foreground")}
                  >
                    <item.icon aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {item.label}
                  {item.shortcut && <span className="opacity-70"> · {item.shortcut}</span>}
                </TooltipContent>
              </Tooltip>
            );
          })}
          {g === 1 && (
            <LinkButton
              editor={editor}
              active={state.link}
              tabIndex={ITEMS.length === focusIndex ? 0 : -1}
              onFocus={() => setFocusIndex(ITEMS.length)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function normalizeHref(input: string) {
  const value = input.trim();
  if (!value) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/") || value.startsWith("#")) {
    return value;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return `https://${value}`;
}

function LinkButton({
  editor,
  active,
  tabIndex,
  onFocus,
}: {
  editor: Editor;
  active: boolean;
  tabIndex: number;
  onFocus: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setValue((editor.getAttributes("link").href as string | undefined) ?? "");
      setError(null);
    }
  }

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const href = normalizeHref(value);
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setOpen(false);
      return;
    }
    if (!isSafeHref(href)) {
      setError("Use a web address, email address, or a path starting with /.");
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !active) {
      chain
        .insertContent({
          type: "text",
          text: value.trim(),
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      chain.setLink({ href }).run();
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-tb
              tabIndex={tabIndex}
              onFocus={onFocus}
              aria-label="Link"
              aria-pressed={active}
              className={cn(active && "bg-accent text-foreground")}
            >
              <Link2 aria-hidden />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Link</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80" onCloseAutoFocus={(e) => e.preventDefault()}>
        <form onSubmit={apply} className="flex flex-col gap-2">
          <label htmlFor="link-href" className="text-sm font-medium">
            Link to
          </label>
          <Input
            id="link-href"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://example.com or /about"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "link-error" : undefined}
            autoFocus
          />
          {error && (
            <p id="link-error" className="text-destructive text-xs">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                Remove link
              </Button>
            )}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
