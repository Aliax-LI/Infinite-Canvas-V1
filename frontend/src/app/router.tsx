import { createBrowserRouter, Navigate } from "react-router-dom";
import { ShellLayout } from "./ShellLayout";
import { CanvasListPage } from "../features/canvas-list/CanvasListPage";
import { SettingsLayout } from "../features/settings/SettingsLayout";
import { SettingsGeneralPage } from "../features/settings/SettingsGeneralPage";
import { ApiSettingsPage } from "../features/settings/api/ApiSettingsPage";
import { WorkflowsSettingsPage } from "../features/settings/workflows/WorkflowsSettingsPage";
import { CliSettingsPanel } from "../features/settings/cli/CliSettingsPanel";
import { SmartCanvasPage } from "../features/smart-canvas/SmartCanvasPage";
import { LegacyCanvasPage } from "../features/canvas/LegacyCanvasPage";
import { AssetManagerPage } from "../features/asset-manager/AssetManagerPage";
import { ChatPage } from "../features/chat/ChatPage";
import { ToolsHubPage } from "../features/tools/ToolsHubPage";
import {
  EnhancePage,
  KleinPage,
  ZimagePage,
  AnglePage,
  OnlinePage,
} from "../features/tools/ToolPages";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <ShellLayout />,
    children: [
      { index: true, element: <Navigate to="/canvases" replace /> },
      { path: "canvases", element: <CanvasListPage /> },
      {
        path: "settings",
        element: <SettingsLayout />,
        children: [
          { index: true, element: <SettingsGeneralPage /> },
          { path: "api", element: <ApiSettingsPage /> },
          { path: "workflows", element: <WorkflowsSettingsPage /> },
          { path: "cli", element: <CliSettingsPanel /> },
        ],
      },
      { path: "assets", element: <AssetManagerPage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "tools", element: <ToolsHubPage /> },
      { path: "enhance", element: <EnhancePage /> },
      { path: "klein", element: <KleinPage /> },
      { path: "zimage", element: <ZimagePage /> },
      { path: "angle", element: <AnglePage /> },
      { path: "online", element: <OnlinePage /> },
    ],
  },
  { path: "/canvas/:id", element: <SmartCanvasPage /> },
  { path: "/legacy-canvas/:id", element: <LegacyCanvasPage /> },
]);
