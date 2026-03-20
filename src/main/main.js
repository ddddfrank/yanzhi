// File tree data structure
let fileTreeData = [];

// Current opened folder path
let currentFolderPath = null;

// Current selected folder path (for creating subfolders)
let currentSelectedFolder = null;

// Current selected file
let currentFile = null;

// 附件列表
let attachedFiles = [];

// 是否正在刷新
let isRefreshing = false;

// 是否正在懒加载（避免触发文件监听刷新）
let isLazyLoading = false;

// 外部拖拽/上传支持的格式白名单
const SUPPORTED_UPLOAD_EXTENSIONS = ['pdf', 'txt', 'md', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

// 显示 Toast 通知
function showMainToast(message, type = 'success') {
  // 移除已存在的 toast
  const existingToast = document.querySelector('.main-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `main-toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span>
    <span class="toast-message">${message}</span>
  `;
  document.body.appendChild(toast);
  
  // 显示动画
  setTimeout(() => toast.classList.add('show'), 10);
  
  // 3秒后自动关闭
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function isSupportedUploadExtension(ext) {
  return SUPPORTED_UPLOAD_EXTENSIONS.includes(String(ext || '').toLowerCase());
}

function getUnsupportedExtensionList(files) {
  const unsupported = new Set();
  files.forEach((file) => {
    const ext = getFileExtension(file.name);
    if (!isSupportedUploadExtension(ext)) {
      unsupported.add(ext || '(无扩展名)');
    }
  });
  return Array.from(unsupported);
}

function getSupportedFiles(files) {
  return files.filter((file) => isSupportedUploadExtension(getFileExtension(file.name)));
}

// ================= 文件夹状态持久化 =================

// 保存文件夹状态到 sessionStorage
function saveFolderState() {
  if (currentFolderPath) {
    const state = {
      folderPath: currentFolderPath,
      expandedPaths: Array.from(getExpandedPaths(fileTreeData)),
      timestamp: Date.now()
    };
    sessionStorage.setItem('folderState', JSON.stringify(state));
    console.log('保存文件夹状态:', state.folderPath);
  }
}

// 从 sessionStorage 恢复文件夹状态
async function restoreFolderState() {
  try {
    const stateStr = sessionStorage.getItem('folderState');
    if (!stateStr) return false;
    
    const state = JSON.parse(stateStr);
    
    // 检查状态是否过期（24小时）
    if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem('folderState');
      return false;
    }
    
    console.log('恢复文件夹状态:', state.folderPath);
    
    // 恢复文件夹路径
    currentFolderPath = state.folderPath;

    // 读取文件夹内容
    const readResult = await window.electronAPI.folder.read(currentFolderPath);
    if (!readResult.success) {
      console.warn('恢复文件夹失败:', readResult.error);
      sessionStorage.removeItem('folderState');
      return false;
    }

    // 激活工作区（同一路径复用已有 workspaceId）
    if (window.electronAPI.workspace?.setActive) {
      const workspaceResult = await window.electronAPI.workspace.setActive(currentFolderPath);
      if (!workspaceResult?.success) {
        console.warn('恢复状态时激活工作区失败:', workspaceResult?.error || '未知错误');
      }
    }
    
    // 转换为树形数据
    fileTreeData = convertToTreeData(readResult.items, currentFolderPath);
    
    // 恢复展开状态
    if (state.expandedPaths && state.expandedPaths.length > 0) {
      const expandedSet = new Set(state.expandedPaths);
      isLazyLoading = true;
      try {
        await loadExpandedFolders(fileTreeData, expandedSet);
      } finally {
        setTimeout(() => {
          isLazyLoading = false;
        }, 600);
      }
    }
    
    renderFileTree();
    
    // 启动文件监听
    await startFolderWatch(currentFolderPath);
    
    return true;
  } catch (error) {
    console.error('恢复文件夹状态失败:', error);
    sessionStorage.removeItem('folderState');
    return false;
  }
}

// ================= 自定义对话框 =================

// 显示提示框（替代 alert）
function showAlert(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-content">${message}</div>
        <div class="dialog-buttons">
          <button class="dialog-btn dialog-btn-primary" id="alertOkBtn">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    document.getElementById('alertOkBtn').onclick = () => {
      overlay.remove();
      resolve();
    };
  });
}

// 显示确认框（替代 confirm）
function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-content">${message}</div>
        <div class="dialog-buttons">
          <button class="dialog-btn" id="confirmCancelBtn">取消</button>
          <button class="dialog-btn dialog-btn-primary" id="confirmOkBtn">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    document.getElementById('confirmOkBtn').onclick = () => {
      overlay.remove();
      resolve(true);
    };
    document.getElementById('confirmCancelBtn').onclick = () => {
      overlay.remove();
      resolve(false);
    };
  });
}

// 显示输入框（替代 prompt）
function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-content">${message}</div>
        <input type="text" class="dialog-input" id="promptInput" value="${defaultValue}" placeholder="请输入...">
        <div class="dialog-buttons">
          <button class="dialog-btn" id="promptCancelBtn">取消</button>
          <button class="dialog-btn dialog-btn-primary" id="promptOkBtn">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    const input = document.getElementById('promptInput');
    input.focus();
    input.select();
    
    // 回车确认
    input.onkeypress = (e) => {
      if (e.key === 'Enter') {
        overlay.remove();
        resolve(input.value);
      }
    };
    
    document.getElementById('promptOkBtn').onclick = () => {
      overlay.remove();
      resolve(input.value);
    };
    document.getElementById('promptCancelBtn').onclick = () => {
      overlay.remove();
      resolve(null);
    };
  });
}

// 打开文件夹并读取内容
async function openFolder() {
  try {
    const openResult = await window.electronAPI.folder.open();
    if (!openResult || !openResult.success) {
      console.log('用户取消了文件夹选择');
      return; // 用户取消选择
    }

    const folderPath = openResult.path;
    console.log('用户选择的文件夹路径:', folderPath);

    currentFolderPath = folderPath;
    console.log('设置当前文件夹路径为:', currentFolderPath);

    // 清空中间展示区域
    const displayArea = document.getElementById('displayArea');
    if (displayArea) {
      displayArea.innerHTML = `
        <div class="empty-state">
          <img src="../../img/Folder.png" alt="Folder" class="empty-icon" />
          <p>选择一个文件内容进行查看</p>
        </div>
      `;
    }

    // 清空右侧对话区域
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.innerHTML = '';
    }

    // 读取文件夹内容
    const readResult = await window.electronAPI.folder.read(folderPath);
    if (!readResult.success) {
      console.error('读取文件夹失败:', readResult.error);
      await showAlert(`无法读取文件夹: ${readResult.error || '未知错误'}\n请确保文件夹存在且有访问权限。`);
      return;
    }

    console.log('文件夹内容读取成功，项目数量:', readResult.items.length);

    // 激活工作区（同一路径复用已有 workspaceId）
    if (window.electronAPI.workspace?.setActive) {
      console.log('开始激活工作区...');
      const workspaceResult = await window.electronAPI.workspace.setActive(folderPath);
      console.log('工作区激活结果:', workspaceResult);

      if (!workspaceResult?.success) {
        console.warn('激活工作区失败:', workspaceResult?.error || '未知错误');
        await showAlert('工作区激活失败，但文件夹已打开。您可以在知识体系管理页面查看统计信息。');
      } else {
        console.log('工作区激活成功，ID:', workspaceResult.workspaceId);
      }
    } else {
      console.warn('工作区API不可用');
    }

    // 将文件系统内容转换为 fileTreeData 格式
    fileTreeData = convertToTreeData(readResult.items, folderPath);
    renderFileTree();

    // 保存文件夹状态
    saveFolderState();

    // 启动文件监听
    await startFolderWatch(folderPath);

    console.log('文件夹打开流程完成');
  } catch (error) {
    console.error('打开文件夹失败:', error);
    await showAlert('打开文件夹失败: ' + error.message);
  }
}

// 启动文件夹监听
async function startFolderWatch(folderPath) {
  try {
    // 停止之前的监听
    await window.electronAPI.folder.unwatch();
    
    // 移除之前的事件监听器
    window.electronAPI.folder.removeUpdateListener();
    
    // 启动新的监听
    const result = await window.electronAPI.folder.watch(folderPath);
    if (result.success) {
      console.log('文件监听已启动');
      updateFolderStatus('watching', folderPath);
      
      // 注册文件变化回调
      window.electronAPI.folder.onUpdate(async (data) => {
        // 如果正在懒加载，跳过刷新
        if (isLazyLoading) {
          console.log('懒加载期间，跳过文件监听刷新');
          return;
        }
        console.log('检测到文件变化:', data);
        await refreshFileTree(true);  // 自动刷新
      });
    }
  } catch (error) {
    console.error('启动文件监听失败:', error);
    updateFolderStatus('error', folderPath);
  }
}

// 更新文件夹状态显示
function updateFolderStatus(status, folderPath) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  if (!statusDot || !statusText) return;
  
  statusDot.className = 'status-dot';
  
  switch (status) {
    case 'watching':
      statusDot.classList.add('watching');
      const folderName = folderPath.split(/[/\\]/).pop();
      statusText.textContent = `监听中: ${folderName}`;
      break;
    case 'refreshing':
      statusDot.classList.add('refreshing');
      statusText.textContent = '正在刷新...';
      break;
    case 'error':
      statusDot.classList.add('error');
      statusText.textContent = '监听失败';
      break;
    default:
      statusText.textContent = '未打开文件夹';
  }
}

// 刷新文件树
async function refreshFileTree(isAuto = false) {
  if (!currentFolderPath || isRefreshing) return;
  
  isRefreshing = true;
  
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshIcon = document.getElementById('refreshIcon');
  
  // 添加旋转动画
  if (refreshIcon) {
    refreshIcon.classList.add('spinning');
  }
  if (refreshBtn) {
    refreshBtn.disabled = true;
  }
  
  // 更新状态
  updateFolderStatus('refreshing', currentFolderPath);
  
  try {
    // 保存当前展开状态
    const expandedPaths = getExpandedPaths(fileTreeData);
    
    // 重新读取文件夹内容
    const readResult = await window.electronAPI.folder.read(currentFolderPath);
    if (readResult.success) {
      fileTreeData = convertToTreeData(readResult.items, currentFolderPath);
      
      // 异步加载已展开文件夹的子内容
      if (expandedPaths.size > 0) {
        isLazyLoading = true;  // 防止触发文件监听刷新
        try {
          await loadExpandedFolders(fileTreeData, expandedPaths);
        } finally {
          setTimeout(() => {
            isLazyLoading = false;
          }, 600);
        }
      }
      
      renderFileTree();
      console.log(isAuto ? '自动刷新完成' : '手动刷新完成');
      
      // 保存文件夹状态
      saveFolderState();
    }
    
    // 恢复状态
    updateFolderStatus('watching', currentFolderPath);
    
  } catch (error) {
    console.error('刷新失败:', error);
    updateFolderStatus('error', currentFolderPath);
  } finally {
    isRefreshing = false;
    
    // 移除旋转动画
    if (refreshIcon) {
      refreshIcon.classList.remove('spinning');
    }
    if (refreshBtn) {
      refreshBtn.disabled = false;
    }
  }
}

// 获取当前展开的文件夹路径
function getExpandedPaths(items, paths = new Set()) {
  for (const item of items) {
    if (item.type === 'folder' && item.expanded) {
      paths.add(item.path);
      if (item.children && item.children.length > 0) {
        getExpandedPaths(item.children, paths);
      }
    }
  }
  return paths;
}

// 恢复展开状态（递归处理所有层级）
function restoreExpandedPaths(items, expandedPaths) {
  for (const item of items) {
    if (item.type === 'folder') {
      if (expandedPaths.has(item.path)) {
        item.expanded = true;
      }
      // 递归处理子文件夹
      if (item.children && item.children.length > 0) {
        restoreExpandedPaths(item.children, expandedPaths);
      }
    }
  }
}

// 异步加载已展开文件夹的子内容
async function loadExpandedFolders(items, expandedPaths) {
  for (const item of items) {
    if (item.type === 'folder' && expandedPaths.has(item.path)) {
      item.expanded = true;
      // 加载子文件夹内容
      try {
        const readResult = await window.electronAPI.folder.read(item.path);
        if (readResult.success) {
          item.children = convertToTreeData(readResult.items, item.path);
          // 递归加载子文件夹中已展开的内容
          await loadExpandedFolders(item.children, expandedPaths);
        }
      } catch (error) {
        console.error('加载展开文件夹内容失败:', error);
      }
    }
  }
}

// 将文件系统内容转换为树形数据结构
function convertToTreeData(items, basePath) {
  if (!items || !Array.isArray(items)) {
    console.warn('convertToTreeData: items 不是数组', items);
    return [];
  }
  
  return items.map(item => {
    const fullPath = item.path || `${basePath}/${item.name}`;
    
    if (item.type === 'folder') {
      return {
        name: item.name,
        type: 'folder',
        path: fullPath,
        expanded: false,
        children: [] // 子文件夹内容将在展开时懒加载
      };
    } else {
      return {
        name: item.name,
        type: 'file',
        path: fullPath,
        fileType: item.fileType || getFileType(item.name)
      };
    }
  });
}

// 创建子文件夹（使用 choose_to_save 的方法）
async function createSubFolder() {
  const targetPath = currentSelectedFolder || currentFolderPath;
  console.log('createSubFolder 被调用, targetPath =', targetPath);
  
  // 如果没有打开文件夹，先让用户选择一个
  if (!targetPath) {
    const confirmOpen = await showConfirm('请先选择一个文件夹作为父目录。<br>点击"确定"选择文件夹。');
    if (!confirmOpen) return;
    
    await openFolder();
    if (!currentFolderPath) {
      return; // 用户取消了选择
    }
    // 如果刚打开了文件夹，targetPath 就是 currentFolderPath
  }
  
  // 弹出输入框让用户输入文件夹名称
  const folderName = await showPrompt('请输入新建文件夹的名称（将用于研究主题）：<br><br>例如：Transformer、强化学习、图神经网络');
  console.log('用户输入的文件夹名称:', folderName);
  
  if (!folderName || folderName.trim() === '') {
    console.log('用户取消或输入为空');
    return; // 用户取消或输入为空
  }
  
  try {
    // 确定父目录：如果当前选中了文件夹，则在该文件夹下创建；否则在根目录下创建
    const parentPath = currentSelectedFolder || currentFolderPath;
    
    // 调用后端创建文件夹
    console.log('开始创建文件夹:', folderName, '在', parentPath);
    const result = await window.electronAPI.folder.create(folderName.trim(), parentPath);
    console.log('创建结果:', result);
    
    if (result.success) {
      console.log('文件夹创建成功:', result.path);

      // 确保默认 Markdown 文件存在（双重保障）
      try {
        const mdFileName = `${folderName.trim()}.md`;
        // 读取新文件夹内容检查
        const readResult = await window.electronAPI.folder.read(result.path);
        if (readResult.success) {
          const hasMdFile = readResult.items.some(item => item.name === mdFileName);
          if (!hasMdFile) {
            console.log('默认Markdown文件未找到，尝试手动创建...');
            // 猜测路径分隔符
            const sep = result.path.includes('\\') ? '\\' : '/';
            const mdPath = `${result.path}${sep}${mdFileName}`;
            const mdContent = `# ${folderName.trim()}\n\n在这里记录关于 ${folderName.trim()} 的笔记...`;
            await window.electronAPI.file.write(mdPath, mdContent);
            console.log('手动创建默认Markdown文件成功');
          }
        }
      } catch (e) {
        console.error('检查默认Markdown文件失败:', e);
      }

      // 重新激活工作区以更新统计数据
      if (window.electronAPI.workspace?.setActive) {
        console.log('重新激活工作区以更新统计...');
        // 注意：这里仍然激活根工作区，而不是新创建的子文件夹
        const workspaceResult = await window.electronAPI.workspace.setActive(currentFolderPath);
        console.log('工作区重新激活结果:', workspaceResult);
      }

      // 刷新文件树
      // 如果是在子文件夹创建，可能需要展开该子文件夹
      // 这里简单起见，刷新整个树，保留展开状态
      await refreshFileTree(false);

      await showAlert(`文件夹 "${folderName}" 创建成功！<br><br>📝 描述: ${result.description || '无'}`);
    } else {
      await showAlert('创建文件夹失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    console.error('创建子文件夹失败:', error);
    await showAlert('创建子文件夹失败: ' + error.message);
  }
}
let chatHistory = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // 先尝试恢复文件夹状态
  const restored = await restoreFolderState();
  if (!restored) {
    renderFileTree();
  }

  setupEventListeners();
  loadChatHistory();
  initCollapseButtons();
  
  // 检查是否有从其他页面跳转过来的待处理文件
  await handlePendingFile();
});

