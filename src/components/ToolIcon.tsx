import {
  Database,
  FileCode2,
  KeyRound,
  ScanSearch,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ToolIconName } from "@/config/tools";

export const toolIconMap: Record<ToolIconName, LucideIcon> = {
  database: Database,
  shield: ShieldCheck,
  "file-code": FileCode2,
  search: ScanSearch,
  key: KeyRound,
  wrench: Wrench,
};

type ToolIconProps = {
  name: ToolIconName;
  className?: string;
};

export function ToolIcon({ name, className }: ToolIconProps) {
  const Icon = toolIconMap[name];
  return <Icon className={className} />;
}
