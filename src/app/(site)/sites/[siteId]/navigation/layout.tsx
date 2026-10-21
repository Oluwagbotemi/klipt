import { SectionLayout } from "@/components/shell/section-layout";

export default function NavigationLayout({
  children,
  params,
}: LayoutProps<"/sites/[siteId]/navigation">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="navigation">
      {children}
    </SectionLayout>
  );
}
