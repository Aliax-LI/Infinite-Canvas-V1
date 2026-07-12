const ANGLE_COMMAND_RE = /将相机.*?(?=(\n|$))/g;

export function buildAngleCommand(rotateH: number, rotateV: number, distance: number): string {
  const parts: string[] = [];
  if (rotateH !== 0) {
    const dir = rotateH > 0 ? "向右" : "向左";
    parts.push(`${dir}旋转${Math.abs(rotateH)}度`);
  }
  if (rotateV !== 0) {
    const dir = rotateV > 0 ? "俯视" : "仰视";
    parts.push(`${dir}${Math.abs(rotateV)}度`);
  }

  let lensText = "";
  if (distance > 4) {
    lensText = "使用广角镜头";
  } else if (distance < 4) {
    lensText = "使用特写镜头";
  }

  let resultText = "";
  if (parts.length > 0) {
    resultText = `将相机${parts.join("，")}`;
  }
  if (lensText) {
    resultText += (resultText ? "，" : "将相机") + lensText;
  }
  return resultText;
}

export function mergeAngleIntoPrompt(current: string, command: string): string {
  if (!command.trim()) return current;
  if (ANGLE_COMMAND_RE.test(current)) {
    ANGLE_COMMAND_RE.lastIndex = 0;
    return current.replace(ANGLE_COMMAND_RE, command);
  }
  const trimmed = current.trim();
  return trimmed ? `${trimmed}\n${command}` : command;
}
