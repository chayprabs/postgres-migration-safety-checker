"use client";

import { useEffect } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";

export default function PostgresMigrationSafetyCheckerError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="border-b border-border">
      <Container className="py-12 sm:py-14">
        <Card className="mx-auto max-w-3xl p-6 sm:p-8">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Tool error boundary
              </p>
              <h1 className="text-2xl font-semibold text-foreground">
                The checker hit an unexpected rendering error
              </h1>
              <p className="text-sm leading-7 text-muted-foreground">
                Your SQL was not uploaded. Try reloading this tool segment, and if
                the issue keeps happening, report it with a redacted sample.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => {
                  unstable_retry();
                }}
              >
                Retry checker
              </Button>
            </div>
          </div>
        </Card>
      </Container>
    </section>
  );
}