// 处理从其他页面跳转过来的待处理文件
async function handlePendingFile() {
  // 检查是否有从recommend页面跳转的待显示文件
  const displayFilePath = sessionStorage.getItem('displayFilePath');
  if (displayFilePath) {
    sessionStorage.removeItem('displayFilePath');
    console.log('[DisplayFile] 显示文件:', displayFilePath);
    
    // 获取文件名和类型
    const fileName = displayFilePath.split(/[/\\]/).pop();
    const fileType = getFileExtension(fileName);
    
    // 创建虚拟文件对象
    const fileObj = {
      name: fileName,
      path: displayFilePath,
      fileType: fileType,
      size: 0, // 未知
      modified: new Date().toISOString()
    };
    
    // 设置为当前文件并显示
    currentFile = fileObj;
    
    // 将文件自动添加到 AI 对话框的附件中
    addAttachment(fileObj);
    
    await displayFileFromPath(displayFilePath, fileName, fileType);
    return;
  }
  
  const pendingFileStr = sessionStorage.getItem('pendingFile');
  if (!pendingFileStr) return;
  
  // 清除待处理项，避免重复处理
  sessionStorage.removeItem('pendingFile');
  
  try {
    const pendingFile = JSON.parse(pendingFileStr);
    console.log('[PendingFile] 处理待处理文件:', pendingFile);
    
    const { action, filePath, fileName, fileType, aiPrompt } = pendingFile;
    
    // 创建一个虚拟的文件对象用于显示
    const fileData = await loadFileForDisplay(filePath, fileName, fileType);
    if (!fileData) {
      console.error('[PendingFile] 无法加载文件:', filePath);
      return;
    }
    
    // 在展示区显示文件
    await displayFileFromPath(filePath, fileName, fileType);
    
    // 如果是 AI 分析请求，自动发送消息
    if (action === 'ai-analyze' && aiPrompt) {
      // 延迟一下确保文件已经显示
      setTimeout(async () => {
        await sendAIAnalysisRequest(filePath, fileName, fileType, aiPrompt);
      }, 500);
    }
  } catch (err) {
    console.error('[PendingFile] 处理待处理文件失败:', err);
  }
}

// 从路径加载文件用于显示
async function loadFileForDisplay(filePath, fileName, fileType) {
  try {
    const result = await window.electronAPI.file.read(filePath);
    if (result.success) {
      return {
        name: fileName,
        path: filePath,
        type: fileType,
        content: result.content
      };
    }
    return null;
  } catch (err) {
    console.error('[LoadFile] 加载文件失败:', err);
    return null;
  }
}

