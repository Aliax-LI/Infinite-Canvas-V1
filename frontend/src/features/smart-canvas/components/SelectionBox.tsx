interface SelectionBoxProps {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export function SelectionBox({ x, y, width, height, visible }: SelectionBoxProps) {
  if (!visible || (Math.abs(width) < 2 && Math.abs(height) < 2)) return null;
  const left = width < 0 ? x + width : x;
  const top = height < 0 ? y + height : y;
  return (
    <div
      className="fixed pointer-events-none border border-blue-500 bg-blue-500/10 z-40"
      style={{
        left,
        top,
        width: Math.abs(width),
        height: Math.abs(height),
      }}
      data-testid="selection-box"
    />
  );
}
