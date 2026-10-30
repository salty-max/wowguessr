import clsx from "clsx";
import type { ReactNode } from "react";

// a dark panel in gold trim, a gem at each corner
export function Frame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("frame", className)}>
      <span className="gem -top-[7px] -left-[7px]" />
      <span className="gem -top-[7px] -right-[7px]" />
      <span className="gem -bottom-[7px] -left-[7px]" />
      <span className="gem -right-[7px] -bottom-[7px]" />
      {children}
    </div>
  );
}