// 从路径显示文件内容
async function displayFileFromPath(filePath, fileName, fileType) {
  const displayArea = document.getElementById('displayArea');
  displayArea.style.display = 'flex';
  displayArea.innerHTML = '<div class="loading">加载中...</div>';
  
  try {
    if (fileType === 'image') {
      // 图片直接显示
      const img = document.createElement('img');
      img.src = `file://${filePath}`;
      img.className = 'file-preview';
      img.onerror = () => {
        displayArea.innerHTML = '<div class="error" style="color: #ff6b6b; padding: 20px;">图片加载失败</div>';
      };
      displayArea.innerHTML = '';
      displayArea.appendChild(img);
    } else if (fileType === 'pdf') {
      // PDF 使用 embed 显示
      const pdfContainer = document.createElement('div');
      pdfContainer.className = 'pdf-viewer-container';
      
      const embed = document.createElement('embed');
      embed.src = `file://${filePath}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
      embed.className = 'pdf-embed';
      embed.type = 'application/pdf';
      
      pdfContainer.appendChild(embed);
      displayArea.innerHTML = '';
      displayArea.appendChild(pdfContainer);
    } else {
      // 文本文件读取内容
      const result = await window.electronAPI.file.read(filePath);
      if (result.success && result.content) {
        const div = document.createElement('div');
        div.className = 'file-preview';
        
        if (fileType === 'note' || fileName.endsWith('.md')) {
          const renderedContent = renderMarkdown(result.content);
          div.innerHTML = `<div class="markdown-content">${renderedContent}</div>`;
          // 绑定本地文件链接点击事件（传入基准路径以解析相对路径，仿照插入笔记模式）
          bindLocalFileLinks(div, getDirname(filePath));
        } else {
          div.innerHTML = `<pre style="color: #ffffff; white-space: pre-wrap; padding: 20px;">${escapeHtml(result.content)}</pre>`;
        }
        
        displayArea.innerHTML = '';
        displayArea.appendChild(div);
      } else {
        displayArea.innerHTML = '<div class="error" style="color: #ff6b6b; padding: 20px;">无法读取文件内容</div>';
      }
    }
  } catch (error) {
    console.error('[DisplayFile] 显示文件失败:', error);
    displayArea.innerHTML = `<div class="error" style="color: #ff6b6b; padding: 20px;">显示文件失败：${error.message}</div>`;
  }
}

// 发送 AI 分析请求
async function sendAIAnalysisRequest(filePath, fileName, fileType, prompt) {
  try {
    // 获取文件内容
    let fileContent = '';
    if (fileType === 'image') {
      fileContent = `[图片文件: ${fileName}]`;
    } else if (fileType === 'pdf') {
      // 尝试读取 PDF 内容
      const pdfResult = await window.electronAPI.file.readPdf(filePath);
      if (pdfResult.success) {
        fileContent = pdfResult.content;
      } else {
        fileContent = `[PDF文件: ${fileName}]`;
      }
    } else {
      const result = await window.electronAPI.file.read(filePath);
      if (result.success) {
        fileContent = result.content;
      }
    }
    
    // 在聊天区显示用户消息
    const chatMessages = document.getElementById('chatMessages');
    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'message user';
    userMsgDiv.innerHTML = `<div class="message-content">${escapeHtml(prompt)}</div>`;
    chatMessages.appendChild(userMsgDiv);
    
    // 显示加载中
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.innerHTML = '<div class="message-content">正在分析文件内容，请稍候...</div>';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 调用 AI
    const aiResult = await window.electronAPI.ai.ask(prompt, fileContent, fileName);
    
    // 移除加载消息
    loadingDiv.remove();
    
    // 显示 AI 回复
    const aiMsgDiv = document.createElement('div');
    aiMsgDiv.className = 'message assistant';
    if (aiResult.success) {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.innerHTML = renderMarkdown(aiResult.response);

      // 为外部链接添加点击处理，在默认浏览器中打开
      contentDiv.querySelectorAll('.external-link').forEach(link => {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          const url = link.dataset.url;
          if (url) {
            await window.electronAPI.shell.openExternal(url);
          }
        });
      });

      // 为本地文件链接添加点击处理，在主界面打开（传入工作区根目录解析相对路径）
      bindLocalFileLinks(contentDiv, currentFolderPath);

      aiMsgDiv.appendChild(contentDiv);
    } else {
      aiMsgDiv.innerHTML = `<div class="message-content" style="color: #ff6b6b;">AI 分析失败: ${aiResult.error}</div>`;
    }
    chatMessages.appendChild(aiMsgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 保存到聊天历史
    saveChatHistory();
    
  } catch (err) {
    console.error('[AIAnalysis] AI 分析失败:', err);
  }
}

// ================= 侧板折叠功能 =================

// 初始化折叠按钮
function initCollapseButtons() {
  const leftCollapseBtn = document.getElementById('leftCollapseBtn');
  const rightCollapseBtn = document.getElementById('rightCollapseBtn');
  const leftPanel = document.querySelector('.left-panel');
  const rightPanel = document.querySelector('.right-panel');
  const appContainer = document.querySelector('.app-container');

  function syncContainerCollapseState() {
    if (!appContainer || !leftPanel || !rightPanel) return;

    const leftCollapsed = leftPanel.classList.contains('collapsed');
    const rightCollapsed = rightPanel.classList.contains('collapsed');

    appContainer.classList.remove('left-collapsed', 'right-collapsed', 'both-collapsed');
    if (leftCollapsed && rightCollapsed) {
      appContainer.classList.add('both-collapsed');
    } else if (leftCollapsed) {
      appContainer.classList.add('left-collapsed');
    } else if (rightCollapsed) {
      appContainer.classList.add('right-collapsed');
    }

    leftCollapseBtn?.classList.toggle('collapsed', leftCollapsed);
    rightCollapseBtn?.classList.toggle('collapsed', rightCollapsed);
  }

  // 恢复折叠状态
  function restoreCollapseState() {
    const leftCollapsed = localStorage.getItem('leftPanelCollapsed') === 'true';
    const rightCollapsed = localStorage.getItem('rightPanelCollapsed') === 'true';

    if (!leftPanel || !rightPanel) return;
    leftPanel.classList.toggle('collapsed', leftCollapsed);
    rightPanel.classList.toggle('collapsed', rightCollapsed);
    syncContainerCollapseState();
  }

  // 左侧板折叠
  leftCollapseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!leftPanel) return;
    leftPanel.classList.toggle('collapsed');
    syncContainerCollapseState();
    localStorage.setItem('leftPanelCollapsed', leftPanel.classList.contains('collapsed'));
  });

  // 右侧板折叠
  rightCollapseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!rightPanel) return;
    rightPanel.classList.toggle('collapsed');
    syncContainerCollapseState();
    localStorage.setItem('rightPanelCollapsed', rightPanel.classList.contains('collapsed'));
  });

  // 页面加载时恢复状态
  restoreCollapseState();
}

// Render file tree
function renderFileTree() {
  const fileTree = document.getElementById('fileTree');
  fileTree.innerHTML = '';
  
  fileTreeData.forEach(item => {
    const element = createTreeItem(item);
    fileTree.appendChild(element);
  });
}

// Create tree item element
function createTreeItem(item, level = 0) {
  const container = document.createElement('div');
  
  if (item.type === 'folder') {
    const folderItem = document.createElement('div');
    folderItem.className = 'folder-item';
    folderItem.style.paddingLeft = `${20 + level * 20}px`;
    
    const arrow = document.createElement('img');
    arrow.src = '../../img/unfold.png';
    arrow.className = 'folder-arrow';
    if (item.expanded) arrow.classList.add('expanded');
    arrow.style.filter = 'brightness(0) invert(1)';
    
    const icon = document.createElement('img');
    icon.src = '../../img/Folder.png';
    icon.className = 'folder-icon';
    
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = item.name;
    
    folderItem.appendChild(arrow);
    folderItem.appendChild(icon);
    folderItem.appendChild(name);
    
    folderItem.addEventListener('click', async (e) => {
      e.stopPropagation();
      item.expanded = !item.expanded;
      
      // 懒加载子文件夹内容
      if (item.expanded && item.path && (!item.children || item.children.length === 0)) {
        try {
          // 设置懒加载标志，避免触发文件监听刷新
          isLazyLoading = true;
          const readResult = await window.electronAPI.folder.read(item.path);
          if (readResult.success) {
            item.children = convertToTreeData(readResult.items, item.path);
          }
        } catch (error) {
          console.error('读取文件夹内容失败:', error);
        } finally {
          // 延迟重置标志，确保文件监听事件已处理
          setTimeout(() => {
            isLazyLoading = false;
          }, 600);
        }
      }
      
      renderFileTree();
      
      // 保存展开状态
      saveFolderState();
    });
    
    container.appendChild(folderItem);
    
    if (item.children && item.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'folder-children';
      if (item.expanded) childrenContainer.classList.add('expanded');
      
      item.children.forEach(child => {
        const childElement = createTreeItem(child, level + 1);
        childrenContainer.appendChild(childElement);
      });
      
      container.appendChild(childrenContainer);
    }
  } else {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.style.paddingLeft = `${20 + level * 20}px`;
    
    const icon = document.createElement('img');
    if (item.fileType === 'image') {
      icon.src = '../../img/picture.png';
    } else if (item.fileType === 'pdf') {
      icon.src = '../../img/file.png';
    } else {
      icon.src = '../../img/file.png';
    }
    icon.className = 'file-icon';
    
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = item.name;
    
    // 添加删除按钮
    const deleteBtn = document.createElement('img');
    deleteBtn.src = '../../img/delete.png';
    deleteBtn.className = 'file-delete-btn';
    deleteBtn.title = '删除文件';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`确定要删除 "${item.name}" 吗？\n\n此操作无法撤销！`)) {
        try {
          const result = await window.electronAPI.file.delete(item.path);
          if (result.success) {
            showMainToast(`已删除: ${item.name}`);
            // 从文件树中移除
            fileItem.remove();
            // 如果当前显示的是这个文件，清空显示区
            if (currentFile && currentFile.path === item.path) {
              const displayArea = document.getElementById('displayArea');
              displayArea.innerHTML = '<div class="empty-state">文件已删除</div>';
              currentFile = null;
            }
          } else {
            showMainToast('删除失败: ' + result.error, 'error');
          }
        } catch (err) {
          showMainToast('删除失败: ' + err.message, 'error');
        }
      }
    });
    
    fileItem.appendChild(icon);
    fileItem.appendChild(name);
    fileItem.appendChild(deleteBtn);
    
    fileItem.addEventListener('click', () => {
      // Update active state
      document.querySelectorAll('.file-item').forEach(fi => {
        fi.classList.remove('active');
      });
      fileItem.classList.add('active');
      selectFile(item);
    });
    
    container.appendChild(fileItem);
  }
  
  return container;
}

// Select file and display
async function selectFile(file) {
  currentFile = file;

  // 添加到附件列表
  addAttachment(file);

  // 隐藏模板视图和编辑视图
  hideTemplateView();
  hideTemplateEditor();
  
  // Display file in middle panel
  const displayArea = document.getElementById('displayArea');
  displayArea.style.display = 'flex';
  displayArea.innerHTML = '<div class="loading">加载中...</div>';
  
  try {
    if (file.fileType === 'image') {
      const img = document.createElement('img');
      // 使用本地文件路径
      if (file.path) {
        img.src = 'file:///' + file.path.replace(/\\/g, '/');
      } else {
        img.src = file.url || 'https://via.placeholder.com/800x600/333333/ffffff?text=' + encodeURIComponent(file.name);
      }
      img.className = 'file-preview';
      displayArea.innerHTML = '';
      displayArea.appendChild(img);
    } else if (file.fileType === 'pdf') {
      // 创建 PDF 查看器容器
      const pdfContainer = document.createElement('div');
      pdfContainer.className = 'pdf-viewer-container';

      // 使用 embed 标签显示 PDF，添加更多参数隐藏工具栏和侧边栏
      const embed = document.createElement('embed');
      if (file.path) {
        embed.src = 'file:///' + file.path.replace(/\\/g, '/') + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';
      } else {
        embed.src = (file.url || 'https://via.placeholder.com/800x600/333333/ffffff?text=' + encodeURIComponent(file.name)) + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';
      }
      embed.className = 'pdf-embed';
      embed.type = 'application/pdf';

      pdfContainer.appendChild(embed);
      displayArea.innerHTML = '';
      displayArea.appendChild(pdfContainer);
    } else {
      // 读取文本文件内容
      let content = file.content || '文件内容预览';
      
      if (file.path) {
        const result = await window.electronAPI.file.read(file.path);
        if (result.success) {
          content = result.content;
        } else {
          content = '无法读取文件: ' + (result.error || '未知错误');
        }
      }
      
      const div = document.createElement('div');
      div.className = 'file-preview';
      
      // 对 Markdown 文件进行渲染
      if (file.fileType === 'markdown') {
        // 使用编辑器模式显示 Markdown，默认预览模式
        const displayArea = document.getElementById('displayArea');
        displayArea.innerHTML = '';
        openNoteEditor(file.path, content);
      } else {
        div.innerHTML = `<pre style="color: #ffffff; white-space: pre-wrap; padding: 20px;">${escapeHtml(content)}</pre>`;
        displayArea.innerHTML = '';
        displayArea.appendChild(div);
      }
    }
  } catch (error) {
    console.error('读取文件失败:', error);
    displayArea.innerHTML = `<div class="error" style="color: #ff6b6b; padding: 20px;">读取文件失败: ${error.message}</div>`;
  }
  
  // 不再自动添加 AI 消息，等待用户主动提问
}

// HTML 转义函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ================= 附件管理功能 =================

// 获取文件扩展名
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

// 获取文件图标
function getFileIcon(ext) {
  const iconMap = {
    'pdf': '📄',
    'md': '📝',
    'markdown': '📝',
    'txt': '📄',
    'js': '📜',
    'ts': '📜',
    'py': '🐍',
    'java': '☕',
    'html': '🌐',
    'css': '🎨',
    'json': '📋',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'png': '🖼️',
    'gif': '🖼️',
    'webp': '🖼️'
  };
  return iconMap[ext] || '📄';
}

// 判断文件类型
function getFileType(ext) {
  const pdfExts = ['pdf'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  const markdownExts = ['md', 'markdown'];
  const codeExts = ['js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'html', 'css', 'json', 'xml'];

  if (pdfExts.includes(ext)) return 'pdf';
  if (imageExts.includes(ext)) return 'image';
  if (markdownExts.includes(ext)) return 'markdown';
  if (codeExts.includes(ext)) return 'code';
  return 'file';
}

// 添加附件
function addAttachment(file) {
  // 按照需求，每次只保留最新的一个附件，清空之前的
  attachedFiles = [];
  
  attachedFiles.push(file);
  renderAttachmentList();
  console.log('添加附件:', file.name, '当前附件数:', attachedFiles.length);
  return true;
}

// 移除附件
function removeAttachment(index) {
  attachedFiles.splice(index, 1);
  renderAttachmentList();
  console.log('移除附件，当前附件数:', attachedFiles.length);
}

// 清空附件
function clearAttachments() {
  attachedFiles = [];
  renderAttachmentList();
}

// 渲染附件列表
function renderAttachmentList() {
  const container = document.getElementById('attachmentList');
  if (!container) return;

  if (attachedFiles.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = attachedFiles.map((file, index) => {
    const ext = getFileExtension(file.name);
    const icon = getFileIcon(ext);
    return `
      <div class="attachment-item" title="${file.name}">
        <span class="attachment-icon">${icon}</span>
        <span class="attachment-name">${file.name}</span>
        <span class="attachment-remove" onclick="removeAttachment(${index})">×</span>
      </div>
    `;
  }).join('');
}

// Markdown 渲染函数
function renderMarkdown(markdown) {
  if (!markdown) return '';

  let html = markdown;

  // 先处理代码块，避免代码块内的内容被其他规则处理
  const codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    const id = `CODE_BLOCK_${codeBlocks.length}`;
    codeBlocks.push({ id, code: code.trim() });
    return id;
  });

  // 处理行内代码
  const inlineCodes = [];
  html = html.replace(/`([^`\n]+)`/g, (match, code) => {
    const id = `INLINE_CODE_${inlineCodes.length}`;
    inlineCodes.push({ id, code });
    return id;
  });

  // 保护链接语法，避免斜体 _text_ 误解析链接 URL 中的下划线（如 note_1773549342619.md）
  const protectedLinks = [];
  html = html.replace(/\[([^\]]+)\]\(([^)]+?)\s*"?\{\{DOWNLOAD_PDF:([^}]+)\}\}"?\)/g, (match, text, url, paperData) => {
    try {
      const decodedData = paperData.replace(/&quot;/g, '"');
      const tag = `<a href="#" class="pdf-download-link" data-paper='${decodedData}'>${text}</a>`;
      protectedLinks.push(tag);
      return `@@LINK${protectedLinks.length - 1}@@`;
    } catch (e) {
      protectedLinks.push(`<a href="#" class="external-link" data-url="${url}">${text}</a>`);
      return `@@LINK${protectedLinks.length - 1}@@`;
    }
  });
  // 支持链接文本中含方括号，如 [[web]_扩散模型详解.pdf](path)
  html = html.replace(/\[((?:[^\[\]]|\[[^\]]*\])*)\]\(([^)]+)\)/g, (match, text, url) => {
    let tag;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      tag = `<a href="#" class="external-link" data-url="${url}">${text}</a>`;
    } else {
      tag = `<a href="#" class="local-file-link" data-path="${url}">${text}</a>`;
    }
    protectedLinks.push(tag);
    return `@@LINK${protectedLinks.length - 1}@@`;
  });

  // 先保护下载按钮 HTML 标签（在转义之前）
  const downloadButtons = [];
  const originalHtml = html;
  // 使用更宽松的正则：允许 data-paper 属性值包含任何字符（包括换行符），非贪婪匹配
  html = html.replace(/<button class="paper-download-btn" data-paper='[\s\S]*?'>[\s\S]*?<\/button>/g, (match) => {
    console.log('[renderMarkdown] ✅ 匹配到下载按钮');
    const placeholder = `@@DLBTN${downloadButtons.length}@@`;
    downloadButtons.push(match);
    return placeholder;
  });
  if (downloadButtons.length === 0 && originalHtml.includes('paper-download-btn')) {
    console.warn('[renderMarkdown] ⚠️ 存在按钮但正则未匹配！请检查按钮 HTML 格式');
  }

  // 保护插入笔记按钮 HTML 标签
  const insertNoteButtons = [];
  html = html.replace(/<button class="insert-note-btn"[^>]*>[\s\S]*?<\/button>/g, (match) => {
    const placeholder = `@@INSNOTE${insertNoteButtons.length}@@`;
    insertNoteButtons.push(match);
    return placeholder;
  });

  // 转义HTML特殊字符
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // 恢复行内代码
  inlineCodes.forEach(({ id, code }) => {
    html = html.replace(id, `<code>${code}</code>`);
  });
  
  // 恢复代码块
  codeBlocks.forEach(({ id, code }) => {
    html = html.replace(id, `<pre><code>${code}</code></pre>`);
  });
  
  // 标题 (# ## ### #### ##### ######)
  html = html.replace(/^###### (.*$)/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.*$)/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  
  // 粗体 (**text** 或 __text__)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // 斜体 (*text* 或 _text_)
  // 注意：需要避免匹配代码中的星号，所以先处理代码，再处理斜体
  html = html.replace(/\*([^*\n]+?)\*/g, (match, text) => {
    // 如果包含代码标记，跳过
    if (match.includes('CODE_BLOCK') || match.includes('INLINE_CODE')) {
      return match;
    }
    return '<em>' + text + '</em>';
  });
  html = html.replace(/_([^_\n]+?)_/g, (match, text) => {
    // 如果包含代码标记，跳过
    if (match.includes('CODE_BLOCK') || match.includes('INLINE_CODE')) {
      return match;
    }
    return '<em>' + text + '</em>';
  });
  
  // 删除线 (~~text~~)
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // 注：链接已在斜体处理前保护为 @@LINKn@@，稍后恢复

  // 水平线 (--- 或 ***)
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^\*\*\*$/gm, '<hr>');
  
  // 引用 (> text)
  const quoteLines = html.split('\n');
  let inBlockquote = false;
  let processedLines = [];
  
  quoteLines.forEach(line => {
    if (line.trim().startsWith('&gt; ')) {
      if (!inBlockquote) {
        processedLines.push('<blockquote>');
        inBlockquote = true;
      }
      processedLines.push(line.replace(/^&gt; /, ''));
    } else {
      if (inBlockquote) {
        processedLines.push('</blockquote>');
        inBlockquote = false;
      }
      processedLines.push(line);
    }
  });
  if (inBlockquote) {
    processedLines.push('</blockquote>');
  }
  html = processedLines.join('\n');
  
  // 处理列表和段落 - 按行处理
  const listLines = html.split('\n');
  let result = [];
  let listItems = [];
  let currentListType = null; // 'ul' or 'ol'
  
  const flushList = () => {
    if (listItems.length > 0 && currentListType) {
      result.push(`<${currentListType}>${listItems.join('')}</${currentListType}>`);
      listItems = [];
      currentListType = null;
    }
  };
  
  listLines.forEach((line) => {
    const trimmed = line.trim();
    
    // 有序列表
    const olMatch = trimmed.match(/^(\d+)\. (.+)$/);
    if (olMatch) {
      if (currentListType !== 'ol') {
        flushList();
        currentListType = 'ol';
      }
      listItems.push(`<li>${olMatch[2]}</li>`);
      return;
    }
    
    // 无序列表
    const ulMatch = trimmed.match(/^[\*\-\+] (.+)$/);
    if (ulMatch) {
      if (currentListType !== 'ul') {
        flushList();
        currentListType = 'ul';
      }
      listItems.push(`<li>${ulMatch[1]}</li>`);
      return;
    }
    
    // 非列表项，先刷新列表
    flushList();
    
    // 处理其他内容
    if (!trimmed) {
      result.push('');
    } else if (trimmed.match(/^<(h[1-6]|pre|blockquote|hr|ul|ol|p)/)) {
      // 已经是HTML标签
      result.push(trimmed);
    } else if (trimmed.match(/^@@DLBTN\d+@@$/)) {
      // 下载按钮占位符，不包裹在 <p> 中
      result.push(trimmed);
    } else if (trimmed.match(/^@@INSNOTE\d+@@$/)) {
      // 插入笔记按钮占位符，不包裹在 <p> 中
      result.push(trimmed);
    } else if (trimmed.match(/^@@LINK\d+@@$/)) {
      // 链接占位符，不包裹在 <p> 中
      result.push(trimmed);
    } else {
      // 普通段落
      result.push(`<p>${trimmed}</p>`);
    }
  });
  
  // 处理最后的列表
  flushList();
  
  html = result.join('\n');
  
  // 清理多余的标签和空行
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]|ul|ol|pre|blockquote|hr)/g, '$1');
  html = html.replace(/(<\/h[1-6]|<\/ul>|<\/ol>|<\/pre>|<\/blockquote>|<\/hr>)<\/p>/g, '$1');
  html = html.replace(/\n{3,}/g, '\n\n');

  // 最后恢复下载按钮
  console.log('[renderMarkdown] 恢复按钮数量:', downloadButtons.length);
  downloadButtons.forEach((btn, i) => {
    html = html.replace(`@@DLBTN${i}@@`, btn);
  });

  // 恢复插入笔记按钮
  insertNoteButtons.forEach((btn, i) => {
    html = html.replace(`@@INSNOTE${i}@@`, btn);
  });

  // 恢复链接占位符（保护时已生成最终 <a> 标签，此处还原）
  protectedLinks.forEach((tag, i) => {
    html = html.replace(`@@LINK${i}@@`, tag);
  });

  return html;
}

