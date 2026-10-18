import { SectionLayout } from "@/components/shell/section-layout";

export default function SettingsLayout({
  children,
  params,
}: LayoutProps<"/sites/[siteId]/settings">) {
  return (
    <SectionLayout siteId={params.then((p) => p.siteId)} section="settings">
      {children}
    </SectionLayout>
  );
}
