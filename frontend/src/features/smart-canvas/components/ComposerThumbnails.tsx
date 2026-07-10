import { X } from "lucide-react";

interface ComposerThumbnailsProps {
  refs: string[];
  onRemove: (index: number) => void;
}

export function ComposerThumbnails({ refs, onRemove }: ComposerThumbnailsProps) {
  if (!refs.length) return null;
  return (
    <div className="flex gap-2 mb-2 overflow-x-auto" data-testid="composer-thumbnails">
      {refs.map((url, i) => (
        <div key={`${url}-${i}`} className="relative flex-shrink-0 w-12 h-12 border border-[var(--border)]">
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute -top-1 -right-1 bg-black text-white rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