/**
 * 渲染 Markdown 并绑定外部链接点击事件
 * @param {string} markdown - Markdown 内容
 * @param {HTMLElement} container - 要渲染到的容器元素
 */
function renderMarkdownWithLinks(markdown, container) {
  container.innerHTML = renderMarkdown(markdown);

  // 为外部链接添加点击处理，在默认浏览器中打开
  container.querySelectorAll('.external-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = link.dataset.url;
      if (url) {
        await window.electronAPI.shell.openExternal(url);
      }
    });
  });

  // 为本地文件链接添加点击处理，在主界面打开（传入工作区根目录解析相对路径）
  bindLocalFileLinks(container, currentFolderPath);
}

/**
 * 从文件路径获取所在目录（兼容渲染进程，不使用 Node path）
 */
function getDirname(filePath) {
  if (!filePath) return '';
  return filePath.replace(/[\/\\][^\/\\]*$/, '') || filePath;
}

/**
 * 将相对路径解析为绝对路径
 * @param {string} basePath - 基准目录（如笔记所在文件夹或工作区根目录）
 * @param {string} relativePath - 相对路径
 */
function resolveRelativePath(basePath, relativePath) {
  if (!basePath || !relativePath) return relativePath;
  // 已为绝对路径（Windows 含盘符如 C:，或 Unix 以 / 开头）则直接返回
  if (/^[a-zA-Z]:[\\\/]/.test(relativePath) || relativePath.startsWith('/')) {
    return relativePath;
  }
  const sep = basePath.includes('\\') ? '\\' : '/';
  const base = basePath.endsWith(sep) ? basePath : basePath + sep;
  return base + relativePath.replace(/\//g, sep);
}

/**
 * 为本地文件链接绑定点击事件（仿照插入笔记 / 聊天消息中的链接处理模式）
 * @param {HTMLElement} container - 包含链接的容器元素
 * @param {string} [basePath] - 基准目录，用于解析相对路径（如知识脉络图所在文件夹）。不传则假定路径为绝对路径
 */
function bindLocalFileLinks(container, basePath) {
  container.querySelectorAll('.local-file-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      let filePath = link.dataset.path;
      if (filePath && basePath) {
        filePath = resolveRelativePath(basePath, filePath);
      }
      if (filePath) {
        // 根据扩展名确定文件类型
        const ext = filePath.split('.').pop()?.toLowerCase();
        let fileType = 'text';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
          fileType = 'image';
        } else if (ext === 'pdf') {
          fileType = 'pdf';
        } else if (ext === 'md') {
          fileType = 'markdown';
        }

        // 创建文件对象
        const file = {
          name: filePath.split(/[/\\]/).pop(),
          path: filePath,
          fileType: fileType
        };

        // 调用 selectFile 在主界面打开
        await selectFile(file);
      }
    });
  });
}

