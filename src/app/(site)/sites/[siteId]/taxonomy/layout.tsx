import { SectionLayout } from "@/components/shell/section-layout";

export default function TaxonomyLayout({
  children,
  params,
}: LayoutProps<"/sites/[siteId]/taxonomy">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="taxonomy">
      {children}
    </SectionLayout>
  );
}
