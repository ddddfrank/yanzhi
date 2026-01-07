// File tree data structure
let fileTreeData = [];

// Current opened folder path
let currentFolderPath = null;

// Current selected file
let currentFile = null;

// 是否正在刷新
let isRefreshing = false;

// 是否正在懒加载（避免触发文件监听刷新）
let isLazyLoading = false;

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
      return; // 用户取消选择
    }
    
    const folderPath = openResult.path;
    currentFolderPath = folderPath;
    console.log('选择的文件夹:', folderPath);
    
    // 读取文件夹内容
    const readResult = await window.electronAPI.folder.read(folderPath);
    if (!readResult.success) {
      throw new Error(readResult.error || '读取文件夹失败');
    }
    
    // 将文件系统内容转换为 fileTreeData 格式
    fileTreeData = convertToTreeData(readResult.items, folderPath);
    renderFileTree();
    
    // 保存文件夹状态
    saveFolderState();
    
    // 启动文件监听
    await startFolderWatch(folderPath);
    
  } catch (error) {
    console.error('打开文件夹失败:', error);
    alert('打开文件夹失败: ' + error.message);
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
  console.log('createSubFolder 被调用, currentFolderPath =', currentFolderPath);
  
  // 如果没有打开文件夹，先让用户选择一个
  if (!currentFolderPath) {
    const confirmOpen = await showConfirm('请先选择一个文件夹作为父目录。<br>点击"确定"选择文件夹。');
    if (!confirmOpen) return;
    
    await openFolder();
    if (!currentFolderPath) {
      return; // 用户取消了选择
    }
  }
  
  // 弹出输入框让用户输入文件夹名称
  const folderName = await showPrompt('请输入新建文件夹的名称（将用于研究主题）：<br><br>例如：Transformer、强化学习、图神经网络');
  console.log('用户输入的文件夹名称:', folderName);
  
  if (!folderName || folderName.trim() === '') {
    console.log('用户取消或输入为空');
    return; // 用户取消或输入为空
  }
  
  // 显示加载提示
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'createFolderLoading';
  loadingDiv.className = 'dialog-overlay';
  loadingDiv.innerHTML = '<div class="dialog-box"><div class="dialog-content">🤖 AI 正在生成文件夹描述，请稍候...</div></div>';
  document.body.appendChild(loadingDiv);
  
  try {
    // 调用后端创建文件夹
    console.log('开始创建文件夹:', folderName, '在', currentFolderPath);
    const result = await window.electronAPI.folder.create(folderName.trim(), currentFolderPath);
    console.log('创建结果:', result);
    
    // 移除加载提示
    loadingDiv.remove();
    
    if (result.success) {
      console.log('文件夹创建成功:', result.path);
      
      // 重新读取文件夹内容以刷新列表
      const readResult = await window.electronAPI.folder.read(currentFolderPath);
      if (readResult.success) {
        fileTreeData = convertToTreeData(readResult.items, currentFolderPath);
        renderFileTree();
        // 保存文件夹状态
        saveFolderState();
      }
      
      await showAlert(`文件夹 "${folderName}" 创建成功！<br><br>📝 描述: ${result.description || '无'}`);
    } else {
      await showAlert('创建文件夹失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    // 移除加载提示
    const loading = document.getElementById('createFolderLoading');
    if (loading) loading.remove();
    
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
});

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
    
    fileItem.appendChild(icon);
    fileItem.appendChild(name);
    
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
      const iframe = document.createElement('iframe');
      if (file.path) {
        iframe.src = 'file:///' + file.path.replace(/\\/g, '/');
      } else {
        iframe.src = file.url || 'https://via.placeholder.com/800x600/333333/ffffff?text=' + encodeURIComponent(file.name);
      }
      iframe.className = 'file-preview';
      displayArea.innerHTML = '';
      displayArea.appendChild(iframe);
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
        const renderedContent = renderMarkdown(content);
        div.innerHTML = `<div class="markdown-content">${renderedContent}</div>`;
      } else {
        div.innerHTML = `<pre style="color: #ffffff; white-space: pre-wrap; padding: 20px;">${escapeHtml(content)}</pre>`;
      }
      
      displayArea.innerHTML = '';
      displayArea.appendChild(div);
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
    if (match.includes('CODE_BLOCK') || match.includes('INLINE_CODE')) {
      return match;
    }
    return '<em>' + text + '</em>';
  });
  
  // 删除线 (~~text~~)
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  
  // 链接 [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
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
  
  return html;
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
  
  // 新建按钮和下拉菜单
  const newFolderBtn = document.getElementById('newFolderBtn');
  const newDropdown = document.getElementById('newDropdown');
  const newFolderOption = document.getElementById('newFolderOption');
  const newNoteOption = document.getElementById('newNoteOption');
  const newTemplateOption = document.getElementById('newTemplateOption');
  const newCustomTemplateOption = document.getElementById('newCustomTemplateOption');
  
  if (newFolderBtn && newDropdown) {
    // 更新下拉菜单位置的函数
    const updateDropdownPosition = () => {
      const rect = newFolderBtn.getBoundingClientRect();
      newDropdown.style.left = rect.left + 'px';
      newDropdown.style.top = (rect.bottom + 5) + 'px';
      newDropdown.style.width = rect.width + 'px';
    };
    
    // 点击新建按钮显示/隐藏下拉菜单
    newFolderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = newDropdown.classList.contains('show');
      if (!isShowing) {
        updateDropdownPosition();
      }
      newDropdown.classList.toggle('show');
    });
    
    // 窗口大小改变时更新位置
    window.addEventListener('resize', () => {
      if (newDropdown.classList.contains('show')) {
        updateDropdownPosition();
      }
    });
    
    // 处理二级菜单的显示位置
    if (newNoteOption) {
      const submenu = newNoteOption.querySelector('.submenu');
      if (submenu) {
        // 更新二级菜单位置的函数
        const updateSubmenuPosition = () => {
          const rect = newNoteOption.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          
          // 计算二级菜单的位置，紧贴主菜单（无间隙）
          let left = rect.right;
          let top = rect.top;
          
          // 如果右侧空间不够，显示在左侧
          if (left + 180 > viewportWidth) {
            left = rect.left - 180; // 180px宽度，无间距
          }
          
          submenu.style.left = left + 'px';
          submenu.style.top = top + 'px';
        };
        
        // 鼠标进入主菜单项时更新位置
        newNoteOption.addEventListener('mouseenter', updateSubmenuPosition);
        
        // 鼠标进入二级菜单时也更新位置（防止位置偏移）
        submenu.addEventListener('mouseenter', updateSubmenuPosition);
        
        // 窗口大小改变时更新位置
        window.addEventListener('resize', () => {
          if (submenu.style.display !== 'none') {
            updateSubmenuPosition();
          }
        });
      }
    }
    
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
  
  // File drop zone
  const dropZone = document.getElementById('fileDropZone');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFileUpload(e.dataTransfer.files);
  });
  
  // Template button
  document.getElementById('templateBtn').addEventListener('click', () => {
    alert('笔记模板功能开发中...');
  });

  // Navigation icons - 页面跳转
  // 用户头像 - 跳转到首页
  const navUserIcon = document.getElementById('navUser');
  if (navUserIcon) {
    // 加载用户头像
    const avatarImg = navUserIcon.querySelector('img');
    const savedAvatar = localStorage.getItem('profilePicture');
    if (savedAvatar && avatarImg) {
      avatarImg.src = savedAvatar;
    }
    // 点击跳转到首页
    navUserIcon.addEventListener('click', () => {
      window.location.href = '../index.html';
    });
  }
  
  // 主界面（AI智能解释）- 当前页面，不需要跳转
  document.getElementById('navMain')?.addEventListener('click', () => {
    // 当前页面，不需要跳转
    console.log('已在主界面');
  });
  
  // 文献推荐页面
  document.getElementById('navRecommend')?.addEventListener('click', () => {
    window.location.href = '../recommend/recommend.html';
  });
  
  // 知识管理页面
  document.getElementById('navManage')?.addEventListener('click', () => {
    window.location.href = '../manage/manage.html';
  });
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
    // 获取当前文件内容（如果有）
    let fileContent = null;
    let fileName = null;
    
    if (currentFile && currentFile.path) {
      fileName = currentFile.name;
      // 尝试读取文件内容
      if (currentFile.fileType === 'markdown' || currentFile.fileType === 'file') {
        try {
          const result = await window.electronAPI.file.read(currentFile.path);
          if (result.success) {
            fileContent = result.content;
          }
        } catch (e) {
          console.warn('读取文件内容失败:', e);
        }
      } else if (currentFile.fileType === 'pdf') {
        // PDF 文件使用 OCR 读取
        try {
          console.log('正在使用 OCR 读取 PDF 文件:', currentFile.path);
          const result = await window.electronAPI.file.readPdf(currentFile.path);
          if (result.success) {
            fileContent = result.content;
            console.log('PDF OCR 读取成功，内容长度:', fileContent.length);
          } else {
            console.warn('PDF OCR 读取失败:', result.error);
          }
        } catch (e) {
          console.warn('PDF OCR 调用失败:', e);
        }
      }
    }
    
    // 调用 AI API
    const result = await window.electronAPI.ai.ask(userQuery, fileContent, fileName);
    
    // 移除加载消息
    removeLoadingMessage();
    
    if (result.success) {
      addAIMessage(result.response);
    } else {
      addAIMessage(`❌ AI 请求失败: ${result.error || '未知错误'}`);
    }
    
  } catch (error) {
    console.error('AI 调用失败:', error);
    removeLoadingMessage();
    addAIMessage(`❌ AI 调用出错: ${error.message}`);
  }
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
  const message = {
      type: 'ai',
      text: text,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
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
  avatarImg.src = message.type === 'user' ? '../../img/user.png' : '../../img/robot.png';
  avatar.appendChild(avatarImg);
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  // Convert text to HTML with line breaks and formatting
  let html = message.text.replace(/\n/g, '<br>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(\d+)\.\s/g, '<strong>$1.</strong> ');
  content.innerHTML = html;
  
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
  localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

// Load chat history
function loadChatHistory() {
  const saved = localStorage.getItem('chatHistory');
  if (saved) {
    chatHistory = JSON.parse(saved);
    chatHistory.forEach(message => {
      renderMessage(message);
    });
  }
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

// 显示模板选择界面
function showTemplateView() {
  const displayArea = document.getElementById('displayArea');
  const templateView = document.getElementById('templateView');
  
  if (displayArea && templateView) {
    displayArea.style.display = 'none';
    templateView.style.display = 'flex';
    renderTemplates();
  }
}

// 隐藏模板选择界面
function hideTemplateView() {
  const displayArea = document.getElementById('displayArea');
  const templateView = document.getElementById('templateView');
  
  if (displayArea && templateView) {
    displayArea.style.display = 'flex';
    templateView.style.display = 'none';
  }
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
    
    // 使用模板
    card.querySelector('.use').addEventListener('click', (e) => {
      e.stopPropagation();
      useTemplate(template);
    });
    
    // 编辑模板
    card.querySelector('.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      editTemplate(template);
    });
    
    templateGrid.appendChild(card);
  });
  
  // 新建模板按钮
  const newTemplateBtn = document.getElementById('newTemplateBtn');
  if (newTemplateBtn) {
    newTemplateBtn.onclick = () => createCustomTemplate();
  }
}

