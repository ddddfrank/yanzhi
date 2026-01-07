const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('node:path');
const { spawn } = require('child_process');
const fs = require('fs');

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
let keyboardManagerProcess = null;  // keyboard_manager.exe 进程
let folderWatcher = null;  // 文件夹监听器
let watchedFolderPath = null;  // 当前监听的文件夹路径
let watchDebounceTimer = null;  // 防抖定时器
let scheduleCheckInterval = null;  // 定时检查器
let lastCheckedMinute = -1;  // 上次检查的分钟，避免重复触发

// ================= 工具函数 =================

/**
 * 启动 keyboard_manager.exe
 */
function startKeyboardManager() {
  if (keyboardManagerProcess) {
    console.log('⚠️ keyboard_manager 已在运行');
    return { success: true, message: '已在运行' };
  }

  // exe 文件路径（相对于应用根目录）
  const exePath = path.join(__dirname, '..', 'tools', 'keyboard_manager.exe');
  const toolsDir = path.join(__dirname, '..', 'tools');

  console.log('🚀 启动 keyboard_manager.exe...');
  console.log(`   路径: ${exePath}`);

  try {
    keyboardManagerProcess = spawn(exePath, [], {
      cwd: toolsDir,  // 工作目录设为 tools，以便读取 token.env 和 folder_structure.json
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: false,  // 显示控制台窗口便于调试
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',  // 强制 Python 使用 UTF-8 编码
        PYTHONUTF8: '1',  // Python 3.7+ UTF-8 模式
      },
    });

    keyboardManagerProcess.stdout.on('data', (data) => {
      const text = data.toString('utf-8').trim();
      if (text) console.log(`[KeyboardManager] ${text}`);
    });

    keyboardManagerProcess.stderr.on('data', (data) => {
      const text = data.toString('utf-8').trim();
      if (text) console.error(`[KeyboardManager Error] ${text}`);
    });

    keyboardManagerProcess.on('close', (code) => {
      console.log(`[KeyboardManager] 进程退出，退出码: ${code}`);
      keyboardManagerProcess = null;
    });

    keyboardManagerProcess.on('error', (err) => {
      console.error('[KeyboardManager] 启动失败:', err);
      keyboardManagerProcess = null;
    });

    console.log('✅ keyboard_manager.exe 已启动');
    return { success: true, message: '启动成功' };

  } catch (err) {
    console.error('❌ 启动 keyboard_manager.exe 失败:', err);
    return { success: false, message: err.message };
  }
}

/**
 * 停止 keyboard_manager.exe
 */
function stopKeyboardManager() {
  if (keyboardManagerProcess) {
    console.log('🛑 停止 keyboard_manager.exe...');
    
    const pid = keyboardManagerProcess.pid;
    
    // Windows 上使用 taskkill 强制终止进程树
    if (process.platform === 'win32' && pid) {
      try {
        // /T 终止进程树，/F 强制终止
        require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { 
          stdio: 'ignore',
          windowsHide: true 
        });
        console.log('✅ 已使用 taskkill 终止进程');
      } catch (err) {
        // 进程可能已经退出，忽略错误
        console.log('⚠️ taskkill 执行完成（进程可能已退出）');
      }
    } else {
      // 非 Windows 系统使用 SIGKILL
      keyboardManagerProcess.kill('SIGKILL');
    }
    
    keyboardManagerProcess = null;
    return { success: true, message: '已停止' };
  }
  return { success: true, message: '未在运行' };
}

const createWindow = () => {
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

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();
  
  // 启动定时推荐检查器
  startScheduleChecker();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出时停止 keyboard_manager
app.on('will-quit', () => {
  stopKeyboardManager();
});

app.on('before-quit', () => {
  stopKeyboardManager();
});

// 处理进程信号（Ctrl+C 等）
process.on('SIGINT', () => {
  console.log('\n收到 SIGINT 信号，正在清理...');
  stopKeyboardManager();
  app.quit();
});

process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在清理...');
  stopKeyboardManager();
  app.quit();
});

// Windows 上处理控制台关闭事件
if (process.platform === 'win32') {
  process.on('SIGHUP', () => {
    stopKeyboardManager();
    app.quit();
  });
}

// ================= IPC 通信 =================

// 启动 keyboard_manager
ipcMain.handle('keyboard-manager:start', async () => {
  return startKeyboardManager();
});

// 停止 keyboard_manager
ipcMain.handle('keyboard-manager:stop', async () => {
  return stopKeyboardManager();
});

