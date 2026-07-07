const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('infiniteCanvasDesktop', {
  isElectron: true,
  chooseFolder: () => ipcRenderer.invoke('desktop:choose-folder'),
  backendStatus: () => ipcRenderer.invoke('desktop:backend-status'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file);
    } catch (_) {
      return '';
    }
  }
});