// 使用模板
async function useTemplate(template) {
  if (!currentFolderPath) {
    await showAlert('请先打开一个文件夹');
    return;
  }
  
  const fileName = await showPrompt('请输入笔记文件名：<br><br>例如：深度学习基础笔记');
  if (!fileName || fileName.trim() === '') {
    return;
  }
  
  const filePath = `${currentFolderPath}/${fileName.trim()}.md`;
  
  try {
    const result = await window.electronAPI.file.write(filePath, template.content);
    if (result.success) {
      await showAlert('笔记创建成功！');
      await refreshFileTree(false);
      hideTemplateView();
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

// 显示模板编辑界面
function showTemplateEditor(template = null) {
  const displayArea = document.getElementById('displayArea');
  const templateView = document.getElementById('templateView');
  const templateEditorView = document.getElementById('templateEditorView');
  const editorTitle = document.getElementById('editorTitle');
  const templateTitleInput = document.getElementById('templateTitleInput');
  const templateContentInput = document.getElementById('templateContentInput');
  const editorDate = document.getElementById('editorDate');
  
  if (displayArea && templateEditorView) {
    displayArea.style.display = 'none';
    if (templateView) templateView.style.display = 'none';
    templateEditorView.style.display = 'flex';
    
    // 设置当前编辑的模板（用于编辑模式）
    templateEditorView.dataset.templateId = template ? template.id : '';
    
    if (template) {
      // 编辑模式
      editorTitle.textContent = '编辑自定义模板';
      templateTitleInput.value = template.name;
      templateContentInput.value = template.content;
    } else {
      // 新建模式
      editorTitle.textContent = '新建自定义模板';
      templateTitleInput.value = '';
      templateContentInput.value = '# 标题\n\n## 正文内容\n\n';
    }
    
    // 更新日期
    const now = new Date();
    editorDate.textContent = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  }
}

// 隐藏模板编辑界面
function hideTemplateEditor() {
  const displayArea = document.getElementById('displayArea');
  const templateEditorView = document.getElementById('templateEditorView');
  
  if (displayArea && templateEditorView) {
    templateEditorView.style.display = 'none';
    displayArea.style.display = 'flex';
  }
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

