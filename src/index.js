const { app, BrowserWindow, ipcMain, dialog, Notification, globalShortcut, shell } = require('electron');
const path = require('node:path');
const fs = require('fs');
const os = require('os');
const metadataManager = require('./utils/MetadataManager');

// 禁用 GPU 和沙箱以避免在受限环境中崩溃
app.commandLine.appendSwitch('no-sandbox');
app.disableHardwareAcceleration();

// 引入原生 AI 服务模块
const { askAI, readPdf, searchArxiv, downloadArxivPdf } = require('./utils/AIProvider');
const { getAIClient } = require('./screenshot/aiClient');

// 引入 Agent 智能处理模块
const { processInstruction, getAgent, initAgent } = require('./agent');

// 解决 Windows 控制台中文乱码问题
if (process.platform === 'win32') {
  try {
    require('child_process').execSync('chcp 65001');
  } catch (e) {
    // 忽略错误
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// ================= 全局变量 =================
let mainWindow = null;
let folderWatcher = null;  // 文件夹监听器
let watchedFolderPath = null;  // 当前监听的文件夹路径
let watchDebounceTimer = null;  // 防抖定时器
let scheduleCheckInterval = null;  // 定时检查器
let lastCheckedMinute = -1;  // 上次检查的分钟，避免重复触发

// 新增模块
let screenshotManager = null;  // 截图管理器（Electron 原生）
let webToPdfManager = null;    // 网页转 PDF 管理器
let hotkeyManager = null;      // 统一快捷键管理器
let textCaptureManager = null; // 文字捕获管理器
let workspaceScanner = null;   // 工作区扫描器
const WORKSPACE_SCAN_INTERVAL_MS = 120000;

function resolveMainLogFile() {
  try {
    // 优先使用项目目录下的 logs 目录，避免权限问题
    const logDir = path.join(__dirname, '..', 'logs');
    return {
      dir: logDir,
      file: path.join(logDir, 'main-process.log')
    };
  } catch (error) {
    const fallbackDir = path.join(__dirname, '..', 'temp', 'logs');
    return {
      dir: fallbackDir,
      file: path.join(fallbackDir, 'main-process.log')
    };
  }
}

function createMainLogger() {
  const safeStringify = (value) => {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  };

  const write = (level, message, extra) => {
    const target = resolveMainLogFile();
    const line = [
      new Date().toISOString(),
      level,
      message,
      extra !== undefined ? safeStringify(extra) : ''
    ].join(' | ') + os.EOL;

    try {
      if (!fs.existsSync(target.dir)) {
        fs.mkdirSync(target.dir, { recursive: true });
      }
      fs.appendFileSync(target.file, line, 'utf8');
    } catch (error) {
      console.error('[MAIN][LOGGER] 写入日志失败:', error.message);
    }

    if (extra !== undefined) {
      console.log('[MAIN]', level, message, extra);
    } else {
      console.log('[MAIN]', level, message);
    }
  };

  return {
    info: (message, extra) => write('INFO', message, extra),
    warn: (message, extra) => write('WARN', message, extra),
    error: (message, extra) => write('ERROR', message, extra),
    filePath: () => resolveMainLogFile().file,
  };
}

const mainLog = createMainLogger();
mainLog.info('process-start', {
  pid: process.pid,
  platform: process.platform,
  argv: process.argv,
});

// ================= 工具函数 =================


const createWindow = () => {
  const isDevRuntime = !app.isPackaged || process.env.NODE_ENV === 'development';
  const startupPage = isDevRuntime
    ? path.join(__dirname, 'main', 'main.html')
    : path.join(__dirname, 'index.html');

  if (isDevRuntime) {
    console.log('[Startup] Development mode detected, bypassing login page.');
    mainLog.info('startup-mode', { mode: 'development', startupPage });
  } else {
    mainLog.info('startup-mode', { mode: 'production', startupPage });
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Choose startup page by runtime mode.
  mainLog.info('createWindow', { width: 1400, height: 900, startupPage });
  mainWindow.loadFile(startupPage);

  // 页面加载完成后注入AI助手
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[AI] 开始加载研知AI助手...');

    try {
      // 读取AI助手HTML文件
      const path = require('path'); // Node.js内置的路径处理模块，必须先引入
      const aibotHtmlPath = path.join(__dirname, 'aibot', 'aibot.html');
      const aibotHtml = fs.readFileSync(aibotHtmlPath, 'utf-8');

      // 提取CSS和JS内容（因为它们引用相对路径）
      // 注意：主页面在 src/main/ 目录下，所以需要使用 ../aibot/ 路径
      const injectScript = `
        (function() {
          const injectAIAssistant = () => {
            // 创建AI助手CSS链接
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = '../aibot/aibot.css';
            document.head.appendChild(cssLink);

            // 创建AI助手容器
            const aibotContainer = document.createElement('div');
            aibotContainer.id = 'aibot-container';
            document.body.appendChild(aibotContainer);

            // 创建AI助手脚本
            const script = document.createElement('script');
            script.src = '../aibot/aibot.js';
            script.onload = () => {
              console.log('[AI] 研知AI助手脚本加载完成');
              // 手动初始化AI助手（因为DOMContentLoaded已经触发过了）
              if (typeof YanzhiAIBot !== 'undefined') {
                window.yanzhiAIBot = new YanzhiAIBot();
                console.log('[AI] 研知AI助手已手动初始化');
              }
            };
            document.body.appendChild(script);

            // 注入AI助手的HTML结构（从aibot.html提取）
            const parser = new DOMParser();
            const doc = parser.parseFromString(${JSON.stringify(aibotHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/g, ''))}, 'text/html');
            const trigger = doc.getElementById('aibot-trigger');
            const aibotWindow = doc.getElementById('aibot-window');
            if (trigger) {
              document.body.appendChild(trigger);
              console.log('[AI] AI助手触发按钮已添加');
            }
            if (aibotWindow) {
              document.body.appendChild(aibotWindow);
              console.log('[AI] AI助手窗口已添加');
            }
          };

          // 等待DOM准备好后注入
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectAIAssistant);
          } else {
            injectAIAssistant();
          }
        })();
      `;

      mainWindow.webContents.executeJavaScript(injectScript)
        .then(() => {
          console.log('[AI] AI助手注入完成');
        })
        .catch((error) => {
          console.error('[AI] AI助手注入失败:', error);
        });

    } catch (error) {
      console.error('[AI] 读取AI助手文件失败:', error);
    }
  });

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainLog.warn('mainWindow-closed');
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  mainLog.info('app-whenReady', { logFile: mainLog.filePath() });
  createWindow();

  // 初始化快捷键管理器
  const { initHotkeyManager } = require('./utils/HotkeyManager');
  hotkeyManager = initHotkeyManager(mainWindow);

  // 初始化截图管理器（Electron 原生实现）
  const ScreenshotManager = require('./screenshot');
  screenshotManager = new ScreenshotManager(mainWindow, hotkeyManager);
  screenshotManager.registerShortcut();
  console.log('✅ 截图管理器已初始化');

  // 初始化网页转 PDF 管理器
  const WebToPdf = require('./pdf/WebToPdf');
  webToPdfManager = new WebToPdf(mainWindow, hotkeyManager);
  webToPdfManager.registerShortcut();
  console.log('✅ 网页转 PDF 管理器已初始化');

  // 初始化文字捕获管理器
  const TextCapture = require('./utils/TextCapture');
  textCaptureManager = new TextCapture(mainWindow, hotkeyManager);
  textCaptureManager.registerShortcut();
  console.log('✅ 文字捕获管理器已初始化');

  // 注册 Ctrl+B 保存选中文字（已实现）
  // 由 TextCapture 模块处理

  // 启动定时推荐检查器
  startScheduleChecker();

  // 初始化工作区扫描器
  const WorkspaceScanner = require('./workspace/WorkspaceScanner');
  const dataDir = path.join(__dirname, '..', 'data');
  workspaceScanner = new WorkspaceScanner(dataDir);
  console.log('✅ 工作区扫描器已初始化（等待激活工作区）');

  // 初始化 Agent（传入工作区扫描器）
  initAgent(workspaceScanner);
  console.log('✅ Agent 已连接工作区扫描器');

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    mainLog.info('app-activate', { windowCount: BrowserWindow.getAllWindows().length });
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
// 修复：只有主窗口确实被销毁时才退出，防止编辑器窗口关闭意外触发应用退出
app.on('window-all-closed', () => {
  const allWindows = BrowserWindow.getAllWindows();
  const mainWindowExists = mainWindow && !mainWindow.isDestroyed();

  mainLog.warn('window-all-closed', {
    mainWindowExists: !!mainWindowExists,
    windowCount: allWindows.length,
    urls: allWindows.map((win) => {
      try {
        return win.webContents.getURL();
      } catch (error) {
        return 'unknown';
      }
    }),
  });

  if (process.platform !== 'darwin') {
    // 只有在主窗口确实被销毁时才退出
    if (!mainWindowExists) {
      mainLog.warn('app-quit-called-by-window-all-closed');
      app.quit();
    }
  }
});

// 应用退出时清理资源
app.on('will-quit', () => {
  mainLog.warn('will-quit');
  if (workspaceScanner) {
    workspaceScanner.stop();
  }
  if (screenshotManager) {
    screenshotManager.destroy();
  }
  if (textCaptureManager) {
    textCaptureManager.destroy();
  }
  if (hotkeyManager) {
    hotkeyManager.unregisterAll();
  }
});

app.on('before-quit', (event) => {
  mainLog.warn('before-quit', { defaultPrevented: event.defaultPrevented });
  if (workspaceScanner) {
    workspaceScanner.stop();
  }
  if (screenshotManager) {
    screenshotManager.destroy();
  }
  if (textCaptureManager) {
    textCaptureManager.destroy();
  }
  if (hotkeyManager) {
    hotkeyManager.unregisterAll();
  }
});

app.on('quit', (event, exitCode) => {
  mainLog.warn('quit', { exitCode });
});

app.on('render-process-gone', (event, webContents, details) => {
  mainLog.error('render-process-gone', {
    reason: details && details.reason,
    exitCode: details && details.exitCode,
    url: (() => {
      try {
        return webContents.getURL();
      } catch (error) {
        return 'unknown';
      }
    })(),
  });
});

app.on('child-process-gone', (event, details) => {
  mainLog.error('child-process-gone', details);
});

// 处理进程信号（Ctrl+C 等）
process.on('SIGINT', () => {
  mainLog.warn('signal', { signal: 'SIGINT' });
  console.log('\n收到 SIGINT 信号，正在清理...');
  app.quit();
});

process.on('SIGTERM', () => {
  mainLog.warn('signal', { signal: 'SIGTERM' });
  console.log('收到 SIGTERM 信号，正在清理...');
  app.quit();
});

process.on('uncaughtException', (error) => {
  mainLog.error('uncaughtException', {
    message: error && error.message,
    stack: error && error.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  mainLog.error('unhandledRejection', reason);
});

// ================= Toast 通知 IPC =================
ipcMain.on('toast:show', (event, { type, title, message }) => {
  // 在主窗口显示 Toast 通知
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toast:show', { type, title, message });
  }
});

// ================= PDF 用户输入 URL IPC =================
ipcMain.handle('pdf:save-url', async (event, url) => {
  if (webToPdfManager) {
    await webToPdfManager.handleUserUrl(url);
  }
});

// ================= 文件夹操作 IPC =================

// 激活工作区（同一路径复用已有 workspaceId）
ipcMain.handle('workspace:setActive', async (event, folderPath) => {
  try {
    if (!workspaceScanner) {
      return { success: false, error: '工作区扫描器未初始化' };
    }

    workspaceScanner.stop();
    const activated = workspaceScanner.setActiveWorkspace(folderPath);

    // 自动创建“其他”文件夹（系统默认）及其子文件夹
    const otherPath = path.join(folderPath, '其他');
    if (!fs.existsSync(otherPath)) {
      try {
        fs.mkdirSync(otherPath, { recursive: true });
        console.log('✅ 已自动创建“其他”文件夹');
      } catch (e) {
        console.error('❌ 创建“其他”文件夹失败:', e);
      }
    }
    
    // 确保“其他”文件夹下的子文件夹存在
    if (fs.existsSync(otherPath)) {
      const subFolders = ['images', '博客', '文章'];
      subFolders.forEach(sub => {
        const subPath = path.join(otherPath, sub);
        if (!fs.existsSync(subPath)) {
          try {
            fs.mkdirSync(subPath, { recursive: true });
          } catch (e) {
            console.error(`❌ 创建子文件夹 ${sub} 失败:`, e);
          }
        }
      });
    }

    // 立即扫描一次，再进入定时扫描
    await workspaceScanner.scan();
    workspaceScanner.start(WORKSPACE_SCAN_INTERVAL_MS);

    // 通知所有窗口工作区已更新
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('workspace:updated', {
          workspaceId: activated.workspaceId,
          workspacePath: activated.normalizedPath,
          action: 'activated'
        });
      }
    });

    return {
      success: true,
      workspaceId: activated.workspaceId,
      workspaceDataDir: activated.workspaceDataDir,
      normalizedPath: activated.normalizedPath,
    };
  } catch (err) {
    console.error('[Workspace] 激活失败:', err);
    return { success: false, error: err.message };
  }
});

