/**
 * AI助手Electron预加载脚本
 * 提供安全的IPC通信接口
 */

const { contextBridge, ipcRenderer } = require('electron');

// 通过contextBridge暴露安全的API
contextBridge.exposeInMainWorld('electronAPI', {
    // AI问答接口
    aiAsk: (systemPrompt, userQuestion, fileName) =>
        ipcRenderer.invoke('ai:ask', userQuestion, null, fileName),

    // 获取应用版本信息
    getAppVersion: () =>
        ipcRenderer.invoke('app:getVersion'),

    // 打开外部链接
    openExternal: (url) =>
        ipcRenderer.invoke('shell:openExternal', url),

    // Toast通知
    showToast: (type, title, message) =>
        ipcRenderer.send('toast:show', { type, title, message })
});

console.log('AI助手预加载脚本已加载');