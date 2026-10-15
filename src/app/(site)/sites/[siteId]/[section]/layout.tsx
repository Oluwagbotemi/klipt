import { SectionLayout } from "@/components/shell/section-layout";

export default function PlannedSectionLayout({
  children,
  params,
}: LayoutProps<"/sites/[siteId]/[section]">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section={params.then((p) => p.section)}>
      {children}
    </SectionLayout>
  );
}