// 清空当前工作区
ipcMain.handle('workspace:clearActive', async () => {
  if (workspaceScanner) {
    workspaceScanner.clearActiveWorkspace();
  }

  return { success: true };
});

// 获取当前工作区状态
ipcMain.handle('workspace:getActive', async () => {
  const active = workspaceScanner?.currentWorkspace || null;

  return {
    success: true,
    active: active
      ? {
          workspaceId: active.workspaceId,
          workspacePath: active.workspacePath,
          normalizedPath: active.normalizedPath,
          workspaceDataDir: active.dataDir,
        }
      : null,
  };
});

// 获取工作区统计数据
ipcMain.handle('workspace:getStats', async () => {
  try {
    if (!workspaceScanner?.currentWorkspace) {
      return { success: false, error: '未激活工作区' };
    }

    const summaryFile = workspaceScanner.summaryFile;
    const structureFile = workspaceScanner.structureFile;

    if (!fs.existsSync(summaryFile)) {
      return { success: false, error: '统计文件不存在' };
    }

    const summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
    const structureData = fs.existsSync(structureFile) 
      ? JSON.parse(fs.readFileSync(structureFile, 'utf-8'))
      : { folders: [] };

    // 合并 folders 数据：从 structureData 获取描述，从 summaryData 获取文件数量
    const mergedFolders = (structureData.folders || []).map(folder => {
      const summaryFolder = (summaryData.folders || []).find(f => f.name === folder.name);
      return {
        ...folder,
        fileCount: summaryFolder?.fileCount || 0,
        totalSize: summaryFolder?.totalSize || 0,
        detailFile: summaryFolder?.detailFile
      };
    });

    return {
      success: true,
      stats: {
        totalFiles: summaryData.totalFiles || 0,
        folderCount: summaryData.folderCount || 0,
        mdFileCount: summaryData.mdFileCount || 0,
        pdfFileCount: summaryData.pdfFileCount || 0,
        imageCount: summaryData.imageCount || 0,
        // 本月新增统计
        monthlyNewFiles: summaryData.monthlyNewFiles || 0,
        monthlyNewNotes: summaryData.monthlyNewNotes || 0,
        monthlyNewImages: summaryData.monthlyNewImages || 0,
        // 最近文件列表
        recentFiles: summaryData.recentFiles || [],
        recentMonthFiles: summaryData.recentMonthFiles || [],
        folders: mergedFolders
      }
    };
  } catch (err) {
    console.error('[Workspace] 获取统计数据失败:', err);
    return { success: false, error: err.message };
  }
});

