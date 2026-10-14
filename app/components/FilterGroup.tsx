"use client";
import { type ReactNode } from "react";
export function FilterGroup({
  title,
  collapsed,
  onToggle,
  activeCount,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  // Shown as a small badge next to the title so a collapsed group's active filters are still
  // visible at a glance, instead of only finding out by expanding every group in turn.
  activeCount?: number;
  children: ReactNode;
}) {
  return (
    <div className="filterGroup">
      <div className="sortLabel fieldToggle" onClick={onToggle}>
        {title}
        {!!activeCount && <span className="filterActiveBadge">{activeCount}</span>}
        <span className={"fieldChevron" + (collapsed ? "" : " open")} />
      </div>
      {!collapsed && <div className="checkList">{children}</div>}
    </div>
  );
}
