"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/** Link between sign-in and sign-up that keeps ?next= and ?email= (e.g. from an invitation). */
export function AuthSwitchLink({
  to,
  children,
}: {
  to: "/sign-in" | "/sign-up";
  children: string;
}) {
  const params = useSearchParams();
  const keep = new URLSearchParams();
  for (const key of ["next", "email"]) {
    const value = params.get(key);
    if (value) keep.set(key, value);
  }
  const qs = keep.toString();
  return (
    <Link
      href={qs ? `${to}?${qs}` : to}
      className="text-foreground font-medium underline underline-offset-4"
    >
      {children}
    </Link>
  );
}
