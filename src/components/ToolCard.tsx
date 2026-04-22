import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ToolIcon } from "@/components/ToolIcon";
import {
  describeToolPrivacy,
  type ToolDefinition,
} from "@/config/tools";

type ToolCardProps = {
  tool: ToolDefinition;
};

export function ToolCard({ tool }: ToolCardProps) {
  return (
    <Link href={tool.href} className="group block">
      <Card className="h-full p-6 transition group-hover:border-ring/40">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-background">
                <ToolIcon name={tool.iconName} className="size-4 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{tool.category}</Badge>
                <Badge variant="outline">{tool.status}</Badge>
              </div>
            </div>
            <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-foreground" />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {tool.slug}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">{tool.name}</h2>
            </div>
            <p className="leading-7 text-muted-foreground">{tool.shortDescription}</p>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            <span>{describeToolPrivacy(tool)}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