// Setup event listeners
function setupEventListeners() {
  console.log('setupEventListeners 开始执行');
  
  // 打开文件夹按钮（原"上传"按钮）
  const uploadBtn = document.getElementById('uploadBtn');
  console.log('uploadBtn:', uploadBtn);
  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      console.log('打开按钮被点击');
      await openFolder();
    });
  }
  
  // 生成知识脉络图按钮
  const btnGenerateMap = document.getElementById('btnGenerateMap');
  if (btnGenerateMap) {
      btnGenerateMap.addEventListener('click', async () => {
          let targetFolder = currentFolderPath;
          
          if (!targetFolder) {
              const stateStr = sessionStorage.getItem('folderState');
              if (stateStr) {
                  try {
                      const state = JSON.parse(stateStr);
                      targetFolder = state.folderPath;
                  } catch (e) {}
              }
          }
          
          if (!targetFolder) {
              showMainToast('请先打开或选择一个工作区文件夹！');
              return;
          }

          const originalText = btnGenerateMap.innerHTML;
          btnGenerateMap.innerHTML = '<span style="font-size: 13px;">⏳ 生成中...</span>';
          btnGenerateMap.disabled = true;

          try {
              const result = await window.electronAPI.workspace.generateKnowledgeMap(targetFolder);
              
              if (result.success) {
                  showMainToast('✨ 知识脉络图生成成功！已保存到该文件夹。');
                  // 刷新文件树
                  await renderFileTree(); 
              } else {
                    showMainToast(`❌ 生成失败：${result.error}`, "error");
              }
          } catch (err) {
              console.error("生成报错: ", err);
                showMainToast(`❌ 发生错误：${err.message}`, "error");
          } finally {
              btnGenerateMap.innerHTML = originalText;
              btnGenerateMap.disabled = false;
          }
      });
  }
  
  // 新建按钮和下拉菜单
  const newFolderBtn = document.getElementById('newFolderBtn');
  const newDropdown = document.getElementById('newDropdown');
  const newFolderOption = document.getElementById('newFolderOption');
  const newNoteOption = document.getElementById('newNoteOption');
  const newTemplateOption = document.getElementById('newTemplateOption');
  const newCustomTemplateOption = document.getElementById('newCustomTemplateOption');
  
  if (newFolderBtn && newDropdown) {
    // 点击新建按钮显示/隐藏下拉菜单
    newFolderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      newDropdown.classList.toggle('show');
    });
    
    // 点击新建文件夹选项
    if (newFolderOption) {
      newFolderOption.addEventListener('click', async (e) => {
        e.stopPropagation();
        newDropdown.classList.remove('show');
        await createSubFolder();
      });
    }
    
    // 点击选择模板选项
    if (newTemplateOption) {
      newTemplateOption.addEventListener('click', (e) => {
        e.stopPropagation();
        newDropdown.classList.remove('show');
        showTemplateView();
      });
    }
    
    // 点击新建自定义模板选项
    if (newCustomTemplateOption) {
      newCustomTemplateOption.addEventListener('click', (e) => {
        e.stopPropagation();
        newDropdown.classList.remove('show');
        showTemplateEditor();
      });
    }
    
    // 点击页面其他地方关闭下拉菜单
    document.addEventListener('click', (e) => {
      if (!newFolderBtn.contains(e.target) && !newDropdown.contains(e.target)) {
        newDropdown.classList.remove('show');
      }
    });
  } else {
    console.error('找不到新建按钮或下拉菜单元素！');
  }
  
  // 模板编辑界面按钮
  const editorCancelBtn = document.getElementById('editorCancelBtn');
  const editorSaveBtn = document.getElementById('editorSaveBtn');
  
  if (editorCancelBtn) {
    editorCancelBtn.addEventListener('click', () => {
      hideTemplateEditor();
    });
  }
  
  if (editorSaveBtn) {
    editorSaveBtn.addEventListener('click', async () => {
      await saveTemplateFromEditor();
    });
  }
  
  // 刷新按钮
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      console.log('刷新按钮被点击');
      await refreshFileTree(false);  // 手动刷新
    });
  }
  
  // Search input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterFileTree(e.target.value);
  });
  
  // Send button
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  
  // Chat input enter key
  document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // File drop zone - 全局拖拽支持
  const dropZone = document.getElementById('fileDropZone');
  const rightPanel = document.querySelector('.right-panel');
  const middlePanel = document.querySelector('.middle-panel');

  // 创建拖拽遮罩层
  let dragOverlay = null;
  const createDragOverlay = () => {
    if (!dragOverlay) {
      dragOverlay = document.createElement('div');
      dragOverlay.className = 'drag-overlay';
      dragOverlay.innerHTML = `
        <div class="drag-overlay-content">
          <svg class="drag-overlay-icon" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <div class="drag-overlay-text">释放文件以添加</div>
          <div class="drag-overlay-hint">支持 PDF、图片、文本等格式</div>
        </div>
      `;
      document.body.appendChild(dragOverlay);
    }
    return dragOverlay;
  };

  // 全局拖拽事件 - 防止浏览器默认行为
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    // 检查是否是文件拖拽
    if (e.dataTransfer.types.includes('Files')) {
      const overlay = createDragOverlay();
      overlay.style.display = 'flex';
      rightPanel?.classList.add('drag-over');
      middlePanel?.classList.add('drag-over');
    }
  });

  document.addEventListener('dragleave', (e) => {
    // 只有当离开文档时才隐藏遮罩
    if (e.relatedTarget === null || !document.body.contains(e.relatedTarget)) {
      if (dragOverlay) {
        dragOverlay.style.display = 'none';
      }
      rightPanel?.classList.remove('drag-over');
      middlePanel?.classList.remove('drag-over');
      dropZone.classList.remove('drag-over');
    }
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();

    // 隐藏遮罩
    if (dragOverlay) {
      dragOverlay.style.display = 'none';
    }
    rightPanel?.classList.remove('drag-over');
    middlePanel?.classList.remove('drag-over');
    dropZone.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      const unsupportedExts = getUnsupportedExtensionList(files);
      const supportedFiles = getSupportedFiles(files);

      if (unsupportedExts.length > 0) {
        showAlert(`不支持的文件格式：${unsupportedExts.map(ext => `.${ext}`).join(', ')}<br><br>支持格式：${SUPPORTED_UPLOAD_EXTENSIONS.map(ext => `.${ext}`).join(', ')}`);
      }

      if (supportedFiles.length === 0) {
        return;
      }

      // 仅处理支持的文件
      supportedFiles.forEach(file => {
        const ext = getFileExtension(file.name);
        const fileObj = {
          name: file.name,
          path: file.path || null,
          file: file,
          url: URL.createObjectURL(file),
          fileType: getFileType(ext)
        };
        addAttachment(fileObj);
      });

      // 显示第一个支持的文件
      const firstFile = supportedFiles[0];
      displayFile(firstFile, getFileExtension(firstFile.name));
    }
  });

  // 保留原有的 dropZone 事件（用于点击上传）
  dropZone.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.txt,.md,.jpg,.jpeg,.png,.gif,.webp';
    fileInput.multiple = true;
    fileInput.onchange = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        const unsupportedExts = getUnsupportedExtensionList(files);
        const supportedFiles = getSupportedFiles(files);

        if (unsupportedExts.length > 0) {
          showAlert(`不支持的文件格式：${unsupportedExts.map(ext => `.${ext}`).join(', ')}<br><br>支持格式：${SUPPORTED_UPLOAD_EXTENSIONS.map(ext => `.${ext}`).join(', ')}`);
        }

        if (supportedFiles.length === 0) {
          return;
        }

        supportedFiles.forEach(file => {
          const ext = getFileExtension(file.name);
          const fileObj = {
            name: file.name,
            path: file.path || null,
            file: file,
            url: URL.createObjectURL(file),
            fileType: getFileType(ext)
          };
          addAttachment(fileObj);
        });

        // 显示第一个支持的文件
        const firstFile = supportedFiles[0];
        displayFile(firstFile, getFileExtension(firstFile.name));
      }
    };
    fileInput.click();
  });
  
  // Template button
  const templateBtn = document.getElementById('templateBtn');
  if (templateBtn) {
    templateBtn.addEventListener('click', () => {
      alert('笔记模板功能开发中...');
    });
  }

  // Navigation icons - 页面跳转
  // 用户头像 - 跳转到首页
  const navUserIcon = document.getElementById('navUser');
  if (navUserIcon) {
    // 加载用户头像 (保持不变)
    const avatarImg = navUserIcon.querySelector('img');
    const savedAvatar = localStorage.getItem('profilePicture');
    if (savedAvatar && avatarImg) {
      avatarImg.src = savedAvatar;
    }
    // 点击跳转到首页
    navUserIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('跳转到首页');
      // 使用 window.location.href 跳转
      window.location.href = '../index.html';
    });
  } else {
    console.error('找不到 navUser 元素');
  }
  
  // 主界面（AI智能解释）
  const navMain = document.getElementById('navMain');
  if (navMain) {
    navMain.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('点击主界面 Tab');
    });
  } else {
    console.error('找不到 navMain 元素');
  }
  
  // 文献推荐页面
  const navRecommend = document.getElementById('navRecommend');
  if (navRecommend) {
    navRecommend.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('跳转到文献推荐');
      window.location.href = '../recommend/recommend.html';
    });
  } else {
    console.error('找不到 navRecommend 元素');
  }
  
  // 知识管理页面
  const navManage = document.getElementById('navManage');
  if (navManage) {
    navManage.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('跳转到知识管理');
      window.location.href = '../manage/manage.html';
    });
  } else {
    console.error('找不到 navManage 元素');
  }
}

// Handle file upload
function handleFileUpload(files) {
  Array.from(files).forEach(file => {
    const fileItem = {
      name: file.name,
      type: 'file',
      fileType: getFileType(file.name),
      file: file,
      url: URL.createObjectURL(file)
    };

    // Add to first folder or create new folder
    if (fileTreeData.length > 0 && fileTreeData[0].type === 'folder') {
      if (!fileTreeData[0].children) {
        fileTreeData[0].children = [];
      }
      fileTreeData[0].children.push(fileItem);
      fileTreeData[0].expanded = true;
    } else {
      fileTreeData.unshift({
        name: '新建文件夹',
        type: 'folder',
        expanded: true,
        children: [fileItem]
      });
    }
  });

  renderFileTree();
}

