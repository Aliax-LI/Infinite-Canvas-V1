const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('infiniteCanvasDesktop', {
  isElectron: true,
  chooseFolder: () => ipcRenderer.invoke('desktop:choose-folder'),
  backendStatus: () => ipcRenderer.invoke('desktop:backend-status'),
  openExternal: url => ipcRenderer.invoke('desktop:open-external', url),
  openPath: path => ipcRenderer.invoke('desktop:open-path', path),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file);
    } catch (_) {
      return '';
    }
  }
});
