import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { CreateSiteForm } from "@/components/sites/create-site-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Create site" };

export default function NewSitePage() {
  return (
    <>
      <PageHeader
        icon={Globe}
        title="Create site"
        description="You'll be the owner. You can invite your team and connect a domain afterwards."
      />
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <CreateSiteForm />
      </div>
    </>
  );
}
