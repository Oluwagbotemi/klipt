"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserSummary } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

/**
 * Account menu. Profile, security, and sign-out arrive with authentication;
 * until then this only identifies the (mock) signed-in user.
 */
export function UserMenu({
  user,
  showName = false,
  className,
}: {
  user: UserSummary;
  showName?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "hover:bg-sidebar-accent focus-visible:ring-ring/50 flex min-w-0 cursor-pointer items-center gap-2 rounded-lg p-1 text-left text-sm outline-none focus-visible:ring-[3px]",
          className,
        )}
        aria-label={`Account: ${user.name}`}
      >
        <Avatar>
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        {showName && (
          <span className="min-w-0">
            <span className="block truncate font-medium">{user.name}</span>
            <span className="text-sidebar-muted-foreground block truncate text-xs">
              {user.email}
            </span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-64">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal">
          Sample account. Profile, security and sign-out arrive with authentication.
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
