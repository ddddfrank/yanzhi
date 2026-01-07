// Search history data
let searchHistory = [];
let recommendedArticles = [];
let favoriteArticles = new Set();

// 分页相关
let currentPage = 1;
let totalPages = 1;
let currentQuery = '';
const PAGE_SIZE = 5;
const MAX_RESULTS = 50; // 最多获取50条结果用于分页

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSearchHistory();
  loadRecommendedArticles();
  loadFavorites();
  setupEventListeners();
  setupScheduleListeners();
  setupPaginationListeners();
  renderSearchHistory();
  renderArticles();
  loadScheduledTasks();
  
  // 监听定时推荐通知
  window.electronAPI.schedule.onNotification((data) => {
    if (data.showInApp) {
      showInAppNotification(data.keyword, data.papers);
    }
    // 如果当前在推荐页面，可以自动加载结果
    if (data.papers && data.papers.length > 0) {
      recommendedArticles = data.papers.map((paper, index) => ({
        id: Date.now() + index,
        title: paper.title,
        authors: paper.authors,
        publication: `arXiv | ${paper.published_date}`,
        date: paper.published_date,
        source: 'arXiv',
        sourceType: 'arxiv',
        abstract: paper.summary,
        url: paper.url,
        pdfUrl: paper.pdf_url,
        expanded: false
      }));
      currentQuery = data.keyword;
      currentPage = 1;
      totalPages = 1;
      renderArticles();
      updatePagination();
    }
  });
});

// Setup event listeners
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('searchInput');
  const searchIcon = document.querySelector('.search-icon');
  
  searchInput.addEventListener('click', () => {
    // Focus and show search suggestions if needed
    searchInput.focus();
  });

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch(searchInput.value.trim());
    }
  });
  
  // 点击搜索图标也触发搜索
  if (searchIcon) {
    searchIcon.style.cursor = 'pointer';
    searchIcon.addEventListener('click', () => {
      performSearch(searchInput.value.trim());
    });
  }

  // Load user avatar
  loadUserAvatar();
  
  // Navigation logic
  setupNavigation();
}

// Perform search - 调用 Arxiv API
async function performSearch(query, page = 1) {
  if (!query) return;

  // 如果是新搜索，重置分页
  if (query !== currentQuery) {
    currentPage = 1;
    currentQuery = query;
    // Add to search history
    addToSearchHistory(query);
  } else {
    currentPage = page;
  }
  
  console.log('Searching for:', query, 'Page:', currentPage);
  
  // 显示加载状态
  const articlesList = document.getElementById('articlesList');
  articlesList.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">正在搜索 Arxiv...</div>
    </div>
  `;
  
  // 隐藏分页
  document.getElementById('pagination').style.display = 'none';
  
  try {
    // 计算需要获取的结果数量（获取足够的结果用于分页）
    const maxResults = Math.min(MAX_RESULTS, currentPage * PAGE_SIZE + PAGE_SIZE);
    
    // 调用后端 API 搜索 Arxiv
    const result = await window.electronAPI.arxiv.search(query, maxResults);
    
    if (result.success && result.papers.length > 0) {
      // 计算总页数
      totalPages = Math.ceil(result.papers.length / PAGE_SIZE);
      
      // 获取当前页的数据
      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const endIndex = startIndex + PAGE_SIZE;
      const currentPagePapers = result.papers.slice(startIndex, endIndex);
      
      // 将 Arxiv 返回的论文转换为我们的格式
      recommendedArticles = currentPagePapers.map((paper, index) => ({
        id: Date.now() + index,
        title: paper.title,
        authors: paper.authors,
        publication: `arXiv | ${paper.published_date}`,
        date: paper.published_date,
        source: 'arXiv',
        sourceType: 'arxiv',
        abstract: paper.summary,
        url: paper.url,
        pdfUrl: paper.pdf_url,
        expanded: false
      }));
      
      renderArticles();
      updatePagination();
      
    } else if (result.success && result.papers.length === 0) {
      articlesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-text">未找到相关论文，请尝试其他关键词</div>
        </div>
      `;
    } else {
      articlesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-text">搜索失败: ${result.error || '未知错误'}</div>
        </div>
      `;
    }
  } catch (error) {
    console.error('搜索出错:', error);
    articlesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-text">搜索出错: ${error.message}</div>
      </div>
    `;
  }
}

