import { SectionLayout } from "@/components/shell/section-layout";

export default function ContentListLayout({
  children,
  params,
}: LayoutProps<"/sites/[siteId]/content">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="content">
      {children}
    </SectionLayout>
  );
}
