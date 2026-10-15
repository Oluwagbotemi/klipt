// Fixed locale and time zone keep server and client output identical (no hydration mismatch).
// Switch to the user's locale/time zone once account preferences exist.
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}