// 获取分类详情（文件夹下的文件列表）
ipcMain.handle('workspace:getCategoryDetail', async (event, categoryName) => {
  try {
    if (!workspaceScanner?.currentWorkspace) {
      return { success: false, error: '未激活工作区' };
    }

    let detailFile;
    if (categoryName.endsWith('.json')) {
      detailFile = path.join(workspaceScanner.currentWorkspace.dataDir, categoryName);
    } else {
      detailFile = path.join(workspaceScanner.currentWorkspace.dataDir, `${categoryName}.json`);
    }
    
    if (!fs.existsSync(detailFile)) {
      return { success: false, error: '分类详情文件不存在' };
    }

    const detailData = JSON.parse(fs.readFileSync(detailFile, 'utf-8'));
    
    return {
      success: true,
      category: categoryName,
      folderPath: detailData.path || '',  // 返回文件夹完整路径
      files: detailData.allFiles || [],
      totalCount: detailData.totalFileCount || 0
    };
  } catch (err) {
    console.error('[Workspace] 获取分类详情失败:', err);
    return { success: false, error: err.message };
  }
});

// 生成知识脉络图（两步：1.AI 生成内容 2.在工作区文件索引中检索文件名并注入链接）
ipcMain.handle('workspace:generateMap', async (event, folderPath) => {
  try {
      console.log(`[KnowledgeMap] 开始为目录生成基于子文件夹的脉络图: ${folderPath}`);
      const aiClient = getAIClient('你是一个专业的学术与知识整理助手。');

      // 递归获取支持的文件
      const getTargetFiles = (dir) => {
        let results = [];
        if (!fs.existsSync(dir)) return results;
        const list = fs.readdirSync(dir);
        for (const file of list) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            results = results.concat(getTargetFiles(fullPath));
          } else {
            const ext = path.extname(fullPath).toLowerCase();
            if (['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext) && !file.startsWith('_Knowledge_Map')) {
              results.push(fullPath);
            }
          }
        }
        return results;
      };

      // 构建工作区文件索引：basename -> 相对路径，用于第二步检索
      const buildFileIndex = (baseDir, files) => {
        const index = new Map(); // basename -> relPath
        const byFolder = new Map(); // folderName -> Map(basename -> relPath)
        for (const fullPath of files) {
          const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          const base = path.basename(fullPath);
          const folder = path.dirname(rel);
          index.set(base, rel);
          if (folder && folder !== '.') {
            if (!byFolder.has(folder)) byFolder.set(folder, new Map());
            byFolder.get(folder).set(base, rel);
            // 同时注册到一级子文件夹，以便 ### 版块：【diffusion】能匹配 diffusion/博客/note.md
            const topFolder = folder.split('/')[0];
            if (topFolder && topFolder !== folder) {
              if (!byFolder.has(topFolder)) byFolder.set(topFolder, new Map());
              byFolder.get(topFolder).set(base, rel);
            }
          }
        }
        return { index, byFolder };
      };

      // 第二步：在 content 中将 **文件名** 替换为 [文件名](路径)，路径从文件索引检索
      const injectLinksFromIndex = (content, fileIndex, baseDir, sectionFolder = null) => {
        const { index, byFolder } = fileIndex;
        return content.replace(/\*\*([^*]+?)\*\*/g, (match, name) => {
          const trimmed = name.trim();
          if (!trimmed || !/[.\u4e00-\u9fa5a-zA-Z0-9_\-\s\[\]()]+\.(md|txt|pdf|png|jpg|jpeg|webp)$/i.test(trimmed)) return match;
          let relPath = null;
          if (sectionFolder && byFolder.has(sectionFolder)) {
            relPath = byFolder.get(sectionFolder).get(trimmed);
          }
          if (!relPath) relPath = index.get(trimmed);
          if (!relPath || !fs.existsSync(path.join(baseDir, relPath))) return match;
          return `[${trimmed}](${relPath})`;
        });
      };

      // 按版块注入链接（全局脉络需根据 ### 版块：【X】确定 sectionFolder）
      const injectLinksGlobal = (content, fileIndex, baseDir) => {
        const { index, byFolder } = fileIndex;
        const sections = content.split(/(?=^###\s+版块：【([^】]+)】)/m);
        let result = '';
        let currentFolder = null;
        for (let i = 0; i < sections.length; i++) {
          const m = sections[i].match(/^###\s+版块：【([^】]+)】/);
          if (m) currentFolder = m[1];
          const chunk = sections[i];
          const injectChunk = chunk.replace(/\*\*([^*]+?)\*\*/g, (match, name) => {
            const trimmed = name.trim();
            if (!trimmed || !/[.\u4e00-\u9fa5a-zA-Z0-9_\-\s\[\]()]+\.(md|txt|pdf|png|jpg|jpeg|webp)$/i.test(trimmed)) return match;
            let relPath = null;
            if (currentFolder && byFolder.has(currentFolder)) {
              relPath = byFolder.get(currentFolder).get(trimmed);
            }
            if (!relPath) relPath = index.get(trimmed);
            if (!relPath || !fs.existsSync(path.join(baseDir, relPath))) return match;
            return `[${trimmed}](${relPath})`;
          });
          result += injectChunk;
        }
        return result || content;
      };

      // 提取提纲的复用方法
      const processSingleFile = async (filePath) => {
        let content = '';
        const ext = path.extname(filePath).toLowerCase();
        try {
            if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
              console.log(`[KnowledgeMap] 正在使用图片多模态分析: ${path.basename(filePath)}...`);
              const base64Data = fs.readFileSync(filePath).toString('base64');
              const dataUrl = `data:image/${ext.replace('.', '')};base64,${base64Data}`;
              const summary = await aiClient.ask("请用一两句话极其客观地概括这张图片和图表的核心有效内容，不准进行无关的个人发散或编造。", dataUrl, 0.5, 300);
              return `【图片文件：${path.basename(filePath)}】：${summary}`;
            }

            if (ext === '.pdf') {
              const pdfResult = await readPdf(filePath, 3);
              if (pdfResult.success) content = pdfResult.content;
            } else {
              content = fs.readFileSync(filePath, 'utf-8');
            }
            
            if (content && content.trim()) {
                const truncatedCmd = content.substring(0, 2000);
                const filePrompt = `你是一个严谨的信息提取助手。现有一份文档，请用一两句话简要概括其核心内容。强烈要求：必须完全按照文档的实际内容输出，绝对不允许凭空捏造、瞎编任何原文不存在的信息！\n\n文档内容：\n${truncatedCmd}`;
                const fileSummary = await aiClient.ask(filePrompt, null, 0.5, 300);
                return `【文件：${path.basename(filePath)}】：${fileSummary}`;
            }
            return `【文件：${path.basename(filePath)}】：无有效文本内容可以提取`;
        } catch (err) {
          return `【文件：${path.basename(filePath)}】：内容提取失败（${err.message}）`;
        }
      };

      const topLevelItems = fs.readdirSync(folderPath);
      const rootSummaries = []; // 存放所有子版块及根目录下文件的最终总结

      // 以每个一级子文件夹为一个处理单位
      for (const item of topLevelItems) {
        if (item.startsWith('.')) continue; // 忽略隐藏文件夹如.git
        const itemPath = path.join(folderPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          console.log(`[KnowledgeMap] 开始处理子文件夹区块: ${item}`);
          const subFiles = getTargetFiles(itemPath);
          if (subFiles.length === 0) continue;

          const subSummaries = [];
          for (const subFile of subFiles) {
            const sum = await processSingleFile(subFile);
            if (sum) subSummaries.push(sum);
          }

          const subText = subSummaries.join('\n\n');
            const promptSub = `你是一个严谨的学术整理助手。请根据以下各个文件的真实简介，仅仅梳理出【${item}】文件夹下的客观引导目录(Index)。
基本要求：
1. 你的总结必须百分之百基于提供的文本内容！绝对不允许产生幻觉或编造任何不存在的关联、作者或内容！
2. 请简要介绍这个子文件夹的整体定位，并重点以列表形式列出各个文件大概讲述了什么客观内容。
3. 不需要长篇大论的详细解释，重点是真实的导航和索引。输出格式必须为结构化 Markdown。
4. 【重要】提及具体文件时，用加粗标注文件名即可，如 **note.md**、**diffusion_1.pdf**。切勿输出路径或链接，系统会自动添加可点击链接。

内容如下：\n${subText}`;
          let subMapContent = await aiClient.ask(promptSub, null, 0.6, 1500);

          // 第二步：在工作区文件索引中检索文件名，注入可点击链接（不依赖 AI 输出路径）
          const subFileIndex = buildFileIndex(itemPath, subFiles);
          subMapContent = injectLinksFromIndex(subMapContent, subFileIndex, itemPath, null);
          fs.writeFileSync(path.join(itemPath, `_Knowledge_Map_${item}.md`), subMapContent, 'utf-8');
          rootSummaries.push(`\n### 版块：【${item}】的内容脉络\n${subMapContent}\n`);
          
        } else {
          // 位于根目录的平铺文件
          const ext = path.extname(item).toLowerCase();
          if (['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext) && !item.startsWith('_Knowledge_Map')) {
             const singleSum = await processSingleFile(itemPath);
             if (singleSum) rootSummaries.push(`\n### 独立文件：【${item}】\n${singleSum}\n`);
          }
        }
      }

      if (rootSummaries.length === 0) {
        return { success: false, error: '未找到任何支持扫描的文件' };
      }

      console.log(`[KnowledgeMap] 所有版块处理完成，开始生成全局脉络大图...`);
      const allText = rootSummaries.join('\n\n=====\n\n');
const promptFinal = `你是一个非常严谨的学术整理助手。请紧密且完全依赖以下各个子版块的引导目录内容，生成整个主文件夹的全局导引索引(Global Index)。
基本要求：
1. 【红线警告】：绝对不允许自己编造、发散或产生任何原文中没有覆盖的幻觉信息！！！所有的梳理必须建立在给定的数据之上。
2. 说明各个子版块主要涵盖了什么内容和它们之间的客观宏观逻辑关联，帮助用户能快速了解该工作区的真实知识结构。
3. 输出格式必须为结构化 Markdown。
4. 【重要】提及具体文件时，用加粗标注文件名即可，如 **note.md**、**论文.pdf**。切勿输出路径或链接，系统会在工作区中检索并自动添加可点击链接。

各个区块真实输入数据如下：\n${allText}`;

        let finalMapContent = await aiClient.ask(promptFinal, null, 0.6, 2500);
        const outputFilePath = path.join(folderPath, '_Knowledge_Map.md');

        // 第二步：构建全局文件索引，在工作区中检索文件名并注入可点击链接（不依赖 AI 输出路径）
        const allFiles = getTargetFiles(folderPath);
        const globalFileIndex = buildFileIndex(folderPath, allFiles);
        finalMapContent = injectLinksGlobal(finalMapContent, globalFileIndex, folderPath);

        fs.writeFileSync(outputFilePath, finalMapContent, 'utf-8');
        console.log(`[KnowledgeMap] 全局知识脉络图生成成功: ${outputFilePath}`);

        return { success: true, mapFilePath: outputFilePath };
  } catch (e) {
    console.error('[KnowledgeMap] 生成过程中抛出错误:', e);
    return { success: false, error: e.message };
  }
});

// 打开文件夹选择对话框
ipcMain.handle('folder:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择文件夹'
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: '用户取消' };
  }
  
  const folderPath = result.filePaths[0];
  return { success: true, path: folderPath };
});

