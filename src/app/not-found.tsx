import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center px-4 sm:px-6">
        <Logo />
      </header>
      <main
        id="main"
        className="bg-background flex flex-1 flex-col justify-center sm:mx-3 sm:mb-3 sm:rounded-3xl sm:border"
      >
        <EmptyState
          icon={MapPinOff}
          title="Page not found"
          description="This page or site doesn't exist, or you don't have access to it."
          action={
            <Button asChild>
              <Link href="/sites">Go to your sites</Link>
            </Button>
          }
        />
      </main>
    </div>
  );
}
