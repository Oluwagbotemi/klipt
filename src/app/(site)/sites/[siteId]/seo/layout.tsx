import { SectionLayout } from "@/components/shell/section-layout";

export default function SeoLayout({ children, params }: LayoutProps<"/sites/[siteId]/seo">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="seo">
      {children}
    </SectionLayout>
  );
}
