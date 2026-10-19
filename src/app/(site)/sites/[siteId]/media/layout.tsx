import { SectionLayout } from "@/components/shell/section-layout";

export default function MediaLayout({ children, params }: LayoutProps<"/sites/[siteId]/media">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="media">
      {children}
    </SectionLayout>
  );
}
