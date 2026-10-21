import { SectionLayout } from "@/components/shell/section-layout";

export default function ModelsLayout({ children, params }: LayoutProps<"/sites/[siteId]/models">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="models">
      {children}
    </SectionLayout>
  );
}
