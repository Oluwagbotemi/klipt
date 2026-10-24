import { cn } from "@/lib/utils";

/*
 * Lists and tables in the visual direction: a bordered card (20px, no shadow) that clips its
 * rows, a softer header row and a gentle row hover. Dense on purpose — these are work tools.
 */

/** The bordered card around a table or a list of rows. */
export function TableCard({
  className,
  as: Tag = "div",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "ul" | "ol" | "section" }) {
  return <Tag className={cn("visual-card overflow-hidden", className)} {...props} />;
}

/** `<thead>` styling: grey band, small muted labels. */
export const TABLE_HEAD = "bg-card-nested text-muted-foreground text-left text-xs";

/** Row dividers inside a TableCard (`<tbody>` or `<ul>`). */
export const TABLE_BODY = "divide-card-border divide-y";

/** Row hover, for rows that hold links or actions. */
export const TABLE_ROW = "transition-colors duration-(--duration-fast) hover:bg-card-nested/60";
