"use client";

import { Button } from "@/components/Button";
import { dispatchLoadPostgresMigrationSample } from "../workspaceEvents";

type LoadExampleButtonProps = {
  sampleId: string;
};

export function LoadExampleButton({ sampleId }: LoadExampleButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        dispatchLoadPostgresMigrationSample({
          sampleId,
        });

        const workspace = document.getElementById("checker-workspace");

        workspace?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }}
    >
      Load this example
    </Button>
  );
}
