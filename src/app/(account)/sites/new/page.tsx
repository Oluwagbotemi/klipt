import type { Metadata } from "next";
import { OpenCreateSite } from "@/components/sites/create-site-dialog";
import { SitesView } from "../sites-view";

export const metadata: Metadata = { title: "Create site" };

/**
 * Direct visits and old links: the Sites list with the Create site modal open.
 * Closing the modal goes to /sites.
 */
export default function NewSitePage() {
  return (
    <>
      <SitesView />
      <OpenCreateSite closeTo="/sites" />
    </>
  );
}