// 更新分页控件
function updatePagination() {
  const pagination = document.getElementById('pagination');
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  
  if (totalPages <= 1) {
    pagination.style.display = 'none';
    return;
  }
  
  pagination.style.display = 'flex';
  pageInfo.textContent = `${currentPage} / ${totalPages}`;
  
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

// 设置分页事件监听
function setupPaginationListeners() {
  document.getElementById('prevPageBtn')?.addEventListener('click', () => {
    if (currentPage > 1) {
      performSearch(currentQuery, currentPage - 1);
    }
  });
  
  document.getElementById('nextPageBtn')?.addEventListener('click', () => {
    if (currentPage < totalPages) {
      performSearch(currentQuery, currentPage + 1);
    }
  });
}

// Add to search history
function addToSearchHistory(query) {
  // Remove if already exists
  searchHistory = searchHistory.filter(item => item !== query);
  
  // Add to beginning
  searchHistory.unshift(query);
  
  // Keep only last 10
  if (searchHistory.length > 10) {
    searchHistory = searchHistory.slice(0, 10);
  }
  
  saveSearchHistory();
  renderSearchHistory();
}

// Render search history
function renderSearchHistory() {
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';
  
  if (searchHistory.length === 0) {
    historyList.innerHTML = '<div style="color: #666; font-size: 13px; text-align: center; padding: 20px;">暂无搜索记录</div>';
    return;
  }
  
  searchHistory.forEach((item, index) => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    const content = document.createElement('div');
    content.className = 'history-item-content';
    
    const number = document.createElement('span');
    number.className = 'history-number';
    number.textContent = `${searchHistory.length - index}`;
    
    const text = document.createElement('span');
    text.className = 'history-text';
    text.textContent = item;
    
    content.appendChild(number);
    content.appendChild(text);
    
    const actions = document.createElement('div');
    actions.className = 'history-actions';
    
    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'history-action-btn refresh';
    refreshBtn.title = '重新搜索';
    const refreshImg = document.createElement('img');
    refreshImg.src = '../../img/update.png';
    refreshImg.alt = 'Refresh';
    refreshBtn.appendChild(refreshImg);
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('searchInput').value = item;
      performSearch(item);
    });
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-action-btn delete';
    deleteBtn.title = '删除记录';
    const deleteImg = document.createElement('img');
    deleteImg.src = '../../img/delete.png';
    deleteImg.alt = 'Delete';
    deleteBtn.appendChild(deleteImg);
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromSearchHistory(item);
    });
    
    actions.appendChild(refreshBtn);
    actions.appendChild(deleteBtn);
    
    historyItem.appendChild(content);
    historyItem.appendChild(actions);
    
    // Click to search
    historyItem.addEventListener('click', () => {
      document.getElementById('searchInput').value = item;
      performSearch(item);
    });
    
    historyList.appendChild(historyItem);
  });
}

// Remove from search history
function removeFromSearchHistory(query) {
  searchHistory = searchHistory.filter(item => item !== query);
  saveSearchHistory();
  renderSearchHistory();
}

// Load recommended articles (will be populated by search)
function loadRecommendedArticles() {
  // 初始为空，等待用户搜索
  recommendedArticles = [];
}