// ================= 文件卡片功能 =================

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// 根据文件类型获取图标
function getFileIcon(ext) {
  const iconMap = {
    'pdf': '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    'doc': '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    'docx': '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    'txt': '<svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'md': '<svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'jpg': '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    'jpeg': '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    'png': '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    'gif': '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    'webp': '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    'py': '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'js': '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'ts': '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'java': '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'cpp': '<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'c': '<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'html': '<svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
    'css': '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
    'json': '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    'zip': '<svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="10" y1="15" x2="10" y2="9"></line><line x1="8" y1="12" x2="12" y2="12"></line></svg>',
    'mp3': '<svg viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><circle cx="12" cy="15" r="3"></circle></svg>',
    'mp4': '<svg viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
    'default': '<svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
  };

  return iconMap[ext] || iconMap['default'];
}

// 创建文件卡片
function createFileCard(file, ext) {
  const card = document.createElement('div');
  card.className = 'file-card';

  const icon = getFileIcon(ext);

  card.innerHTML = `
    <div class="file-card-icon">${icon}</div>
    <div class="file-card-info">
      <div class="file-card-name">${file.name}</div>
      <div class="file-card-meta">${formatFileSize(file.size)} · ${ext.toUpperCase()}</div>
    </div>
    <button class="file-card-action" title="发送到 AI">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>
  `;

  // 点击卡片显示文件内容
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.file-card-action')) {
      displayFile(file, ext);
    }
  });

  // 点击发送按钮发送文件到 AI
  card.querySelector('.file-card-action').addEventListener('click', () => {
    displayFile(file, ext);
    document.getElementById('chatInput').focus();
  });

  return card;
}

// 添加文件卡片消息
function addFileCardMessage(cardElement) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user file-message';
  messageDiv.appendChild(cardElement);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 显示文件内容
async function displayFile(file, ext) {
  const displayArea = document.getElementById('displayArea');
  displayArea.style.display = 'flex';
  displayArea.innerHTML = '<div class="loading">加载中...</div>';

  const fileExt = String(ext || getFileExtension(file.name)).toLowerCase();
  // 仅对外部拖入/上传文件做强格式校验；文件树内部文件沿用原逻辑。
  if (!file.path && !isSupportedUploadExtension(fileExt)) {
    await showAlert(`不支持的文件格式：.${fileExt || '(无扩展名)'}<br><br>支持格式：${SUPPORTED_UPLOAD_EXTENSIONS.map(item => `.${item}`).join(', ')}`);
    displayArea.innerHTML = '<div class="error" style="color: #ff6b6b; padding: 20px;">不支持的文件格式</div>';
    return;
  }

  const fileType = getFileType(file.name);
  const fileObj = {
    name: file.name,
    path: file.path || null,
    file: file,
    url: file.path ? null : URL.createObjectURL(file),
    fileType: fileType
  };
  
  // 更新当前文件状态，确保 Agent 能获取到上下文
  currentFile = fileObj;

  try {
    if (fileType === 'image') {
      const img = document.createElement('img');
      img.src = fileObj.url;
      img.className = 'file-preview';
      displayArea.innerHTML = '';
      displayArea.appendChild(img);
    } else if (fileType === 'pdf') {
      // 创建 PDF 查看器容器
      const pdfContainer = document.createElement('div');
      pdfContainer.className = 'pdf-viewer-container';

      const embed = document.createElement('embed');
      embed.src = fileObj.url + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';
      embed.className = 'pdf-embed';
      embed.type = 'application/pdf';

      pdfContainer.appendChild(embed);
      displayArea.innerHTML = '';
      displayArea.appendChild(pdfContainer);
    } else {
      // 文本文件直接读取内容
      const content = await file.text();
      const div = document.createElement('div');
      div.className = 'file-preview';

      if (fileType === 'markdown') {
        // 使用编辑器模式显示 Markdown，默认预览模式
        const displayArea = document.getElementById('displayArea');
        displayArea.innerHTML = '';
        // 确保传递 content 字符串
        const contentStr = typeof content === 'string' ? content : '';
        openNoteEditor(fileObj.path, contentStr);
      } else {
        div.innerHTML = `<pre style="color: #ffffff; white-space: pre-wrap; padding: 20px;">${escapeHtml(content)}</pre>`;
        displayArea.innerHTML = '';
        displayArea.appendChild(div);
      }
    }
  } catch (error) {
    console.error('读取文件失败:', error);
    displayArea.innerHTML = `<div class="error" style="color: #ff6b6b; padding: 20px;">读取文件失败：${error.message}</div>`;
  }
}

// Get file type from extension
function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return 'image';
  } else if (ext === 'pdf') {
    return 'pdf';
  } else if (['md', 'txt'].includes(ext)) {
    return 'markdown';
  }
  return 'file';
}

// Filter file tree
function filterFileTree(query) {
  // Simple search implementation
  const items = document.querySelectorAll('.folder-item, .file-item');
  items.forEach(item => {
    const name = item.querySelector('.folder-name, .file-name').textContent.toLowerCase();
    if (name.includes(query.toLowerCase())) {
      item.style.display = '';
    } else {
      item.style.display = query ? 'none' : '';
    }
  });
}

// Send message
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  // Add user message
  addUserMessage(message);
  input.value = '';
  
  // 显示加载状态
  const loadingMessage = {
    type: 'ai',
    text: '🤔 正在思考中...',
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    isLoading: true
  };
  renderMessage(loadingMessage);
  
  // 调用真正的 AI
  await callAI(message);
}

// 调用 AI API
async function callAI(userQuery) {
  try {
    // 准备 Agent 上下文
    let agentContent = null;
    let agentContentType = 'text';

    if (currentFile) {
        agentContent = currentFile.path || null;
        agentContentType = currentFile.fileType || 'text';
    } else if (attachedFiles.length > 0) {
        const lastAttach = attachedFiles[attachedFiles.length - 1];
        agentContent = lastAttach.path || null;
        agentContentType = lastAttach.fileType || 'text';
    }

    // 1. 先尝试通过 Agent 处理（智能意图识别）
    const agentResult = await window.electronAPI.agent.process(userQuery, {
      content: agentContent,
      contentType: agentContentType
    });

    if (agentResult.success && agentResult.skill) {
      removeLoadingMessage();
      addAIMessage(formatAgentResult(agentResult));
      // 处理成功后清空附件
      clearAttachments();
      return;
    }

    // 2. 未识别到技能，走普通 AI 问答
    // 读取所有附件内容
    let allFileContent = '';
    let fileNames = [];

    // 首先检查附件列表
    if (attachedFiles.length > 0) {
      for (const file of attachedFiles) {
        const content = await readFileContent(file);
        if (content) {
          allFileContent += `\n\n--- ${file.name} ---\n${content}`;
          fileNames.push(file.name);
        }
      }
    } else if (currentFile) {
      // 如果没有附件但有当前文件，读取当前文件
      const content = await readFileContent(currentFile);
      if (content) {
        allFileContent = content;
        fileNames.push(currentFile.name);
      }
    }

    // 调用 AI API
    const result = await window.electronAPI.ai.ask(
      userQuery,
      allFileContent || null,
      fileNames.join(', ') || null
    );

    // 移除加载消息
    removeLoadingMessage();

    if (result.success) {
      addAIMessage(result.response);
      // 发送成功后清空附件
      clearAttachments();
    } else {
      addAIMessage(`❌ AI 请求失败: ${result.error || '未知错误'}`);
    }

  } catch (error) {
    console.error('AI 调用失败:', error);
    removeLoadingMessage();
    addAIMessage(`❌ AI 调用出错: ${error.message}`);
  }
}

// 读取文件内容
async function readFileContent(file) {
  try {
    // 如果有 file 对象（拖拽上传的文件）
    if (file.file && file.file instanceof File) {
      if (file.fileType === 'pdf') {
        // PDF 文件需要通过后端处理
        if (file.path) {
          const result = await window.electronAPI.file.readPdf(file.path);
          if (result.success) {
            return result.content;
          }
        }
        // 没有路径的话，无法读取 PDF 内容
        console.warn('PDF 文件没有本地路径，无法读取内容');
        return null;
      }
      // 其他文件类型直接读取文本
      return await file.file.text();
    }

    // 如果有本地路径（从文件树选择的文件）
    if (file.path) {
      if (file.fileType === 'pdf') {
        const result = await window.electronAPI.file.readPdf(file.path);
        if (result.success) {
          return result.content;
        }
      } else {
        const result = await window.electronAPI.file.read(file.path);
        if (result.success) {
          return result.content;
        }
      }
    }

    return null;
  } catch (e) {
    console.warn('读取文件内容失败:', file.name, e);
    return null;
  }
}

// 格式化 Agent 处理结果
function formatAgentResult(result) {
  if (!result.success) {
    return `❌ 处理失败: ${result.error || '未知错误'}`;
  }

  const { skill, result: data } = result;

  switch (skill) {
    case 'recommend':
      const papers = data || [];
      if (papers.length === 0) return '未找到相关论文';
      let msg = `📚 找到 ${papers.length} 篇相关论文：\n\n`;
      papers.forEach((p, i) => {
        // 标题（中文或英文）
        msg += `**${i + 1}. ${p.titleCn || p.title}**\n`;

        // 作者
        msg += `作者: ${p.authorsDisplay || '未知'}\n`;

        // 摘要（统一中文，翻译失败则显示原文并标注）
        const abstract = p.abstractCn || p.abstract || p.summary || '无摘要';
        const isOriginal = !p.abstractCn && (p.abstract || p.summary);
        msg += `摘要: ${abstract.substring(0, 150)}${abstract.length > 150 ? '...' : ''}${isOriginal ? '（原文）' : ''}\n`;

        // 下载按钮（使用 HTML 标记，data-paper 存储论文信息）
        if (p.pdfUrl) {
          const paperData = JSON.stringify({
            pdfUrl: p.pdfUrl,
            title: p.title,
            authors: p.authors,
            arxivId: p.arxivId,
            published: p.published,
            url: p.url,
            abstract: p.abstract || p.summary
          });
          msg += `<button class="paper-download-btn" data-paper='${paperData.replace(/'/g, "&#39;")}'>📥 下载论文</button>\n`;
        }
        msg += '\n';
      });
      return msg;

    case 'summarize':
      return `📝 **内容总结**\n\n${data}`;

    case 'classify':
      return `📁 **分类结果**\n\n${JSON.stringify(data, null, 2)}`;

    case 'schedule':
      return `⏰ **定时任务已创建**\n\n关键词: ${data.keyword}\n时间: ${data.time}\n重复: ${data.repeat}`;

    default:
      return JSON.stringify(data, null, 2);
  }
}

