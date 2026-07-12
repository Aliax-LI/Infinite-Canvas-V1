import type { ReactNode } from "react";

interface WorkbenchSectionProps {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

export function WorkbenchSection({ title, children, className }: WorkbenchSectionProps) {
  return (
    <section className={`studio-tool-section ${className ?? ""}`.trim()}>
      <h3 className="studio-tool-section-title">{title}</h3>
      {children}
    </section>
  );
}