// 读取文件夹内容
ipcMain.handle('folder:read', async (event, folderPath) => {
  try {
    const items = fs.readdirSync(folderPath, { withFileTypes: true });
    const result = items
      .filter(item => !item.name.toLowerCase().endsWith('.meta.json'))
      .map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'folder' : 'file',
        path: path.join(folderPath, item.name),
        fileType: item.isFile() ? getFileType(item.name) : null
      }));
    return { success: true, items: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 监听文件夹变化
ipcMain.handle('folder:watch', async (event, folderPath) => {
  try {
    // 先停止之前的监听
    if (folderWatcher) {
      folderWatcher.close();
      folderWatcher = null;
    }
    
    watchedFolderPath = folderPath;
    
    // 使用 fs.watch 监听文件夹（递归监听）
    folderWatcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      console.log(`[FileWatch] ${eventType}: ${filename}`);
      
      // 防抖处理，避免频繁触发
      if (watchDebounceTimer) {
        clearTimeout(watchDebounceTimer);
      }
      
      watchDebounceTimer = setTimeout(() => {
        // 通知渲染进程文件夹有变化
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('folder:updated', {
            eventType,
            filename,
            folderPath: watchedFolderPath
          });
        }
      }, 500);  // 500ms 防抖
    });
    
    folderWatcher.on('error', (err) => {
      console.error('[FileWatch] 监听错误:', err);
    });
    
    console.log('[FileWatch] 开始监听:', folderPath);
    return { success: true, message: '开始监听' };
    
  } catch (err) {
    console.error('[FileWatch] 启动监听失败:', err);
    return { success: false, error: err.message };
  }
});

