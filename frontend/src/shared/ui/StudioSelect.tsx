import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "../utils";

export interface StudioSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface StudioSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: StudioSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Borderless trigger for use inside `.studio-field-frame` */
  framed?: boolean;
  "data-testid"?: string;
}

export function StudioSelect({
  value,
  onChange,
  options,
  disabled = false,
  placeholder,
  className,
  framed = false,
  "data-testid": testId,
}: StudioSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const highlightRef = useRef(-1);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const enabledOptions = options.filter((o) => !o.disabled);

  const close = useCallback(() => {
    openRef.current = false;
    highlightRef.current = -1;
    setOpen(false);
    setHighlightIndex(-1);
  }, []);

  const openMenu = useCallback(() => {
    const idx = enabledOptions.findIndex((o) => o.value === value);
    const next = idx >= 0 ? idx : 0;
    openRef.current = true;
    highlightRef.current = next;
    setHighlightIndex(next);
    setOpen(true);
  }, [enabledOptions, value]);

  const moveHighlight = useCallback(
    (delta: number) => {
      const next = Math.min(
        Math.max(highlightRef.current + delta, 0),
        enabledOptions.length - 1,
      );
      highlightRef.current = next;
      setHighlightIndex(next);
    },
    [enabledOptions.length],
  );

  const selectOption = useCallback(
    (opt: StudioSelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      close();
    },
    [onChange, close],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!openRef.current) {
          openMenu();
        } else {
          moveHighlight(1);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!openRef.current) {
          openMenu();
        } else {
          moveHighlight(-1);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!openRef.current) {
          openMenu();
        } else if (highlightRef.current >= 0) {
          selectOption(enabledOptions[highlightRef.current]);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn("studio-select", framed && "studio-select--framed", className)}
      data-testid={testId}
      data-node-control=""
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="studio-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        data-testid={testId ? `${testId}-trigger` : undefined}
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (disabled) return;
          if (open) {
            close();
          } else {
            openMenu();
          }
        }}
      >
        <span className={cn("studio-select-value", !selected && "is-placeholder")}>
          {selected?.label ?? placeholder ?? "—"}
        </span>
        <ChevronDown className="studio-select-chevron" aria-hidden />
      </button>
      {open && (
        <ul
          id={listId}
          className="studio-select-menu"
          role="listbox"
          data-testid={testId ? `${testId}-menu` : undefined}
          aria-activedescendant={
            highlightIndex >= 0 ? `${listId}-opt-${highlightIndex}` : undefined
          }
        >
          {options.map((opt) => {
            const enabledIdx = enabledOptions.findIndex((o) => o.value === opt.value);
            const isHighlighted = enabledIdx === highlightIndex;
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                id={enabledIdx >= 0 ? `${listId}-opt-${enabledIdx}` : undefined}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                className={cn(
                  "studio-select-option",
                  isSelected && "is-selected",
                  isHighlighted && "is-highlighted",
                  opt.disabled && "is-disabled",
                )}
                data-testid={testId ? `${testId}-option-${opt.value}` : undefined}
                onMouseEnter={() => {
                  if (!opt.disabled && enabledIdx >= 0) {
                    highlightRef.current = enabledIdx;
                    setHighlightIndex(enabledIdx);
                  }
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(opt)}
              >
                {opt.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
