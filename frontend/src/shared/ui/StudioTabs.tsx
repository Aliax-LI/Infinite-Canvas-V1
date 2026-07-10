export interface StudioTabItem<T extends string> {
  id: T;
  label: string;
  testId?: string;
}

interface StudioTabsProps<T extends string> {
  tabs: StudioTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  "data-testid"?: string;
}

export function StudioTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
  "data-testid": testId,
}: StudioTabsProps<T>) {
  return (
    <div
      className={["studio-workspace-mode-tabs", className].filter(Boolean).join(" ")}
      data-testid={testId}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
          data-testid={tab.testId}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