// 停止监听文件夹
ipcMain.handle('folder:unwatch', async () => {
  if (folderWatcher) {
    folderWatcher.close();
    folderWatcher = null;
    watchedFolderPath = null;
    console.log('[FileWatch] 停止监听');
  }
  return { success: true };
});

// 获取文件类型
function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
    return 'image';
  } else if (ext === 'pdf') {
    return 'pdf';
  } else if (['md', 'txt'].includes(ext)) {
    return 'markdown';
  }
  return 'file';
}

// 创建子文件夹（纯 Node.js 实现，无需 Python）
ipcMain.handle('folder:create', async (event, folderName, basePath) => {
  try {
    const fullPath = path.join(basePath, folderName);
    
    // 检查父目录是否存在，如果不存在则尝试创建（递归）
    if (!fs.existsSync(basePath)) {
        try {
            fs.mkdirSync(basePath, { recursive: true });
        } catch (e) {
            console.error(`无法创建父目录 ${basePath}:`, e);
            // 尝试继续，可能会失败
        }
    }

    if (fs.existsSync(fullPath)) {
      return { success: false, error: '文件夹已存在' };
    }
    
    // 创建主文件夹
    fs.mkdirSync(fullPath, { recursive: true });
    
    // 自动创建标准子目录
    const subDirs = ['images', '博客', '文章'];
    for (const subDir of subDirs) {
      const subDirPath = path.join(fullPath, subDir);
      if (!fs.existsSync(subDirPath)) {
        fs.mkdirSync(subDirPath, { recursive: true });
      }
    }

    // 创建默认的 markdown 文件
    const mdContent = `# ${folderName}\n\n在这里记录关于 ${folderName} 的笔记...`;
    const mdFilePath = path.join(fullPath, `${folderName}.md`);
    if (!fs.existsSync(mdFilePath)) {
      fs.writeFileSync(mdFilePath, mdContent, 'utf-8');
    }
    
    console.log('[CreateFolder] 成功创建文件夹及其子目录:', fullPath);
    return { success: true, path: fullPath, description: '新建子文件夹（已包含 images/博客/文章 及默认笔记）' };
  } catch (error) {
    console.error('[CreateFolder Error] 创建文件夹失败:', error);
    return { success: false, error: error.message };
  }
});

