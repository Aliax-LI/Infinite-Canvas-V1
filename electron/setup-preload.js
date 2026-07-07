const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupBridge', {
  onStatus: callback => ipcRenderer.on('setup:status', (_event, payload) => callback(payload)),
  onProgress: callback => ipcRenderer.on('setup:progress', (_event, text) => callback(text)),
  onPhase: callback => ipcRenderer.on('setup:phase', (_event, payload) => callback(payload)),
  onCliStatus: callback => ipcRenderer.on('setup:cli-status', (_event, payload) => callback(payload)),
  onCliLog: callback => ipcRenderer.on('setup:cli-log', (_event, text) => callback(text)),
  getLogoUrl: () => ipcRenderer.invoke('setup:getLogoUrl'),
  getTheme: () => ipcRenderer.invoke('setup:getTheme'),
  getFontUrls: () => ipcRenderer.invoke('setup:getFontUrls'),
  getCliTools: () => ipcRenderer.invoke('setup:getCliTools'),
  installCli: toolId => ipcRenderer.invoke('setup:installCli', toolId),
  skipCli: () => ipcRenderer.invoke('setup:skipCli'),
  finishSetup: () => ipcRenderer.invoke('setup:finishSetup')
});