// 下载并保存 PDF（从聊天界面的 PDF 链接或按钮点击触发）
async function downloadAndSavePdf(paper, element) {
  const originalText = element.textContent;
  try {
    // 显示下载中状态
    element.textContent = '下载中...';
    element.classList.add('downloading');
    element.disabled = true;

    // 1. 下载 PDF 到临时文件夹
    const downloadResult = await window.electronAPI.arxiv.download(paper.pdfUrl, paper.title);

    if (!downloadResult.success) {
      throw new Error(downloadResult.error || '下载失败');
    }

    console.log('PDF 下载成功:', downloadResult.path);

    // 2. 更新状态为"正在分类"
    element.textContent = '分类中...';

    // 3. 调用 AI 分类并保存到合适的文件夹
    const metadata = {
      title: paper.title,
      authors: paper.authors,
      arxivId: paper.arxivId,
      published: paper.published,
      url: paper.url,
      pdfUrl: paper.pdfUrl,
      abstract: paper.abstract
    };
    const saveResult = await window.electronAPI.arxiv.saveToFolder(downloadResult.path, JSON.stringify(metadata));

    if (saveResult.success) {
      // 成功
      element.textContent = '已保存 ✓';
      element.classList.remove('downloading');
      element.classList.add('saved');

      console.log('论文已保存到:', saveResult.path);

      // 提取目录路径（兼容 Windows 和 Unix 路径）
      const lastSepIndex = Math.max(saveResult.path.lastIndexOf('/'), saveResult.path.lastIndexOf('\\'));
      const dirPath = lastSepIndex > 0 ? saveResult.path.substring(0, lastSepIndex) : saveResult.path;

      // 显示保存成功通知
      showSaveNotification({
        title: paper.title,
        path: saveResult.path,
        dirPath: dirPath
      });

      // 保存成功后不再恢复按钮状态，保持"已保存"状态
    } else {
      throw new Error(saveResult.error || '保存失败');
    }

  } catch (error) {
    console.error('下载/保存失败:', error);
    element.textContent = '失败 ✕';
    element.classList.remove('downloading');
    element.classList.add('error');
    showMainToast('下载失败: ' + error.message, 'error');

    // 3秒后恢复
    setTimeout(() => {
      element.textContent = originalText;
      element.classList.remove('error');
      element.disabled = false;
    }, 3000);
  }
}

// 将 AI 回复插入笔记到知识库
async function insertNoteToKnowledgeBase(content, buttonElement, attachedFiles) {
  const originalText = buttonElement.textContent;
  try {
    buttonElement.textContent = '分类中...';
    buttonElement.disabled = true;

    // 生成标题（时间戳格式）
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const title = `AI笔记 - ${dateStr} ${timeStr}`;

    // 构建完整内容
    let fullContent = `# ${title}\n\n`;

    // 添加文件链接（如果有）
    if (attachedFiles && attachedFiles.length > 0) {
      fullContent += `## 相关文件\n\n`;
      attachedFiles.forEach(filePath => {
        // 提取文件名
        const fileName = filePath.split(/[/\\]/).pop();
        // 使用 markdown 链接格式
        fullContent += `- [${fileName}](${filePath})\n`;
      });
      fullContent += '\n---\n\n';
    }

    // 添加 AI 回复内容
    fullContent += content;

    // 1. 调用智能分类
    const classifyResult = await window.electronAPI.agent.process('分类', {
      content: fullContent,
      contentType: 'text'
    });

    if (!classifyResult.success || !classifyResult.result?.savePath) {
      throw new Error(classifyResult.error || '分类失败');
    }

    const savePath = classifyResult.result.savePath;
    buttonElement.textContent = '保存中...';

    // 2. 保存到文件
    const saveResult = await window.electronAPI.file.write(savePath, fullContent);

    if (saveResult.success) {
      buttonElement.textContent = '已插入 ✓';
      buttonElement.classList.add('saved');

      // 提取目录路径（兼容 Windows 和 Unix 路径）
      const lastSepIndex = Math.max(savePath.lastIndexOf('/'), savePath.lastIndexOf('\\'));
      const dirPath = lastSepIndex > 0 ? savePath.substring(0, lastSepIndex) : savePath;
      const folderName = classifyResult.result.folderName || dirPath.split(/[/\\]/).pop();

      showMainToast(`已保存到「${folderName}」文件夹`, 'success');
    } else {
      throw new Error(saveResult.error || '保存失败');
    }
  } catch (error) {
    console.error('插入笔记失败:', error);
    buttonElement.textContent = '失败 ✕';
    buttonElement.classList.add('error');
    showMainToast('插入失败: ' + error.message, 'error');

    setTimeout(() => {
      buttonElement.textContent = originalText;
      buttonElement.classList.remove('error');
      buttonElement.disabled = false;
    }, 3000);
  }
}

// 显示保存成功通知
function showSaveNotification(options) {
  const { title, path, dirPath } = options;

  const container = document.getElementById('notificationContainer');
  if (!container) return;

  const notification = document.createElement('div');
  notification.className = 'in-app-notification';
  notification.innerHTML = `
    <div class="notification-icon">✅</div>
    <div class="notification-content">
      <div class="notification-title">论文保存成功</div>
      <div class="notification-body" style="margin-bottom: 8px;">
        ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}<br>
        <span style="font-size: 11px; opacity: 0.7;">已保存到: ${path}</span>
      </div>
    </div>
    <button class="notification-close">&times;</button>
  `;

  container.appendChild(notification);

  // 点击关闭
  notification.querySelector('.notification-close').addEventListener('click', (e) => {
    e.stopPropagation();
    notification.classList.add('hiding');
    setTimeout(() => notification.remove(), 300);
  });

  // 点击通知打开文件夹
  notification.style.cursor = 'pointer';
  notification.addEventListener('click', () => {
    window.electronAPI?.shell?.openPath(dirPath);
    notification.classList.add('hiding');
    setTimeout(() => notification.remove(), 300);
  });

  // 6秒后自动消失
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add('hiding');
      setTimeout(() => notification.remove(), 300);
    }
  }, 6000);
}

// 移除加载中的消息
function removeLoadingMessage() {
  const chatMessages = document.getElementById('chatMessages');
  const loadingMsg = chatMessages.querySelector('.message.ai:last-child');
  if (loadingMsg && loadingMsg.textContent.includes('正在思考中')) {
    loadingMsg.remove();
  }
}

// Add user message
function addUserMessage(text) {
  const message = {
      type: 'user',
      text: text,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  };
  
  chatHistory.push(message);
  renderMessage(message);
  saveChatHistory();
}

// Add AI message
function addAIMessage(text) {
  // 检查是否需要添加"插入笔记"按钮（非推荐文献、非错误消息）
  const shouldAddInsertBtn = !text.includes('paper-download-btn') &&
                              !text.startsWith('❌') &&
                              !text.startsWith('📚');

  if (shouldAddInsertBtn) {
    // 在文本末尾添加插入笔记按钮
    text += '\n\n<button class="insert-note-btn">📝 插入笔记</button>';
  }

  // 收集附件文件路径
  const attachedFilePaths = [];
  if (currentFile && currentFile.path) {
    attachedFilePaths.push(currentFile.path);
  }
  attachedFiles.forEach(file => {
    if (file.path && !attachedFilePaths.includes(file.path)) {
      attachedFilePaths.push(file.path);
    }
  });

  const message = {
      type: 'ai',
      text: text,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      // 保存附件文件路径
      attachedFiles: attachedFilePaths.length > 0 ? attachedFilePaths : null
  };

  chatHistory.push(message);
  renderMessage(message);
  saveChatHistory();
}

