import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TabNav } from "@/components/shell/tab-nav";

/** Account settings: your own profile and sign-in security, separate from any site. */
export default function AccountSettingsLayout({ children }: LayoutProps<"/account">) {
  return (
    <>
      <PageHeader
        icon={UserRound}
        title="Account"
        description="Your profile and sign-in settings. They apply to every site you work on."
        tabs={
          <TabNav
            label="Account settings"
            items={[
              { href: "/account", label: "Profile", exact: true },
              { href: "/account/security", label: "Security" },
            ]}
          />
        }
      />
      {children}
    </>
  );
}
