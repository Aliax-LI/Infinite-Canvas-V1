import { Cloud, Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

export type ToolEngine = "local" | "cloud";

interface EngineSwitchProps {
  value: ToolEngine;
  onChange: (engine: ToolEngine) => void;
  testId?: string;
}

export function EngineSwitch({ value, onChange, testId = "engine-switch" }: EngineSwitchProps) {
  const { t } = useTranslation("studio");

  return (
    <div className="studio-tool-engine-switch" data-testid={testId}>
      <span className="studio-tool-field-label">{t("studio.engineSource")}</span>
      <div className="studio-tool-engine-track">
        <button
          type="button"
          className={`studio-tool-engine-btn ${value === "local" ? "is-active" : ""}`}
          onClick={() => onChange("local")}
          data-testid={`${testId}-local`}
        >
          <Cpu className="w-3.5 h-3.5" />
          {t("studio.local")}
        </button>
        <button
          type="button"
          className={`studio-tool-engine-btn ${value === "cloud" ? "is-active" : ""}`}
          onClick={() => onChange("cloud")}
          data-testid={`${testId}-cloud`}
        >
          <Cloud className="w-3.5 h-3.5" />
          ModelScope
        </button>
      </div>
    </div>
  );
}