// Render message
function renderMessage(message) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${message.type}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  const avatarImg = document.createElement('img');
  if (message.type === 'user') {
    const savedAvatar = localStorage.getItem('profilePicture');
    avatarImg.src = savedAvatar || '../../img/user.png';
  } else {
    avatarImg.src = '../../img/robot.png';
  }
  avatar.appendChild(avatarImg);
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  // 使用更强大的全局 renderMarkdown 函数
  content.innerHTML = renderMarkdown(message.text);

  // 为外部链接添加点击处理，在默认浏览器中打开
  content.querySelectorAll('.external-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = link.dataset.url;
      if (url) {
        await window.electronAPI.shell.openExternal(url);
      }
    });
  });

  // 为本地文件链接添加点击处理，在主界面打开（传入工作区根目录解析相对路径）
  bindLocalFileLinks(content, currentFolderPath);

  // 为 PDF 下载链接添加点击处理，直接下载并保存
  content.querySelectorAll('.pdf-download-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const paperData = JSON.parse(link.dataset.paper);
        await downloadAndSavePdf(paperData, link);
      } catch (err) {
        console.error('PDF 下载失败:', err);
        showMainToast('下载失败: ' + err.message, 'error');
      }
    });
  });

  // 为论文下载按钮添加点击处理
  content.querySelectorAll('.paper-download-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const paperData = JSON.parse(btn.dataset.paper);
        await downloadAndSavePdf(paperData, btn);
      } catch (err) {
        console.error('PDF 下载失败:', err);
        showMainToast('下载失败: ' + err.message, 'error');
      }
    });
  });

  // 为插入笔记按钮添加点击处理
  content.querySelectorAll('.insert-note-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      // 提取原始消息文本（移除按钮部分）
      const originalText = message.text.replace(/\n\n<button class="insert-note-btn"[^>]*>[\s\S]*?<\/button>$/, '');
      // 传递附件信息
      await insertNoteToKnowledgeBase(originalText, btn, message.attachedFiles);
    });
  });

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = message.time;
  content.appendChild(time);
  
  if (message.type === 'ai') {
    const feedback = document.createElement('div');
    feedback.className = 'message-feedback';
    feedback.innerHTML = '<button class="feedback-btn">👍</button><button class="feedback-btn">👎</button>';
    content.appendChild(feedback);
  }
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Save chat history
function saveChatHistory() {
  // 按照需求，不再持久化保存对话记录
  // localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

// Load chat history
function loadChatHistory() {
  // 按照需求，每次进入都是空白的，清空之前的记录
  localStorage.removeItem('chatHistory'); 
  chatHistory = [];
}

// ================= 模板管理功能 =================

// 默认模板数据
let templates = [
  {
    id: 1,
    name: '概念解释模板',
    description: '用于记录概念解释',
    color: 'green',
    content: '# 概念解释\n\n## 概念名称\n\n## 定义\n\n## 核心要点\n\n## 应用场景\n\n## 相关概念\n'
  },
  {
    id: 2,
    name: '论文总结模板',
    description: '用于总结论文',
    color: 'blue',
    content: '# 论文总结\n\n## 论文标题\n\n## 作者信息\n\n## 核心观点\n\n## 研究方法\n\n## 主要结论\n\n## 个人思考\n'
  },
  {
    id: 3,
    name: '代码分析模板',
    description: '用于分析代码片段',
    color: 'purple',
    content: '# 代码分析\n\n## 代码功能\n\n## 代码结构\n\n## 关键算法\n\n## 优化建议\n\n## 相关知识点\n'
  },
  {
    id: 4,
    name: '实验记录模板',
    description: '用于记录实验过程',
    color: 'orange',
    content: '# 实验记录\n\n## 实验目的\n\n## 实验环境\n\n## 实验步骤\n\n## 实验结果\n\n## 问题分析\n\n## 改进方向\n'
  }
];

// ================= 中间面板视图管理 =================
// 统一视图切换，确保同时只有一个视图可见
function switchMiddleView(viewName) {
  const views = {
    display: document.getElementById('displayArea'),
    template: document.getElementById('templateView'),
    editor: document.getElementById('templateEditorView'),
  };
  Object.entries(views).forEach(([name, el]) => {
    if (el) el.style.display = name === viewName ? 'flex' : 'none';
  });
}

// 显示模板选择界面
function showTemplateView() {
  switchMiddleView('template');
  renderTemplates();
}

// 隐藏模板选择界面
function hideTemplateView() {
  switchMiddleView('display');
}

// 显示模板编辑界面
function showTemplateEditor(template = null) {
  const templateEditorView = document.getElementById('templateEditorView');
  const editorTitle = document.getElementById('editorTitle');
  const templateTitleInput = document.getElementById('templateTitleInput');
  const templateContentInput = document.getElementById('templateContentInput');
  const editorDate = document.getElementById('editorDate');

  switchMiddleView('editor');

  if (templateEditorView) {
    templateEditorView.dataset.templateId = template ? template.id : '';

    if (template) {
      editorTitle.textContent = '编辑自定义模板';
      templateTitleInput.value = template.name;
      templateContentInput.value = template.content;
    } else {
      editorTitle.textContent = '新建自定义模板';
      templateTitleInput.value = '';
      templateContentInput.value = '# 标题\n\n## 正文内容\n\n';
    }

    const now = new Date();
    editorDate.textContent = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  }
}

// 隐藏模板编辑界面
function hideTemplateEditor() {
  switchMiddleView('display');
}

// ================= 自定义文件夹选择器 =================
function showFolderPicker(basePath, treeData) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    let selectedPath = basePath; // 默认选择根目录

    // 递归构建文件夹树 HTML
    function buildFolderTree(items, depth = 0) {
      let html = '';
      items.forEach(item => {
        if (item.type === 'folder') {
          const indent = depth * 20;
          // 构建完整路径用于 data-path
          const fullPath = item.path;
          
          html += `<div class="folder-picker-item" data-path="${fullPath}" data-name="${item.name.toLowerCase()}" style="padding-left:${indent + 12}px;">
            <span class="folder-picker-icon">📁</span> <span class="folder-picker-name">${item.name}</span>
          </div>`;
          if (item.children && item.children.length > 0) {
            html += buildFolderTree(item.children, depth + 1);
          }
        }
      });
      return html;
    }

    const folderName = basePath.split(/[\\/]/).pop();
    const folderTreeHtml = buildFolderTree(treeData);

    overlay.innerHTML = `
      <div class="dialog-box" style="min-width:450px;max-width:600px;max-height:80vh;display:flex;flex-direction:column;">
        <div class="dialog-header" style="margin-bottom:15px;border-bottom:1px solid #444;padding-bottom:10px;">
          <strong style="font-size:16px;">选择保存位置</strong>
        </div>
        
        <div class="dialog-search" style="margin-bottom:10px;">
          <input type="text" id="fpSearchInput" class="dialog-input" placeholder="搜索文件夹..." style="margin-bottom:0;">
        </div>

        <div class="folder-picker-tree" id="fpTree" style="flex:1;overflow-y:auto;min-height:200px;max-height:400px;border:1px solid #444;border-radius:8px;background:#1a1a1a;margin-bottom:15px;">
          <div class="folder-picker-item selected" data-path="${basePath}" data-name="${folderName.toLowerCase()}" style="padding-left:12px;">
            <span class="folder-picker-icon">📁</span> <span class="folder-picker-name">${folderName}（根目录）</span>
          </div>
          ${folderTreeHtml}
        </div>
        
        <div class="dialog-footer" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <div class="selected-path-display" style="font-size:12px;color:#888;max-width:250px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            已选: ${basePath}
          </div>
          <div class="dialog-buttons">
            <button class="dialog-btn" id="fpCancel">取消</button>
            <button class="dialog-btn dialog-btn-primary" id="fpConfirm">确定</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const treeContainer = overlay.querySelector('#fpTree');
    const searchInput = overlay.querySelector('#fpSearchInput');
    const pathDisplay = overlay.querySelector('.selected-path-display');
    const confirmBtn = overlay.querySelector('#fpConfirm');

    // 搜索功能
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const items = treeContainer.querySelectorAll('.folder-picker-item');
      
      items.forEach(item => {
        const name = item.dataset.name;
        if (name.includes(query)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    });

    // 点击选中文件夹
    const items = overlay.querySelectorAll('.folder-picker-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        selectedPath = item.dataset.path;
        pathDisplay.textContent = `已选: ${selectedPath}`;
        pathDisplay.title = selectedPath;
      });

      // 双击直接确认
      item.addEventListener('dblclick', () => {
        overlay.remove();
        resolve(selectedPath);
      });
    });

    overlay.querySelector('#fpCancel').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });

    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(selectedPath);
    });
    
    // 聚焦搜索框
    searchInput.focus();
  });
}


// 渲染模板列表
function renderTemplates() {
  const templateGrid = document.getElementById('templateGrid');
  if (!templateGrid) return;

  // 从localStorage加载模板
  const savedTemplates = localStorage.getItem('templates');
  if (savedTemplates) {
    templates = JSON.parse(savedTemplates);
  }

  templateGrid.innerHTML = '';

  templates.forEach(template => {
    const card = document.createElement('div');
    card.className = `template-card ${template.color}`;

    card.innerHTML = `
      <div class="template-card-title">${template.name}</div>
      <div class="template-card-desc">${template.description}</div>
      <div class="template-card-actions">
        <button class="template-card-btn use" data-id="${template.id}">使用</button>
        <button class="template-card-btn edit" data-id="${template.id}">编辑</button>
      </div>
    `;

    card.querySelector('.use').addEventListener('click', (e) => {
      e.stopPropagation();
      useTemplate(template);
    });

    card.querySelector('.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      editTemplate(template);
    });

    templateGrid.appendChild(card);
  });

  const newTemplateBtn = document.getElementById('newTemplateBtn');
  if (newTemplateBtn) {
    newTemplateBtn.onclick = () => createCustomTemplate();
  }
}

// 使用模板（带文件夹选择器和笔记编辑器）
async function useTemplate(template) {
  if (!currentFolderPath) {
    await showAlert('请先打开一个文件夹');
    return;
  }

  // 1. 让用户选择保存路径
  const savePath = await showFolderPicker(currentFolderPath, fileTreeData);
  if (!savePath) return;

  // 2. 让用户输入文件名
  const fileName = await showPrompt('请输入笔记文件名：<br><br>例如：深度学习基础笔记');
  if (!fileName || fileName.trim() === '') return;

  const filePath = savePath.replace(/\\/g, '/') + '/' + fileName.trim() + '.md';

  try {
    const result = await window.electronAPI.file.write(filePath, template.content);
    if (result.success) {
      showMainToast('笔记创建成功！');
      await refreshFileTree(false);
      // 3. 自动进入编辑模式
      openNoteEditor(filePath, template.content);
    } else {
      await showAlert('创建失败：' + (result.error || '未知错误'));
    }
  } catch (error) {
    console.error('创建笔记失败:', error);
    await showAlert('创建失败：' + error.message);
  }
}

// 编辑模板
async function editTemplate(template) {
  showTemplateEditor(template);
}

// ================= Markdown 笔记编辑器 =================
let _noteEditorFilePath = null;

function openNoteEditor(filePath, content) {
  _noteEditorFilePath = filePath;
  const displayArea = document.getElementById('displayArea');
  if (!displayArea) return;

  switchMiddleView('display');

  const fileName = filePath.split(/[\\/]/).pop();

  displayArea.innerHTML = `
    <div class="note-editor-container">
      <div class="note-editor-toolbar">
        <span class="note-editor-filename">📝 ${fileName}</span>
        <div class="note-editor-actions">
          <button class="note-editor-btn" id="noteEditBtn">✏️ 编辑</button>
          <button class="note-editor-btn active" id="notePreviewBtn">👁 预览</button>
          <button class="note-editor-btn note-save-btn" id="noteSaveBtn">💾 保存</button>
        </div>
      </div>
      <div class="note-editor-body">
        <textarea class="note-editor-textarea" id="noteTextarea" style="display:none;">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        <div class="note-editor-preview markdown-content" id="notePreview" style="display:block;"></div>
      </div>
    </div>
  `;

  const textarea = document.getElementById('noteTextarea');
  const preview = document.getElementById('notePreview');
  const editBtn = document.getElementById('noteEditBtn');
  const previewBtn = document.getElementById('notePreviewBtn');
  const saveBtn = document.getElementById('noteSaveBtn');

  // 初始化预览内容
  preview.innerHTML = renderMarkdown(content);

  // 为预览内容中的链接添加点击处理
  const addLinkHandlers = () => {
    preview.querySelectorAll('.external-link').forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = link.dataset.url;
        if (url) {
          await window.electronAPI.shell.openExternal(url);
        }
      });
    });
    bindLocalFileLinks(preview, getDirname(_noteEditorFilePath));
  };
  addLinkHandlers();

  editBtn.addEventListener('click', () => {
    textarea.style.display = 'block';
    preview.style.display = 'none';
    editBtn.classList.add('active');
    previewBtn.classList.remove('active');
    textarea.focus();
  });

  previewBtn.addEventListener('click', () => {
    preview.innerHTML = renderMarkdown(textarea.value);
    addLinkHandlers();
    textarea.style.display = 'none';
    preview.style.display = 'block';
    previewBtn.classList.add('active');
    editBtn.classList.remove('active');
  });

  saveBtn.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.file.write(_noteEditorFilePath, textarea.value);
      if (result.success) {
        showMainToast('保存成功！');
      } else {
        showMainToast('保存失败：' + (result.error || '未知错误'), 'error');
      }
    } catch (err) {
      showMainToast('保存失败：' + err.message, 'error');
    }
  });
}

// 从编辑界面保存模板
async function saveTemplateFromEditor() {
  const templateEditorView = document.getElementById('templateEditorView');
  const templateTitleInput = document.getElementById('templateTitleInput');
  const templateContentInput = document.getElementById('templateContentInput');
  
  if (!templateTitleInput || !templateContentInput) {
    return;
  }
  
  const title = templateTitleInput.value.trim();
  const content = templateContentInput.value.trim();
  
  if (!title) {
    await showAlert('请输入模板标题');
    return;
  }
  
  if (!content) {
    await showAlert('请输入模板内容');
    return;
  }
  
  const templateId = templateEditorView.dataset.templateId;
  
  // 从localStorage加载模板
  const savedTemplates = localStorage.getItem('templates');
  if (savedTemplates) {
    templates = JSON.parse(savedTemplates);
  }
  
  if (templateId) {
    // 编辑模式：更新现有模板
    const template = templates.find(t => t.id == templateId);
    if (template) {
      template.name = title;
      template.content = content;
    }
  } else {
    // 新建模式：创建新模板
    const newTemplate = {
      id: Date.now(),
      name: title,
      description: '自定义模板',
      color: 'green',
      content: content
    };
    templates.push(newTemplate);
  }
  
  localStorage.setItem('templates', JSON.stringify(templates));
  
  // 如果模板视图是打开的，更新它
  const templateView = document.getElementById('templateView');
  if (templateView && templateView.style.display !== 'none') {
    renderTemplates();
  }
  
  hideTemplateEditor();
  await showAlert(templateId ? '模板已更新' : '模板创建成功！');
}

// 创建自定义模板（保留用于从模板列表创建）
async function createCustomTemplate() {
  showTemplateEditor();
}