// Format date
function formatDate(date) {
  if (typeof date === 'string') return date;
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return '今天';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  } else {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}.${day}`;
  }
}

// Render articles
function renderArticles() {
  const articlesList = document.getElementById('articlesList');
  articlesList.innerHTML = '';
  
  if (recommendedArticles.length === 0) {
    articlesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-text">
          <p style="font-size: 18px; margin-bottom: 10px;">🔍 输入关键词搜索 arXiv 论文</p>
          <p style="color: #666; font-size: 14px;">支持简单关键词，也支持逻辑符 (如: "LLM AND RAG")</p>
        </div>
      </div>
    `;
    return;
  }
  
  recommendedArticles.forEach((article, index) => {
    const card = createArticleCard(article);
    articlesList.appendChild(card);
  });
}

// Create article card
function createArticleCard(article) {
  const card = document.createElement('div');
  card.className = 'article-card';
  if (article.expanded) {
    card.classList.add('expanded');
  }
  
  // Header
  const header = document.createElement('div');
  header.className = 'article-header';
  
  // Favorite icon
  const favorite = document.createElement('div');
  favorite.className = 'article-favorite';
  if (favoriteArticles.has(article.id)) {
    favorite.classList.add('active');
  }
  
  favorite.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(article.id);
    if (favoriteArticles.has(article.id)) {
      favorite.classList.add('active');
    } else {
      favorite.classList.remove('active');
    }
  });
  
  // Main content
  const main = document.createElement('div');
  main.className = 'article-main';
  
  const title = document.createElement('div');
  title.className = 'article-title';
  title.textContent = article.title;
  
  const meta = document.createElement('div');
  meta.className = 'article-meta';
  meta.textContent = `${article.authors}\n${article.publication}`;
  
  main.appendChild(title);
  main.appendChild(meta);
  
  header.appendChild(favorite);
  header.appendChild(main);
  
  // Footer
  const footer = document.createElement('div');
  footer.className = 'article-footer';
  
  const dateSource = document.createElement('div');
  dateSource.className = 'article-date-source';
  
  const date = document.createElement('span');
  date.className = 'article-date';
  date.textContent = article.date;
  
  const source = document.createElement('span');
  source.className = `article-source ${article.sourceType}`;
  source.textContent = article.source;
  source.addEventListener('click', (e) => {
    e.stopPropagation();
    // 打开论文链接
    if (article.url) {
      require('electron').shell.openExternal(article.url);
    }
  });
  
  dateSource.appendChild(date);
  dateSource.appendChild(source);
  
  // 操作按钮区域
  const actions = document.createElement('div');
  actions.className = 'article-actions';
  
  // 下载按钮
  if (article.pdfUrl) {
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'article-download-btn';
    downloadBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>下载PDF</span>
    `;
    downloadBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await downloadAndSavePaper(article, downloadBtn);
    });
    actions.appendChild(downloadBtn);
  }
  
  const expand = document.createElement('div');
  expand.className = 'article-expand';
  expand.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  
  footer.appendChild(dateSource);
  footer.appendChild(actions);
  footer.appendChild(expand);
  
  // Abstract (hidden by default)
  const abstract = document.createElement('div');
  abstract.className = 'article-abstract';
  const abstractContent = document.createElement('div');
  abstractContent.className = 'article-abstract-content';
  abstractContent.textContent = article.abstract;
  abstract.appendChild(abstractContent);
  
  // Assemble card
  card.appendChild(header);
  card.appendChild(footer);
  card.appendChild(abstract);
  
  // Click to expand/collapse
  card.addEventListener('click', (e) => {
    // Don't toggle if clicking on favorite or source or download
    if (e.target.closest('.article-favorite') || e.target.closest('.article-source') || e.target.closest('.article-download-btn')) {
      return;
    }
    
    article.expanded = !article.expanded;
    if (article.expanded) {
      card.classList.add('expanded');
    } else {
      card.classList.remove('expanded');
    }
  });
  
  return card;
}

// 下载并保存论文
async function downloadAndSavePaper(article, button) {
  const originalContent = button.innerHTML;
  
  try {
    // 显示下载中状态
    button.disabled = true;
    button.innerHTML = `
      <div class="btn-spinner"></div>
      <span>下载中...</span>
    `;
    
    // 1. 下载 PDF 到临时文件夹
    const downloadResult = await window.electronAPI.arxiv.download(article.pdfUrl, article.title);
    
    if (!downloadResult.success) {
      throw new Error(downloadResult.error || '下载失败');
    }
    
    console.log('PDF 下载成功:', downloadResult.path);
    
    // 2. 更新按钮状态为"正在分类"
    button.innerHTML = `
      <div class="btn-spinner"></div>
      <span>AI分类中...</span>
    `;
    
    // 3. 调用 AI 分类并保存到合适的文件夹
    const description = `论文标题: ${article.title}\n作者: ${article.authors}\n摘要: ${article.abstract.substring(0, 500)}`;
    const saveResult = await window.electronAPI.arxiv.saveToFolder(downloadResult.path, description);
    
    if (saveResult.success) {
      // 成功
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>已保存</span>
      `;
      button.classList.add('success');
      
      console.log('论文已保存到:', saveResult.path);
    } else {
      throw new Error(saveResult.error || '保存失败');
    }
    
  } catch (error) {
    console.error('下载/保存失败:', error);
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span>失败</span>
    `;
    button.classList.add('error');
    
    // 3秒后恢复按钮
    setTimeout(() => {
      button.innerHTML = originalContent;
      button.classList.remove('error');
      button.disabled = false;
    }, 3000);
  }
}

// Toggle favorite
function toggleFavorite(articleId) {
  if (favoriteArticles.has(articleId)) {
    favoriteArticles.delete(articleId);
  } else {
    favoriteArticles.add(articleId);
    // Show notification
    console.log('已收藏到知识体系管理');
  }
  saveFavorites();
}

// Save search history to localStorage
function saveSearchHistory() {
  localStorage.setItem('recommendSearchHistory', JSON.stringify(searchHistory));
}

// Load search history from localStorage
function loadSearchHistory() {
  const saved = localStorage.getItem('recommendSearchHistory');
  if (saved) {
    searchHistory = JSON.parse(saved);
  } else {
    // Default search history for demo
    searchHistory = ['deep learning', 'culture', 'multimodal', 'perferendis.json'];
  }
}

// Save favorites to localStorage
function saveFavorites() {
  localStorage.setItem('recommendFavorites', JSON.stringify(Array.from(favoriteArticles)));
}

// Load favorites from localStorage
function loadFavorites() {
  const saved = localStorage.getItem('recommendFavorites');
  if (saved) {
    favoriteArticles = new Set(JSON.parse(saved));
  }
}

// Load user avatar from localStorage
function loadUserAvatar() {
  const navUser = document.getElementById('navUser');
  if (navUser) {
    const avatarImg = navUser.querySelector('img');
    const savedAvatar = localStorage.getItem('profilePicture');
    if (savedAvatar && avatarImg) {
      avatarImg.src = savedAvatar;
    }
  }
}

// Setup navigation
function setupNavigation() {
  // User avatar click - 跳转到首页
  document.getElementById('navUser')?.addEventListener('click', () => {
    window.location.href = '../index.html';
  });
  
  // Navigation icons
  // 主界面（AI智能解释）
  document.getElementById('navMain')?.addEventListener('click', () => {
    window.location.href = '../main/main.html';
  });
  
  // 文献推荐页面（当前页面，不需要跳转）
  document.getElementById('navRecommend')?.addEventListener('click', () => {
    // Already on recommend page, do nothing
    console.log('已在文献推荐页面');
  });
  
  // 知识管理页面
  document.getElementById('navManage')?.addEventListener('click', () => {
    window.location.href = '../manage/manage.html';
  });
}

// ================= 定时推荐功能 =================

// 设置定时推荐事件监听
function setupScheduleListeners() {
  const scheduleBtn = document.getElementById('scheduleBtn');
  const scheduleModal = document.getElementById('scheduleModal');
  const modalClose = document.getElementById('modalClose');
  const modalCancel = document.getElementById('modalCancel');
  const modalSave = document.getElementById('modalSave');
  
  // 打开弹窗
  scheduleBtn?.addEventListener('click', () => {
    scheduleModal.style.display = 'flex';
    loadScheduledTasks();
  });
  
  // 关闭弹窗
  modalClose?.addEventListener('click', () => {
    scheduleModal.style.display = 'none';
  });
  
  modalCancel?.addEventListener('click', () => {
    scheduleModal.style.display = 'none';
  });
  
  // 点击遮罩关闭
  scheduleModal?.addEventListener('click', (e) => {
    if (e.target === scheduleModal) {
      scheduleModal.style.display = 'none';
    }
  });
  
  // 保存定时任务
  modalSave?.addEventListener('click', async () => {
    const keyword = document.getElementById('scheduleKeyword').value.trim();
    const time = document.getElementById('scheduleTime').value;
    const repeat = document.getElementById('scheduleRepeat').value;
    const enabled = document.getElementById('scheduleEnabled').checked;
    
    if (!keyword) {
      alert('请输入关键词');
      return;
    }
    
    const scheduleData = {
      keyword,
      time,
      repeat,
      enabled
    };
    
    try {
      const result = await window.electronAPI.schedule.save(scheduleData);
      if (result.success) {
        // 清空输入
        document.getElementById('scheduleKeyword').value = '';
        // 刷新列表
        loadScheduledTasks();
        showInAppNotification('定时推荐', [{ title: `已设置: ${keyword} - 每天 ${time}` }]);
      } else {
        alert('保存失败: ' + result.error);
      }
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  });
}

// 加载已设置的定时任务
async function loadScheduledTasks() {
  const container = document.getElementById('scheduledTasks');
  if (!container) return;
  
  try {
    const result = await window.electronAPI.schedule.load();
    
    if (result.success && result.schedules.length > 0) {
      container.innerHTML = result.schedules.map(schedule => `
        <div class="scheduled-item" data-id="${schedule.id}">
          <div class="scheduled-info">
            <span class="scheduled-keyword">${schedule.keyword}</span>
            <span class="scheduled-time">${schedule.time} | ${getRepeatLabel(schedule.repeat)}</span>
          </div>
          <div class="scheduled-actions">
            <span class="scheduled-status ${schedule.enabled ? 'enabled' : 'disabled'}">
              ${schedule.enabled ? '启用' : '禁用'}
            </span>
            <button class="scheduled-delete" data-id="${schedule.id}" title="删除">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `).join('');
      
      // 绑定删除事件
      container.querySelectorAll('.scheduled-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (confirm('确定删除这个定时任务吗？')) {
            const result = await window.electronAPI.schedule.delete(id);
            if (result.success) {
              loadScheduledTasks();
            }
          }
        });
      });
    } else {
      container.innerHTML = '<div class="no-tasks">暂无定时任务</div>';
    }
  } catch (err) {
    container.innerHTML = '<div class="no-tasks">加载失败</div>';
  }
}

// 获取重复规则的标签
function getRepeatLabel(repeat) {
  switch (repeat) {
    case 'daily': return '每天';
    case 'weekdays': return '工作日';
    case 'weekly': return '每周';
    default: return repeat;
  }
}

// 显示应用内通知
function showInAppNotification(keyword, papers) {
  const container = document.getElementById('notificationContainer');
  if (!container) return;
  
  const notification = document.createElement('div');
  notification.className = 'in-app-notification';
  notification.innerHTML = `
    <div class="notification-icon">📚</div>
    <div class="notification-content">
      <div class="notification-title">定时推荐: ${keyword}</div>
      <div class="notification-body">${papers[0]?.title?.substring(0, 60) || '新论文推荐'}...</div>
    </div>
    <button class="notification-close">&times;</button>
  `;
  
  container.appendChild(notification);
  
  // 点击关闭
  notification.querySelector('.notification-close').addEventListener('click', () => {
    notification.classList.add('hiding');
    setTimeout(() => notification.remove(), 300);
  });
  
  // 5秒后自动消失
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add('hiding');
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

