/** Minimal frame for content previews: no app chrome. */
export default function PreviewLayout({ children }: LayoutProps<"/">) {
  return <div className="bg-background min-h-dvh">{children}</div>;
}