// 显示保存文件对话框
ipcMain.handle('folder:showSaveDialog', async (event, options) => {
  try {
    const defaultPath = options.defaultPath || '';
    const filters = options.filters || [{ name: 'All Files', extensions: ['*'] }];
    const title = options.title || '保存文件';
    const win = BrowserWindow.getAllWindows()[0] || null;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: title, defaultPath: defaultPath, filters: filters
    });
    return { success: true, canceled, filePath };
  } catch (error) {
    console.error('[ShowSaveDialog Error]', error);
    return { success: false, error: error.message };
  }
});

// 读取文件内容
ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (['.md', '.txt', '.json', '.js', '.py', '.css', '.html'].includes(ext)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, type: 'text' };
    } else {
      return { success: true, path: filePath, type: 'binary' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 读取 PDF 文件内容（使用 pdf-parse 库）
ipcMain.handle('file:readPdf', async (event, filePath) => {
  console.log('[PDF] 开始读取 PDF:', filePath);

  try {
    const result = await readPdf(filePath, 5);

    if (result.success) {
      console.log('[PDF] 读取成功，内容长度:', result.content.length);
      return { success: true, content: result.content };
    } else {
      console.error('[PDF] 读取失败:', result.error);
      return { success: false, error: result.error };
    }
  } catch (err) {
    console.error('[PDF] 读取错误:', err);
    return { success: false, error: err.message };
  }
});

// 删除文件
ipcMain.handle('file:delete', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }
    fs.unlinkSync(filePath);
    console.log('[File] 已删除文件:', filePath);
    return { success: true };
  } catch (err) {
    console.error('[File] 删除文件失败:', err);
    return { success: false, error: err.message };
  }
});

// 写入文件
ipcMain.handle('file:write', async (event, filePath, content) => {
  try {
    // 确保父目录存在
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
      } catch (e) {
        console.error(`[File] 无法创建父目录 ${dirPath}:`, e);
      }
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('[File] 已写入文件:', filePath);
    return { success: true };
  } catch (err) {
    console.error('[File] 写入文件失败:', err);
    return { success: false, error: err.message };
  }
});

