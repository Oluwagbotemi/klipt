import { SectionLayout } from "@/components/shell/section-layout";

export default function TeamLayout({ children, params }: LayoutProps<"/sites/[siteId]/team">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="team">
      {children}
    </SectionLayout>
  );
}
