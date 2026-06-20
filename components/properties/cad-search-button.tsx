"use client";

import { Button } from "@/components/ui/button";
import { getCadSearchUrl } from "@/lib/cad-search";

type CadSearchButtonProps = {
  county: string;
};

export function CadSearchButton({ county }: CadSearchButtonProps) {
  const cadSearchUrl = getCadSearchUrl(county);

  const handleOpenCadSearch = () => {
    if (!cadSearchUrl) {
      return;
    }

    window.open(cadSearchUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpenCadSearch}
        disabled={!cadSearchUrl}
      >
        Open CAD Search
      </Button>
      {!cadSearchUrl && (
        <p className="text-sm text-muted-foreground">
          CAD search is not configured for this county yet.
        </p>
      )}
    </div>
  );
}