// 复制文件到剪贴板（真正复制文件，可以粘贴到其他地方）
ipcMain.handle('file:copy', async (event, filePath) => {
  try {
    const { clipboard, nativeImage } = require('electron');
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    
    // 对于图片文件，复制图片内容
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)) {
      const image = nativeImage.createFromPath(filePath);
      clipboard.writeImage(image);
      console.log('[File] 已复制图片到剪贴板:', filePath);
    } else {
      // 对于其他文件，写入文件路径（macOS 可以通过 file:// URL 复制文件）
      // 使用 NSPasteboard 的方式复制文件
      clipboard.writeBuffer('public.file-url', Buffer.from(`file://${filePath}`));
      console.log('[File] 已复制文件到剪贴板:', filePath);
    }
    
    return { success: true, fileName: fileName };
  } catch (err) {
    console.error('[File] 复制文件失败:', err);
    return { success: false, error: err.message };
  }
});

// AI 问答（使用原生 JS 实现）
ipcMain.handle('ai:ask', async (event, question, fileContent, fileName) => {
  console.log('[AI] 开始回答问题:', question);

  try {
    const result = await askAI(question, fileContent, fileName);

    if (result.success) {
      console.log('[AI] 回答完成');
      return { success: true, response: result.response };
    } else {
      console.error('[AI] 回答失败:', result.error);
      return { success: false, error: result.error };
    }
  } catch (err) {
    console.error('[AI] 错误:', err);
    return { success: false, error: err.message };
  }
});


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// ================= Arxiv 搜索与下载 IPC =================

// 搜索 Arxiv 论文
ipcMain.handle('arxiv:search', async (event, query, maxResults = 5) => {
  console.log('[Arxiv] 搜索:', query);

  try {
    const result = await searchArxiv(query, maxResults);

    if (result.success) {
      console.log('[Arxiv] 找到', result.papers.length, '篇论文');
      return { success: true, papers: result.papers };
    } else {
      console.error('[Arxiv] 搜索失败:', result.error);
      return { success: false, error: result.error };
    }
  } catch (err) {
    console.error('[Arxiv] 错误:', err);
    return { success: false, error: err.message };
  }
});

// 下载 PDF 到临时文件夹
ipcMain.handle('arxiv:download', async (event, pdfUrl, title) => {
  return new Promise(async (resolve) => {
    const toolsDir = path.join(__dirname, '..', 'tools');
    const pdfsDir = path.join(toolsDir, 'pdfs');
    
    // 确保 pdfs 文件夹存在
    if (!fs.existsSync(pdfsDir)) {
      fs.mkdirSync(pdfsDir, { recursive: true });
    }
    
    // 清理文件名
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
    const filename = `${safeTitle}.pdf`;
    const filePath = path.join(pdfsDir, filename);
    
    console.log('[Arxiv] 下载 PDF:', pdfUrl);
    console.log('[Arxiv] 保存到:', filePath);
    
    try {
      // 使用 https 模块下载
      const https = require('https');
      const http = require('http');
      
      const downloadFile = (url, dest) => {
        return new Promise((res, rej) => {
          const protocol = url.startsWith('https') ? https : http;
          const file = fs.createWriteStream(dest);
          
          const request = protocol.get(url, (response) => {
            // 处理重定向
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              file.close();
              fs.unlinkSync(dest);
              downloadFile(response.headers.location, dest).then(res).catch(rej);
              return;
            }
            
            if (response.statusCode !== 200) {
              file.close();
              fs.unlinkSync(dest);
              rej(new Error(`下载失败: HTTP ${response.statusCode}`));
              return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
              file.close();
              res();
            });
          });
          
          request.on('error', (err) => {
            file.close();
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            rej(err);
          });
          
          // 设置超时
          request.setTimeout(60000, () => {
            request.destroy();
            file.close();
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            rej(new Error('下载超时'));
          });
        });
      };
      
      await downloadFile(pdfUrl, filePath);
      
      console.log('[Arxiv] 下载完成:', filePath);
      resolve({ success: true, path: filePath, filename });
      
    } catch (err) {
      console.error('[Arxiv] 下载失败:', err);
      resolve({ success: false, error: err.message });
    }
  });
});

// 将 PDF 保存到合适的文件夹（使用 Agent ClassifySkill）
ipcMain.handle('arxiv:saveToFolder', async (event, pdfPath, description) => {
  try {
    if (!workspaceScanner?.currentWorkspace) {
      return { success: false, error: '未激活工作区' };
    }

    // 解析元数据
    const meta = JSON.parse(description);
    const sanitizedTitle = meta.title.replace(/[\\/:*?”<>|]/g, '_').substring(0, 100);
    const fileName = sanitizedTitle + '.pdf';

    // 使用 Agent 的 ClassifySkill 进行分类
    const classifyResult = await getAgent().classify({
      content: pdfPath,
      contentType: 'pdf',
      fileName: fileName
    });

    if (!classifyResult.success) {
      console.error('[SavePDF] 分类失败:', classifyResult.error);
      return { success: false, error: classifyResult.error || '分类失败' };
    }

    console.log(`[SavePDF] AI 分类结果: ${classifyResult.folderName} -> ${classifyResult.savePath}`);

    // 确保目录存在
    const dirPath = path.dirname(classifyResult.savePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // 复制文件到目标路径
    fs.copyFileSync(pdfPath, classifyResult.savePath);

    // 保存元数据 Sidecar
    metadataManager.saveMetadata(classifyResult.savePath, meta);

    console.log('[SavePDF] 论文已保存到:', classifyResult.savePath);
    return { success: true, path: classifyResult.savePath };

  } catch (err) {
    console.error('[SavePDF] 保存失败:', err);
    return { success: false, error: err.message };
  }
});

// ================= 定时推荐功能 =================

const SCHEDULE_FILE = path.join(__dirname, '..', 'tools', 'scheduled_searches.json');

// 加载定时任务配置
function loadScheduleConfig() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      const data = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Schedule] 加载配置失败:', err);
  }
  return { schedules: [] };
}