// 获取 keyboard_manager 状态
ipcMain.handle('keyboard-manager:status', async () => {
  return { running: keyboardManagerProcess !== null };
});

// ================= 文件夹操作 IPC =================

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
    const result = items.map(item => ({
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

// 创建子文件夹（调用 Python choose_to_save）
ipcMain.handle('folder:create', async (event, folderName, basePath) => {
  return new Promise((resolve) => {
    const toolsDir = path.join(__dirname, '..', 'tools');
    
    // 转义文件夹名和路径中的特殊字符
    const safeFolderName = folderName.replace(/'/g, "\\'").replace(/"/g, '\\"');
    const safeBasePath = basePath.replace(/\\/g, '/').replace(/'/g, "\\'");
    
    // 使用 Python 调用 create_folder 方法
    const pythonCode = `
import sys
import json
sys.path.insert(0, r'${toolsDir.replace(/\\/g, '/')}')

try:
    from choose_to_save import ContentManager
    manager = ContentManager()
    result = manager.create_folder('${safeFolderName}', r'${safeBasePath}')
    
    if result:
        # 获取刚创建的文件夹的描述
        description = ""
        for folder in manager.folder_config.get("folders", []):
            if folder["name"] == '${safeFolderName}':
                description = folder.get("description", "")
                break
        
        output = {"success": True, "path": result, "description": description}
        print("RESULT_JSON:" + json.dumps(output, ensure_ascii=False))
    else:
        print("RESULT_JSON:" + json.dumps({"success": False, "error": "创建失败"}))
except Exception as e:
    print("RESULT_JSON:" + json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
`;
    
    console.log('[CreateFolder] 开始创建文件夹:', folderName, '在', basePath);
    
    const proc = spawn('python', ['-c', pythonCode], {
      cwd: toolsDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    // 设置超时（30秒，因为需要 AI 生成描述）
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: '操作超时' });
    }, 30000);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
      console.log(`[CreateFolder] ${data.toString('utf-8').trim()}`);
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
      console.error(`[CreateFolder Error] ${data.toString('utf-8').trim()}`);
    });
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      
      // 解析 JSON 结果
      if (stdout.includes('RESULT_JSON:')) {
        try {
          const jsonStr = stdout.split('RESULT_JSON:')[1].split('\n')[0].trim();
          const result = JSON.parse(jsonStr);
          resolve(result);
        } catch (e) {
          console.error('[CreateFolder] JSON 解析失败:', e);
          resolve({ success: false, error: '结果解析失败: ' + e.message });
        }
      } else {
        resolve({ success: false, error: stderr || stdout || '未知错误' });
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[CreateFolder] 进程错误:', err);
      resolve({ success: false, error: err.message });
    });
  });
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

// 读取 PDF 文件内容（使用 OCR）
ipcMain.handle('file:readPdf', async (event, filePath) => {
  return new Promise((resolve) => {
    const toolsDir = path.join(__dirname, '..', 'tools');
    
    // 转义文件路径
    const safeFilePath = filePath.replace(/\\/g, '/').replace(/'/g, "\\'");
    
    // 使用 Python 调用 OCR 读取 PDF
    const pythonCode = `
import sys
import os
sys.path.insert(0, r'${toolsDir.replace(/\\/g, '/')}')

try:
    import fitz  # PyMuPDF
    from PIL import Image
    import io
    from ask_ai import AIClient
    
    pdf_path = r'${safeFilePath}'
    print(f"[Python] 正在读取 PDF: {pdf_path}", file=sys.stderr)
    
    if not os.path.exists(pdf_path):
        print('PDF_ERROR:文件不存在')
        sys.exit(1)
    
    # 打开 PDF
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    print(f"[Python] PDF 共 {total_pages} 页", file=sys.stderr)
    
    all_text = []
    max_pages = min(5, total_pages)  # 最多处理前5页
    
    for page_num in range(max_pages):
        page = doc[page_num]
        print(f"[Python] 正在处理第 {page_num + 1} 页...", file=sys.stderr)
        
        # 先尝试直接提取文本
        text = page.get_text()
        if text.strip():
            all_text.append(f"--- 第 {page_num + 1} 页 ---")
            all_text.append(text.strip())
            print(f"[Python] 第 {page_num + 1} 页: 直接提取文本成功", file=sys.stderr)
        else:
            # 如果没有文本，使用 OCR
            print(f"[Python] 第 {page_num + 1} 页: 无文本，使用 OCR...", file=sys.stderr)
            # 将页面渲染为图片
            mat = fitz.Matrix(2, 2)  # 2x 缩放以提高 OCR 精度
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            
            # 转为 PIL Image
            img = Image.open(io.BytesIO(img_data))
            
            # 初始化 AI 客户端（用于 OCR）
            client = AIClient(system_prompt="你是一个 OCR 助手，请准确识别图片中的所有文字内容，保持原有格式。")
            
            # 调用 OCR
            ocr_text = client._ocr_image(img)
            all_text.append(f"--- 第 {page_num + 1} 页 (OCR) ---")
            all_text.append(ocr_text)
            print(f"[Python] 第 {page_num + 1} 页: OCR 完成", file=sys.stderr)
    
    doc.close()
    
    if total_pages > max_pages:
        all_text.append(f"\\n... (仅显示前 {max_pages} 页，共 {total_pages} 页)")
    
    result_text = "\\n\\n".join(all_text)
    print(f"[Python] PDF 读取完成，内容长度: {len(result_text)}", file=sys.stderr)
    print('PDF_CONTENT_START')
    print(result_text)
    print('PDF_CONTENT_END')
    
except ImportError as e:
    print(f'[Python] 导入错误: {e}', file=sys.stderr)
    print('PDF_ERROR:缺少 PyMuPDF 库，请运行: pip install PyMuPDF')
except Exception as e:
    import traceback
    print(f'[Python] 异常: {e}', file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    print('PDF_ERROR:' + str(e))
`;
    
    console.log('[PDF OCR] 开始读取 PDF:', filePath);
    
    const proc = spawn('python', ['-c', pythonCode], {
      cwd: toolsDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    // 设置超时（60秒，OCR 可能较慢）
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: 'PDF 读取超时' });
    }, 60000);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
      console.error(`[PDF OCR Error] ${data.toString('utf-8').trim()}`);
    });
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      
      if (stdout.includes('PDF_CONTENT_START') && stdout.includes('PDF_CONTENT_END')) {
        const content = stdout
          .split('PDF_CONTENT_START')[1]
          .split('PDF_CONTENT_END')[0]
          .trim();
        console.log('[PDF OCR] 读取成功，内容长度:', content.length);
        resolve({ success: true, content });
      } else if (stdout.includes('PDF_ERROR:')) {
        const error = stdout.split('PDF_ERROR:')[1].split('\\n')[0].trim();
        resolve({ success: false, error });
      } else {
        resolve({ success: false, error: stderr || '读取 PDF 失败' });
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
});

// AI 问答（调用 Python ask_ai）
ipcMain.handle('ai:ask', async (event, question, fileContent, fileName) => {
  return new Promise((resolve) => {
    const toolsDir = path.join(__dirname, '..', 'tools');
    
    // 构建提示词
    let prompt = question;
    if (fileContent && fileName) {
      prompt = `我正在阅读文件《${fileName}》，内容如下：\n\n${fileContent.substring(0, 3000)}${fileContent.length > 3000 ? '\n...（内容已截断）' : ''}\n\n用户问题：${question}`;
    }
    
    // 转义特殊字符用于 Python 字符串
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
    
    const pythonCode = `
import sys
sys.path.insert(0, r'${toolsDir.replace(/\\/g, '/')}')
from ask_ai import ask_ai

try:
    response = ask_ai(text="""${escapedPrompt}""")
    print('AI_RESPONSE_START')
    print(response)
    print('AI_RESPONSE_END')
except Exception as e:
    print('AI_ERROR:' + str(e))
`;
    
    const proc = spawn('python', ['-c', pythonCode], {
      cwd: toolsDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
      console.log(`[AI] ${data.toString('utf-8').trim()}`);
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
      console.error(`[AI Error] ${data.toString('utf-8').trim()}`);
    });
    
    proc.on('close', (code) => {
      if (stdout.includes('AI_RESPONSE_START') && stdout.includes('AI_RESPONSE_END')) {
        const response = stdout
          .split('AI_RESPONSE_START')[1]
          .split('AI_RESPONSE_END')[0]
          .trim();
        resolve({ success: true, response });
      } else if (stdout.includes('AI_ERROR:')) {
        const error = stdout.split('AI_ERROR:')[1].trim();
        resolve({ success: false, error });
      } else {
        resolve({ success: false, error: stderr || 'AI 调用失败' });
      }
    });
    
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// ================= Arxiv 搜索与下载 IPC =================

// 搜索 Arxiv 论文
ipcMain.handle('arxiv:search', async (event, query, maxResults = 5) => {
  return new Promise((resolve) => {
    const toolsDir = path.join(__dirname, '..', 'tools');
    
    const pythonCode = `
import sys
import json
sys.path.insert(0, r'${toolsDir.replace(/\\/g, '/')}')

try:
    from research_article import ArxivRecommender
    recommender = ArxivRecommender(max_results=${maxResults})
    papers = recommender.get_latest_papers("""${query.replace(/"/g, '\\"')}""")
    print('ARXIV_RESULT:' + json.dumps(papers, ensure_ascii=False))
except Exception as e:
    print('ARXIV_ERROR:' + str(e))
`;
    
    console.log('[Arxiv] 搜索:', query);
    
    const proc = spawn('python', ['-c', pythonCode], {
      cwd: toolsDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    // 设置超时（30秒）
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: '搜索超时' });
    }, 30000);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
    });
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      
      if (stdout.includes('ARXIV_RESULT:')) {
        try {
          const jsonStr = stdout.split('ARXIV_RESULT:')[1].trim();
          const papers = JSON.parse(jsonStr);
          console.log('[Arxiv] 找到', papers.length, '篇论文');
          resolve({ success: true, papers });
        } catch (e) {
          console.error('[Arxiv] JSON 解析失败:', e);
          resolve({ success: false, error: '结果解析失败: ' + e.message });
        }
      } else if (stdout.includes('ARXIV_ERROR:')) {
        const error = stdout.split('ARXIV_ERROR:')[1].trim();
        resolve({ success: false, error });
      } else {
        resolve({ success: false, error: stderr || '搜索失败' });
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
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

// 将 PDF 保存到合适的文件夹（调用 choose_to_save）
ipcMain.handle('arxiv:saveToFolder', async (event, pdfPath, description) => {
  return new Promise((resolve) => {
    const toolsDir = path.join(__dirname, '..', 'tools');
    
    const safePdfPath = pdfPath.replace(/\\/g, '/');
    const safeDescription = description.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, ' ');
    
    const pythonCode = `
import sys
import json
sys.path.insert(0, r'${toolsDir.replace(/\\/g, '/')}')

try:
    from choose_to_save import ContentManager, InputType
    manager = ContentManager()
    
    result_path = manager.save_content(
        InputType.PDF,
        r'${safePdfPath}',
        description="""${safeDescription}""",
        sub_folder="文章"
    )
    
    if result_path:
        print('SAVE_RESULT:' + json.dumps({"success": True, "path": result_path}, ensure_ascii=False))
    else:
        print('SAVE_RESULT:' + json.dumps({"success": False, "error": "保存失败"}))
except Exception as e:
    print('SAVE_RESULT:' + json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
`;
    
    console.log('[SavePDF] 保存到合适文件夹:', pdfPath);
    
    const proc = spawn('python', ['-c', pythonCode], {
      cwd: toolsDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    
    let stdout = '';
    let stderr = '';
    
    // 设置超时（30秒）
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: '操作超时' });
    }, 30000);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
      console.log(`[SavePDF] ${data.toString('utf-8').trim()}`);
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
    });
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      
      if (stdout.includes('SAVE_RESULT:')) {
        try {
          const jsonStr = stdout.split('SAVE_RESULT:')[1].trim();
          const result = JSON.parse(jsonStr);
          resolve(result);
        } catch (e) {
          resolve({ success: false, error: '结果解析失败' });
        }
      } else {
        resolve({ success: false, error: stderr || '保存失败' });
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
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
    // 调用 Arxiv 搜索
    const toolsDir = path.join(__dirname, '..', 'tools');
    
    const pythonCode = `
import sys
import json
sys.path.insert(0, r'${toolsDir.replace(/\\/g, '/')}')

try:
    from research_article import ArxivRecommender
    recommender = ArxivRecommender(max_results=3)
    papers = recommender.get_latest_papers("""${schedule.keyword.replace(/"/g, '\\"')}""")
    print('ARXIV_RESULT:' + json.dumps(papers, ensure_ascii=False))
except Exception as e:
    print('ARXIV_ERROR:' + str(e))
`;
    
    const proc = spawn('python', ['-c', pythonCode], {
      cwd: toolsDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    
    let stdout = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });
    
    proc.on('close', (code) => {
      if (stdout.includes('ARXIV_RESULT:')) {
        try {
          const jsonStr = stdout.split('ARXIV_RESULT:')[1].trim();
          const papers = JSON.parse(jsonStr);
          
          if (papers.length > 0) {
            // 发送系统通知
            const notification = new Notification({
              title: `📚 定时推荐: ${schedule.keyword}`,
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
        } catch (e) {
          console.error('[Schedule] 解析结果失败:', e);
        }
      }
    });
    
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