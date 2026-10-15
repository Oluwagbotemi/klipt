import { redirect } from "next/navigation";
import { siteHref } from "@/lib/navigation";

export default async function SiteIndex({ params }: PageProps<"/sites/[siteId]">) {
  const { siteId } = await params;
  redirect(siteHref(siteId));
}
