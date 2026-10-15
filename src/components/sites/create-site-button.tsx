"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Site creation needs the backend. The button stays visible so the layout is
 * final, but it is aria-disabled and explains why instead of faking success.
 */
export function CreateSiteButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-disabled="true"
          aria-describedby="create-site-hint"
          onClick={(e) => e.preventDefault()}
        >
          <Plus aria-hidden />
          Create site
        </Button>
      </TooltipTrigger>
      <TooltipContent id="create-site-hint">
        Available once the backend is connected.
      </TooltipContent>
    </Tooltip>
  );
}
