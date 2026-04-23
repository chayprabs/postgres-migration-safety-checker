"use client";

import { Search } from "lucide-react";
import type { FindingCategory, FindingSeverity } from "../../types";
import { Card } from "@/components/Card";

export type FindingsSeverityFilter = "all" | FindingSeverity;
export type FindingsCategoryFilter = "all" | FindingCategory;
export type FindingsSortMode = "severity" | "statement-order" | "category";

type FindingsToolbarProps = {
  availableCategories: readonly FindingCategory[];
  categoryFilter: FindingsCategoryFilter;
  filteredCount: number;
  searchTerm: string;
  severityFilter: FindingsSeverityFilter;
  showOnlyBlockingRisks: boolean;
  showSafeRewritesOnly: boolean;
  sortMode: FindingsSortMode;
  totalCount: number;
  onCategoryFilterChange: (value: FindingsCategoryFilter) => void;
  onSearchTermChange: (value: string) => void;
  onSeverityFilterChange: (value: FindingsSeverityFilter) => void;
  onShowOnlyBlockingRisksChange: (value: boolean) => void;
  onShowSafeRewritesOnlyChange: (value: boolean) => void;
  onSortModeChange: (value: FindingsSortMode) => void;
};

const SEVERITY_OPTIONS: ReadonlyArray<{
  label: string;
  value: FindingsSeverityFilter;
}> = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
];

const SORT_OPTIONS: ReadonlyArray<{
  label: string;
  value: FindingsSortMode;
}> = [
  { value: "severity", label: "Severity" },
  { value: "statement-order", label: "Statement order" },
  { value: "category", label: "Category" },
];

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function FindingsToolbar({
  availableCategories,
  categoryFilter,
  filteredCount,
  searchTerm,
  severityFilter,
  showOnlyBlockingRisks,
  showSafeRewritesOnly,
  sortMode,
  totalCount,
  onCategoryFilterChange,
  onSearchTermChange,
  onSeverityFilterChange,
  onShowOnlyBlockingRisksChange,
  onShowSafeRewritesOnlyChange,
  onSortModeChange,
}: FindingsToolbarProps) {
  return (
    <Card className="border border-border bg-background px-4 py-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Findings toolbar</p>
            <p className="text-sm leading-7 text-muted-foreground">
              Search, filter, and sort findings before copying review notes into a
              PR.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {filteredCount} of {totalCount} shown
          </span>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.9fr))]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Search findings
            </span>
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => {
                  onSearchTermChange(event.target.value);
                }}
                placeholder="Search titles, objects, rules, or advice"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Severity filter
            </span>
            <select
              value={severityFilter}
              onChange={(event) => {
                onSeverityFilterChange(event.target.value as FindingsSeverityFilter);
              }}
              className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Category filter
            </span>
            <select
              value={categoryFilter}
              onChange={(event) => {
                onCategoryFilterChange(event.target.value as FindingsCategoryFilter);
              }}
              className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
            >
              <option value="all">All</option>
              {availableCategories.map((category) => (
                <option key={category} value={category}>
                  {toHeadingCase(category)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Sort</span>
            <select
              value={sortMode}
              onChange={(event) => {
                onSortModeChange(event.target.value as FindingsSortMode);
              }}
              className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <input
              type="checkbox"
              checked={showOnlyBlockingRisks}
              onChange={(event) => {
                onShowOnlyBlockingRisksChange(event.target.checked);
              }}
              className="mt-1 size-4 rounded border-border text-foreground"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                Show only blocking risks
              </span>
              <span className="block text-sm leading-6 text-muted-foreground">
                Keep only findings that appear to block reads or writes through
                the estimated lock path.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <input
              type="checkbox"
              checked={showSafeRewritesOnly}
              onChange={(event) => {
                onShowSafeRewritesOnlyChange(event.target.checked);
              }}
              className="mt-1 size-4 rounded border-border text-foreground"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                Show safe rewrites only
              </span>
              <span className="block text-sm leading-6 text-muted-foreground">
                Keep only findings that already include a staged recipe or a
                copy-ready safer SQL pattern.
              </span>
            </span>
          </label>
        </div>
      </div>
    </Card>
  );
}
