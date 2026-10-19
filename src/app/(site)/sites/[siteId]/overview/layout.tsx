import { SectionLayout } from "@/components/shell/section-layout";

export default function OverviewLayout({
  children,
  params,
}: LayoutProps<"/sites/[siteId]/overview">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="overview">
      {children}
    </SectionLayout>
  );
}
