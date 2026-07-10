export interface CliHelpCommandGroup {
  defaultLabel: string;
  commands: Array<{ value: string; label: string }>;
}

export const CLI_HELP_COMMANDS: Record<string, CliHelpCommandGroup> = {
  jimeng: {
    defaultLabel: "dreamina",
    commands: [
      { value: "login", label: "login" },
      { value: "logout", label: "logout" },
      { value: "user_credit", label: "user_credit" },
      { value: "text2image", label: "text2image" },
      { value: "image2image", label: "image2image" },
      { value: "image_upscale", label: "image_upscale" },
      { value: "text2video", label: "text2video" },
      { value: "image2video", label: "image2video" },
      { value: "multimodal2video", label: "multimodal2video" },
      { value: "frames2video", label: "frames2video" },
      { value: "multiframe2video", label: "multiframe2video" },
      { value: "list_task", label: "list_task" },
      { value: "query_result", label: "query_result" },
    ],
  },
  codex: {
    defaultLabel: "codex",
    commands: [
      { value: "exec", label: "exec" },
      { value: "login", label: "login" },
      { value: "logout", label: "logout" },
      { value: "doctor", label: "doctor" },
      { value: "mcp", label: "mcp" },
      { value: "app", label: "app" },
      { value: "update", label: "update" },
    ],
  },
  gemini: {
    defaultLabel: "gemini",
    commands: [
      { value: "help", label: "help" },
      { value: "install", label: "install" },
      { value: "models", label: "models" },
      { value: "plugin", label: "plugin" },
      { value: "plugins", label: "plugins" },
      { value: "update", label: "update" },
      { value: "changelog", label: "changelog" },
      { value: "mcp", label: "mcp" },
      { value: "extensions", label: "extensions" },
    ],
  },
};
