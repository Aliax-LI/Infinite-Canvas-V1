import { useRef } from "react";
import { usePointerDrag } from "../../../shared/hooks/usePointerDrag";
import { canvasMediaPreviewUrl } from "../core/uploadMedia";

interface CompareSliderProps {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

export function CompareSlider({ beforeUrl, afterUrl, className }: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const percentRef = useRef(50);

  const drag = usePointerDrag({
    onMove: (_x, _y, dx) => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth || 1;
      percentRef.current = Math.max(
        5,
        Math.min(95, percentRef.current + (dx / w) * 100),
      );
      const clip = el.querySelector("[data-compare-before]") as HTMLElement | null;
      const handle = el.querySelector("[data-compare-handle]") as HTMLElement | null;
      if (clip) clip.style.clipPath = `inset(0 ${100 - percentRef.current}% 0 0)`;
      if (handle) handle.style.left = `${percentRef.current}%`;
    },
  });

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg bg-gray-100 ${className ?? ""}`}
      data-testid="compare-slider"
      {...drag.handlers}
    >
      <img
        src={canvasMediaPreviewUrl(afterUrl)}
        alt=""
        className="w-full h-auto block select-none"
        draggable={false}
      />
      <div
        data-compare-before
        className="absolute inset-0"
        style={{ clipPath: "inset(0 50% 0 0)" }}
      >
        <img
          src={canvasMediaPreviewUrl(beforeUrl)}
          alt=""
          className="w-full h-auto block select-none"
          draggable={false}
        />
      </div>
      <div
        data-compare-handle
        className="absolute top-0 bottom-0 w-0.5 bg-black cursor-ew-resize"
        style={{ left: "50%" }}
      >
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-black bg-white" />
      </div>
    </div>
  );
}