// 保存定时任务配置
function saveScheduleConfig(config) {
  try {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Schedule] 保存配置失败:', err);
    return false;
  }
}

// 检查是否应该触发定时任务
function checkScheduledTasks() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay(); // 0 = Sunday
  
  // 避免同一分钟内重复触发
  const currentMinuteKey = currentHour * 60 + currentMinute;
  if (currentMinuteKey === lastCheckedMinute) {
    return;
  }
  lastCheckedMinute = currentMinuteKey;
  
  const config = loadScheduleConfig();
  
  for (const schedule of config.schedules) {
    if (!schedule.enabled) continue;
    
    const [scheduleHour, scheduleMinute] = schedule.time.split(':').map(Number);
    
    // 检查时间是否匹配
    if (currentHour !== scheduleHour || currentMinute !== scheduleMinute) {
      continue;
    }
    
    // 检查重复规则
    let shouldTrigger = false;
    switch (schedule.repeat) {
      case 'daily':
        shouldTrigger = true;
        break;
      case 'weekdays':
        shouldTrigger = currentDay >= 1 && currentDay <= 5;
        break;
      case 'weekly':
        shouldTrigger = currentDay === 1; // 每周一
        break;
    }
    
    if (shouldTrigger) {
      console.log('[Schedule] 触发定时搜索:', schedule.keyword);
      triggerScheduledSearch(schedule);
    }
  }
}

// 执行定时搜索并发送通知
async function triggerScheduledSearch(schedule) {
  try {
    // 使用原生 JS 调用 Arxiv 搜索
    const result = await searchArxiv(schedule.keyword, 3);

    if (result.success && result.papers.length > 0) {
      const papers = result.papers;

      // 发送系统通知
      const notification = new Notification({
        title: `📚 定时推荐：${schedule.keyword}`,
        body: `找到 ${papers.length} 篇新论文\n${papers[0].title.substring(0, 50)}...`,
        icon: path.join(__dirname, '..', 'img', 'robot.png'),
      });

      notification.on('click', () => {
        // 点击通知时聚焦窗口并跳转到推荐页面
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('schedule:notification', {
            keyword: schedule.keyword,
            papers: papers
          });
        }
      });

      notification.show();

      // 同时发送到渲染进程显示应用内通知
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('schedule:notification', {
          keyword: schedule.keyword,
          papers: papers,
          showInApp: true
        });
      }
    }
  } catch (err) {
    console.error('[Schedule] 定时搜索失败:', err);
  }
}

// 启动定时检查
function startScheduleChecker() {
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval);
  }
  
  // 每30秒检查一次
  scheduleCheckInterval = setInterval(checkScheduledTasks, 30000);
  console.log('[Schedule] 定时检查器已启动');
}

// 保存定时任务
ipcMain.handle('schedule:save', async (event, scheduleData) => {
  try {
    const config = loadScheduleConfig();
    
    // 生成唯一ID
    scheduleData.id = Date.now().toString();
    scheduleData.createdAt = new Date().toISOString();
    
    config.schedules.push(scheduleData);
    
    if (saveScheduleConfig(config)) {
      console.log('[Schedule] 保存成功:', scheduleData);
      return { success: true, schedule: scheduleData };
    } else {
      return { success: false, error: '保存失败' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 加载定时任务
ipcMain.handle('schedule:load', async () => {
  try {
    const config = loadScheduleConfig();
    return { success: true, schedules: config.schedules };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 删除定时任务
ipcMain.handle('schedule:delete', async (event, id) => {
  try {
    const config = loadScheduleConfig();
    config.schedules = config.schedules.filter(s => s.id !== id);

    if (saveScheduleConfig(config)) {
      return { success: true };
    } else {
      return { success: false, error: '删除失败' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ================= Agent 智能处理 IPC =================

// 检查文献是否已在库
ipcMain.handle('arxiv:checkPresence', async (event, arxivId) => {
    try {
        if (!workspaceScanner?.currentWorkspace) {
            return { exists: false };
        }
        const found = metadataManager.findLocalByArxivId(arxivId, workspaceScanner.currentWorkspace.workspacePath);
        return { exists: !!found, path: found };
    } catch (err) {
        return { exists: false, error: err.message };
    }
});

// Agent 智能处理 IPC
ipcMain.handle('agent:process', async (event, instruction, context = {}) => {
  console.log('[Agent] 处理指令:', instruction);
  try {
    const result = await processInstruction(instruction, context);
    return { success: true, ...result };
  } catch (err) {
    console.error('[Agent] 处理失败:', err);
    return { success: false, error: err.message };
  }
});

// 在默认浏览器中打开外部链接
ipcMain.handle('shell:openExternal', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    console.error('[Shell] 打开链接失败:', err);
    return { success: false, error: err.message };
  }
});

// 在文件管理器中打开路径
ipcMain.handle('shell:openPath', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    console.error('[Shell] 打开路径失败:', err);
    return { success: false, error: err.message };
  }
});