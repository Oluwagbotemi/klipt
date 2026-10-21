import { SectionLayout } from "@/components/shell/section-layout";

export default function PerformanceLayout({
  children,
  params,
}: LayoutProps<"/sites/[siteId]/performance">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="performance">
      {children}
    </SectionLayout>
  );
}
