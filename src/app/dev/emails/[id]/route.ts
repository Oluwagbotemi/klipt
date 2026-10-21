import { getOutboxEmail } from "@/lib/data/dev-outbox";

/** One dev-outbox email as the recipient would see it (?format=text for the text part). */
export async function GET(request: Request, { params }: RouteContext<"/dev/emails/[id]">) {
  const { id } = await params;
  const email = await getOutboxEmail(id);
  if (!email) return new Response("Not found", { status: 404 });
  const text = new URL(request.url).searchParams.get("format") === "text";
  return new Response(text ? email.text : email.html, {
    headers: {
      "Content-Type": text ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
