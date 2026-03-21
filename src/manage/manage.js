// Tab切换功能
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// 监听工作区更新事件
if (window.electronAPI && window.electronAPI.onWorkspaceUpdated) {
  window.electronAPI.onWorkspaceUpdated((data) => {
    console.log('收到工作区更新通知:', data);
    // 延迟一点时间确保数据已写入
    setTimeout(() => {
      // 刷新当前活跃tab的内容
      const activeTab = document.querySelector('.tab-btn.active');
      if (activeTab) {
        const targetTab = activeTab.getAttribute('data-tab');
        if (targetTab === 'overview') {
          updateOverviewStats();
        } else if (targetTab === 'category') {
          renderCategories();
        } else if (targetTab === 'items' && currentCategory) {
          renderCategorySummary(currentCategory);
          renderKnowledgeItems(currentCategory.id);
        }
      }
    }, 1000); // 等待1秒确保扫描完成
  });
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.getAttribute('data-tab');
    
    // 移除所有active类
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // 添加active类到当前tab和对应内容
    tab.classList.add('active');
    const targetContent = document.getElementById(`${targetTab}Tab`);
    if (targetContent) {
      targetContent.classList.add('active');
      
      // 当切换到概览tab时，更新统计信息
      if (targetTab === 'overview') {
        setTimeout(() => {
          updateOverviewStats();
        }, 50);
      }
      // 当切换到分类管理tab时，确保渲染分类数据
      if (targetTab === 'category') {
        setTimeout(() => {
          renderCategories();
        }, 50);
      }
      // 当切换到知识条目tab时，如果有选中的分类，显示其内容
      if (targetTab === 'items' && currentCategory) {
        setTimeout(() => {
          renderCategorySummary(currentCategory);
          renderKnowledgeItems(currentCategory.id);
        }, 50);
      }
    }
  });
});

// 搜索记录数据
let searchHistory = [];
let searchResults = [];
let isShowingResults = false;

// 初始化搜索记录（示例数据）
function initSearchHistory() {
  searchHistory = [
    { id: 4, text: 'deep learning' },
    { id: 3, text: 'culture' },
    { id: 2, text: 'multimodal' },
    { id: 1, text: 'perferendis.json' }
  ];
  renderHistory();
}

// 返回搜索记录视图
function backToHistory() {
  isShowingResults = false;
  renderHistory();
}

// 渲染搜索记录或搜索结果
function renderHistory() {
  const historyList = document.getElementById('historyList');
  const historyTitle = document.getElementById('historyTitle');
  
  if (isShowingResults && searchResults.length > 0) {
    historyTitle.innerHTML = `
      <span>搜索结果</span>
      <button class="back-to-history-btn" title="返回搜索记录">←</button>
    `;
    
    // 绑定返回按钮
    const backBtn = historyTitle.querySelector('.back-to-history-btn');
    if (backBtn) {
      backBtn.addEventListener('click', backToHistory);
    }
    
    historyList.innerHTML = searchResults.map((item, index) => `
      <div class="search-result-item" data-id="${item.id}">
        <img src="${item.icon || '../../img/file.png'}" alt="${item.type}" class="search-result-icon" />
        <div class="search-result-content">
          <div class="search-result-title">${item.title}</div>
          <div class="search-result-summary">${item.summary || item.description || ''}</div>
        </div>
      </div>
    `).join('');
    
    // 绑定搜索结果项点击事件
    document.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        // TODO: 后续实现点击搜索结果项后的操作（如打开详情等）
        console.log('点击搜索结果项:', item.getAttribute('data-id'));
      });
    });
  } else {
    historyTitle.textContent = '搜索记录';
    historyList.innerHTML = searchHistory.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-item-content">
          <span class="history-number">${item.id}</span>
          <span class="history-text">${item.text}</span>
        </div>
        <div class="history-actions">
          <button class="history-action-btn refresh" title="刷新">
            <img src="../../img/update.png" alt="Refresh" />
          </button>
          <button class="history-action-btn delete" title="删除">
            <img src="../../img/delete.png" alt="Delete" />
          </button>
        </div>
      </div>
    `).join('');
    
    // 绑定删除和刷新事件
    document.querySelectorAll('.history-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.history-item');
        const id = parseInt(item.getAttribute('data-id'));
        deleteHistoryItem(id);
      });
    });
    
    document.querySelectorAll('.history-action-btn.refresh').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.history-item');
        const id = parseInt(item.getAttribute('data-id'));
        const historyItem = searchHistory.find(h => h.id === id);
        if (historyItem) {
          performSearch(historyItem.text);
        }
      });
    });
    
    // 绑定点击搜索记录项重新搜索
    document.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.history-actions')) {
          const id = parseInt(item.getAttribute('data-id'));
          const historyItem = searchHistory.find(h => h.id === id);
          if (historyItem) {
            performSearch(historyItem.text);
          }
        }
      });
    });
  }
}

// 删除搜索记录
function deleteHistoryItem(id) {
  searchHistory = searchHistory.filter(item => item.id !== id);
  // 重新编号
  searchHistory = searchHistory.map((item, index) => ({
    ...item,
    id: searchHistory.length - index
  }));
  renderHistory();
}

// 添加搜索记录
function addSearchHistory(text) {
  if (!text.trim()) return;
  
  // 检查是否已存在
  const existingIndex = searchHistory.findIndex(item => item.text.toLowerCase() === text.toLowerCase());
  if (existingIndex !== -1) {
    // 如果存在，移到最前面
    const item = searchHistory.splice(existingIndex, 1)[0];
    searchHistory.unshift(item);
  } else {
    // 如果不存在，添加到最前面
    const newId = searchHistory.length > 0 ? Math.max(...searchHistory.map(h => h.id)) + 1 : 1;
    searchHistory.unshift({ id: newId, text: text.trim() });
  }
  
  // 限制最多显示10条
  if (searchHistory.length > 10) {
    searchHistory = searchHistory.slice(0, 10);
  }
  
  renderHistory();
}

// 执行搜索
function performSearch(query) {
  if (!query.trim()) {
    isShowingResults = false;
    renderHistory();
    return;
  }
  
  // TODO: 这里后续接入实际的搜索API
  // 模拟搜索结果 - 根据查询内容返回相关结果
  const queryLower = query.toLowerCase();
  searchResults = [];
  
  // 模拟根据关键词返回结果
  if (queryLower.includes('deep') || queryLower.includes('learning')) {
    searchResults.push({
      id: 1,
      title: 'Deep Learning Applications in Computer Vision',
      summary: 'A comprehensive review of deep learning techniques applied to computer vision tasks.',
      type: 'pdf',
      icon: '../../img/file.png'
    });
  }
  
  if (queryLower.includes('multimodal') || queryLower.includes('haptic') || queryLower.includes('affective')) {
    searchResults.push({
      id: 2,
      title: 'Affective Communication via Haptic Technology: A Usability Study',
      summary: 'This paper presents a usability study of a huggable device with older adults, exploring affective communication through haptic technology.',
      type: 'pdf',
      icon: '../../img/file.png'
    });
  }
  
  if (queryLower.includes('multimodal') || queryLower.includes('framework')) {
    searchResults.push({
      id: 3,
      title: 'Multimodal Learning Framework',
      summary: 'An innovative framework for combining visual and textual information in machine learning models.',
      type: 'image',
      icon: '../../img/picture.png'
    });
  }
  
  // 如果没有匹配的结果，返回默认结果
  if (searchResults.length === 0) {
    searchResults = [
      {
        id: 1,
        title: `搜索结果: ${query}`,
        summary: '暂无相关结果，请尝试其他关键词。',
        type: 'pdf',
        icon: '../../img/file.png'
      }
    ];
  }
  
  isShowingResults = true;
  renderHistory();
  addSearchHistory(query);
  
  // 清空搜索框
  leftSearchInput.value = '';
  mainSearchInput.value = '';
}

// 初始化搜索框事件（在DOMContentLoaded中调用）
function setupSearchInputs() {
  // 左侧搜索框
  const leftSearchInput = document.getElementById('searchInput');
  if (leftSearchInput) {
    leftSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performSearch(leftSearchInput.value);
      }
    });
  } else {
    console.warn('找不到左侧搜索框元素');
  }
  
  // 主内容区域搜索框（如果存在）
  const mainSearchInput = document.getElementById('mainSearchInput');
  if (mainSearchInput) {
    mainSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performSearch(mainSearchInput.value);
      }
    });
  }
  // 主内容区域搜索框已移除，不再需要绑定
}

// 统计数据接口（占位）
async function fetchStatistics() {
  // 当没有打开文件夹或初始化时，默认所有统计为 0
  return {
    totalItems: 0,
    totalItemsChange: 0,
    categoryCount: 0,
    notesCount: 0,
    imagesCount: 0
  };
}

// 更新统计数据
async function updateStatistics() {
  try {
    const stats = await fetchStatistics();
    
    document.getElementById('statTotalValue').textContent = stats.totalItems;
    document.getElementById('statTotalChange').textContent = `+${stats.totalItemsChange} 本月新增`;
    
    document.getElementById('statCategoryValue').textContent = stats.categoryCount;
    
    document.getElementById('statNotesValue').textContent = stats.notesCount;
    
    document.getElementById('statImagesValue').textContent = stats.imagesCount;
  } catch (error) {
    console.error('获取统计数据失败:', error);
  }
}

// 最近添加的知识条目数据接口（占位）
async function fetchRecentItems() {
  // TODO: 后续接入实际的数据
  return [
    {
      id: 1,
      title: 'Affective Communication via Haptic Technology: A Usability Study of a Huggable Device with Older Adults',
      authors: '2E Nunez, Z Radosz-Knawa, A Kołbasa, P Zguda, A Kamińska, T Kukier, M Hirokawa, K Suzuki, B Indurkhya',
      conference: 'Social Robotics+ AI: 17th International Conference, ICSR+ AI 2025, Naples, Italy, September 10-12, 2025, Proceedings, Part 1',
      summary: 'This paper presents a comprehensive usability study exploring how older adults interact with haptic communication devices...',
      date: '3 天前',
      type: 'pdf',
      icon: '../../img/file.png'
    },
    {
      id: 2,
      title: 'Deep Learning for Multimodal Data Analysis',
      authors: 'John Smith, Jane Doe',
      conference: 'International Conference on Machine Learning 2025',
      summary: 'An in-depth analysis of deep learning techniques applied to multimodal datasets, combining visual and textual information...',
      date: '3 天前',
      type: 'image',
      icon: '../../img/picture.png'
    },
    {
      id: 3,
      title: 'Neural Architecture Search for Efficient Edge Computing',
      authors: 'C Zhang, Y Wang, H Li, X Chen',
      conference: 'IEEE Transactions on Neural Networks and Learning Systems, 2025',
      summary: 'We present a novel neural architecture search (NAS) method specifically designed for edge computing environments with limited computational resources.',
      date: '3 天前',
      type: 'pdf',
      icon: '../../img/file.png'
    },
    {
      id: 4,
      title: '机器学习模型训练笔记',
      authors: '用户笔记',
      conference: '',
      summary: '记录了深度学习模型训练过程中的关键参数调整、损失函数变化以及模型性能优化方法。包括学习率调度策略、正则化技术应用等实践经验。',
      date: '5 天前',
      type: 'note',
      icon: '../../img/chat-bot.png'
    },
    {
      id: 5,
      title: 'Computer Vision Architecture Diagram',
      authors: 'Research Visualization',
      conference: '',
      summary: 'A comprehensive diagram showing the architecture of modern computer vision systems, including CNN layers, attention mechanisms, and feature extraction pipelines.',
      date: '5 天前',
      type: 'image',
      icon: '../../img/picture.png'
    },
    {
      id: 6,
      title: 'Federated Learning for Privacy-Preserving Healthcare Analytics',
      authors: 'R Kumar, S Patel, A Singh, M Gupta',
      conference: 'Nature Machine Intelligence, 2025',
      summary: 'This work addresses privacy concerns in healthcare data analytics through federated learning approaches that enable collaborative model training without sharing sensitive patient data.',
      date: '7 天前',
      type: 'pdf',
      icon: '../../img/file.png'
    },
    {
      id: 7,
      title: '实验数据可视化图表',
      authors: '实验记录',
      conference: '',
      summary: '包含多个实验结果的对比图表，展示了不同算法在不同数据集上的性能表现，包括准确率、召回率和F1分数的详细对比。',
      date: '7 天前',
      type: 'image',
      icon: '../../img/picture.png'
    },
    {
      id: 8,
      title: '论文阅读笔记：Transformer架构详解',
      authors: '用户笔记',
      conference: '',
      summary: '详细记录了Transformer架构的核心组件，包括自注意力机制、位置编码、多头注意力等关键概念的深入理解。同时整理了相关论文的引用和扩展阅读。',
      date: '10 天前',
      type: 'note',
      icon: '../../img/chat-bot.png'
    },
    {
      id: 9,
      title: 'Quantum Machine Learning: Algorithms and Applications',
      authors: 'L Anderson, P Martinez, K Thompson, D White',
      conference: 'Quantum Information Processing, 2025',
      summary: 'We survey recent advances in quantum machine learning, focusing on practical algorithms and real-world applications including quantum neural networks and variational quantum algorithms.',
      date: '12 天前',
      type: 'pdf',
      icon: '../../img/file.png'
    },
    {
      id: 10,
      title: '模型架构设计草图',
      authors: '设计文档',
      conference: '',
      summary: '手绘的神经网络架构设计图，展示了从输入层到输出层的完整数据流，包括各层的参数设置和连接方式。',
      date: '15 天前',
      type: 'image',
      icon: '../../img/picture.png'
    }
  ];
}

// 渲染最近添加的知识条目
async function renderRecentItems() {
  try {
    console.log('开始渲染最近添加的知识条目...');
    const items = await fetchRecentItems();
    console.log('获取到的数据，数量:', items ? items.length : 0, items);
    
    // 多次尝试查找元素
    let recentList = document.getElementById('recentItemsList');
    let attempts = 0;
    const maxAttempts = 5;
    
    while (!recentList && attempts < maxAttempts) {
      console.log(`尝试查找 recentItemsList 元素，第 ${attempts + 1} 次`);
      await new Promise(resolve => setTimeout(resolve, 200));
      recentList = document.getElementById('recentItemsList');
      attempts++;
    }
    
    if (!recentList) {
      console.error('找不到 recentItemsList 元素，已尝试', maxAttempts, '次');
      // 尝试通过类名查找
      const bottomSection = document.querySelector('.bottom-section');
      if (bottomSection) {
        console.log('找到 bottom-section，检查内部结构');
        console.log('bottom-section 子元素:', bottomSection.children);
      }
      return;
    }
    
    console.log('找到 recentItemsList 元素，开始渲染');
    renderItemsToElement(items, recentList);
  } catch (error) {
    console.error('获取最近添加条目失败:', error);
    console.error('错误堆栈:', error.stack);
  }
}

// 渲染数据到元素
function renderItemsToElement(items, recentList) {
  if (!items || items.length === 0) {
    recentList.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">暂无最近添加的知识条目</div>';
    return;
  }
  
  console.log('渲染最近添加的知识条目，数量:', items.length);
    
  recentList.innerHTML = items.map(item => {
    // 根据类型选择正确的图标
    let iconPath = item.icon;
    if (item.type === 'pdf') {
      iconPath = '../../img/file.png';
    } else if (item.type === 'image') {
      iconPath = '../../img/picture.png';
    } else if (item.type === 'note') {
      iconPath = '../../img/chat-bot.png';
    }
    
    // 格式化作者和会议信息
    const metaText = item.conference 
      ? `${item.authors} ${item.conference}`
      : item.authors;
    
    return `
      <div class="recent-item" data-id="${item.id}">
        <img src="${iconPath}" alt="${item.type}" class="recent-item-icon" />
        <div class="recent-item-content">
          <div class="recent-item-title">${item.title}</div>
          <div class="recent-item-meta">${metaText}</div>
          <div class="recent-item-summary">${item.summary}</div>
          <div class="recent-item-footer">
            <span class="recent-item-date">${item.date}</span>
            <div class="recent-item-expand">
              <img src="../../img/down.png" alt="Expand" />
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  console.log('HTML已插入，元素数量:', recentList.children.length);
  
  // 绑定展开事件
  document.querySelectorAll('.recent-item-expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.recent-item');
      item.classList.toggle('expanded');
    });
  });
}

// 分类数据
let categories = [];

// 获取分类数据（从工作区统计数据获取）
async function fetchCategories() {
  try {
    // 根据需求：页面初始时应该是空的，只有已在 main 打开文件夹的才有效
    if (!sessionStorage.getItem('folderState')) {
      return [];
    }

    const result = await window.electronAPI.workspace.getStats();
    if (!result.success) {
      console.warn('获取工作区统计失败:', result.error);
      return [];
    }

    const stats = result.stats;
    
    // 将文件夹转换为分类格式
    return stats.folders.map((folder, index) => ({
      id: index + 1,
      name: folder.name,
      count: folder.fileCount || 0,
      color: null, // 可以后续根据需要添加颜色逻辑
      description: folder.description || '',
      detailFile: folder.detailFile
    }));
  } catch (error) {
    console.error('获取分类数据失败:', error);
    return [];
  }
}

// 渲染分类卡片
async function renderCategories() {
  try {
    console.log('开始渲染分类...');
    const categoryData = await fetchCategories();
    categories = categoryData; // 保存分类数据供后续使用
    const categoryGrid = document.getElementById('categoryGrid');
    
    if (!categoryGrid) {
      console.error('找不到 categoryGrid 元素');
      return;
    }
    
    console.log('获取到的分类数据，数量:', categoryData.length);
    
    categoryGrid.innerHTML = categoryData.map(category => {
      const hasColorLine = category.color !== null;
      const colorStyle = category.color ? `style="--category-color: ${category.color}"` : '';
      
      return `
        <div class="category-card ${hasColorLine ? 'has-color-line' : ''}" data-id="${category.id}" ${colorStyle}>
          <div class="category-card-header">
            <div style="flex: 1;">
              <div class="category-count">${category.count}个知识条目</div>
              <div class="category-title">${category.name}</div>
            </div>
            
          </div>
          <div class="category-actions">
            <button class="category-btn primary" data-action="view" data-id="${category.id}">查看</button>
          </div>
        </div>
      `;
    }).join('');
    
    console.log('分类卡片已渲染，数量:', categoryGrid.children.length);
    
    // 绑定按钮事件
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const categoryId = btn.getAttribute('data-id');
        handleCategoryAction(action, categoryId);
      });
    });
    
    // 绑定菜单按钮事件
    document.querySelectorAll('.category-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.category-card');
        const categoryId = card.getAttribute('data-id');
        // TODO: 显示分类菜单（删除、重命名等）
        console.log('打开分类菜单，ID:', categoryId);
      });
    });
  } catch (error) {
    console.error('渲染分类失败:', error);
  }
}

// 当前选中的分类
let currentCategory = null;

// 处理分类操作
function handleCategoryAction(action, categoryId) {
  if (action === 'view') {
    // 获取分类信息
    const category = categories.find(c => c.id === parseInt(categoryId));
    if (category) {
      currentCategory = category;
      // 切换到知识条目tab
      const itemsTab = document.querySelector('.tab-btn[data-tab="items"]');
      if (itemsTab) {
        itemsTab.click();
        console.log('切换到知识条目页面，分类:', category.name);
        // 显示该分类的知识条目
        setTimeout(() => {
          renderCategorySummary(category);
          renderKnowledgeItems(category.id);
        }, 100);
      }
    }
  } else if (action === 'edit') {
    // TODO: 实现编辑分类功能
    console.log('编辑分类，ID:', categoryId);
    alert(`编辑分类功能开发中...\n分类ID: ${categoryId}`);
  }
}

// 获取知识条目数据（根据分类ID）
async function fetchKnowledgeItems(categoryId) {
  try {
    // 根据分类ID找到分类名称
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
      console.warn('找不到分类:', categoryId);
      return [];
    }

    // 获取分类详情 (优先使用 detailFile 避免同名文件夹冲突)
    const result = await window.electronAPI.workspace.getCategoryDetail(category.detailFile || category.name);
    if (!result.success) {
      console.warn('获取分类详情失败:', result.error);
      return [];
    }

    const folderPath = result.folderPath || '';

    // 过滤掉隐藏文件和系统文件
    const validFiles = (result.files || []).filter(file => {
      const name = file.name || '';
      return !name.startsWith('.');
    });

    // 将文件数据转换为知识条目格式
    return validFiles.map((file, index) => {
      // 根据文件扩展名确定类型和图标
      let type = 'file';
      let icon = '../../img/file.png';
      const ext = file.format?.toLowerCase() || '';

      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
        type = 'image';
        icon = '../../img/picture.png';
      } else if (ext === 'pdf') {
        type = 'pdf';
        icon = '../../img/file.png';
      } else if (['md', 'txt'].includes(ext)) {
        type = 'note';
        icon = '../../img/chat-bot.png';
      }

      // 格式化日期
      const addedTime = new Date(file.addedTime);
      const now = new Date();
      const diffTime = Math.abs(now - addedTime);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const dateText = diffDays === 1 ? '1 天前' : `${diffDays} 天前`;

      // 拼接完整文件路径
      const fullPath = folderPath ? `${folderPath}/${file.name}` : file.path;

      return {
        id: index + 1,
        categoryId: categoryId,
        title: file.name,
        authors: '未知作者', // 文件没有作者信息
        conference: '', // 文件没有会议信息
        date: dateText,
        type: type,
        icon: icon,
        tags: [ext.toUpperCase() || 'FILE'], // 使用文件扩展名作为标签
        summary: `文件大小: ${formatFileSize(file.size)} | 添加时间: ${addedTime.toLocaleDateString()}`,
        filePath: fullPath,
        addedTime: file.addedTime,
        size: file.size
      };
    });
  } catch (error) {
    console.error('获取知识条目失败:', error);
    return [];
  }
}

// 更新概览页面统计信息
async function updateOverviewStats() {
  try {
    if (!sessionStorage.getItem('folderState')) {
      document.getElementById('statTotalValue').textContent = 0;
      document.getElementById('statCategoryValue').textContent = 0;
      document.getElementById('statNotesValue').textContent = 0;
      document.getElementById('statImagesValue').textContent = 0;
      updateRecentItems([]);
      return;
    }

    const result = await window.electronAPI.workspace.getStats();
    if (!result.success) {
      console.warn('获取工作区统计失败:', result.error);
      // 如果没有打开工作区，则重置为 0 并显示空状态
      document.getElementById('statTotalValue').textContent = 0;
      document.getElementById('statCategoryValue').textContent = 0;
      document.getElementById('statNotesValue').textContent = 0;
      document.getElementById('statImagesValue').textContent = 0;
      updateRecentItems([]);
      return;
    }

    const stats = result.stats;
    
    // 更新统计卡片
    document.getElementById('statTotalValue').textContent = stats.totalFiles || 0;
    document.getElementById('statCategoryValue').textContent = stats.folderCount || 0;
    document.getElementById('statNotesValue').textContent = stats.mdFileCount || 0;
    document.getElementById('statImagesValue').textContent = stats.imageCount || 0;
    
    // 更新本月新增数据
    const monthlyNewFiles = stats.monthlyNewFiles || 0;
    const monthlyNewNotes = stats.monthlyNewNotes || 0;
    document.getElementById('statTotalChange').textContent = `+${monthlyNewFiles} 本月新增`;
    document.getElementById('statTotalChange').className = monthlyNewFiles > 0 ? 'stat-change positive' : 'stat-change';
    document.getElementById('statNotesChange').textContent = `+${monthlyNewNotes} 本月新增`;
    document.getElementById('statNotesChange').className = monthlyNewNotes > 0 ? 'stat-change positive' : 'stat-change';
    
    // 更新最近添加的项目（使用最近一个月的文件）
    const recentMonthFiles = stats.recentMonthFiles || stats.recentFiles || [];
    updateRecentItems(recentMonthFiles);
    
    console.log('概览统计已更新:', stats);
  } catch (error) {
    console.error('更新概览统计失败:', error);
  }
}

// 更新最近添加的项目列表
function updateRecentItems(recentFiles) {
  const recentItemsList = document.getElementById('recentItemsList');
  if (!recentItemsList) return;
  
  if (!recentFiles || recentFiles.length === 0) {
    recentItemsList.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">暂无最近添加的项目</div>';
    return;
  }
  
  recentItemsList.innerHTML = recentFiles.map(file => {
    // 根据文件扩展名确定图标
    let icon = '../../img/file.png';
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    let type = 'file';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      icon = '../../img/picture.png';
      type = 'image';
    } else if (ext === 'pdf') {
      icon = '../../img/file.png';
      type = 'pdf';
    } else if (['md', 'txt'].includes(ext)) {
      icon = '../../img/chat-bot.png';
      type = 'note';
    }
    
    // 格式化添加时间
    const addedTime = new Date(file.addedTime);
    const timeText = addedTime.toLocaleDateString();
    
    return `
      <div class="recent-item" data-filepath="${file.path.replace(/\\/g, '\\\\')}" data-filename="${file.name}" data-type="${type}" style="cursor: pointer;">
        <img src="${icon}" alt="${ext}" class="recent-item-icon" />
        <div class="recent-item-content">
          <div class="recent-item-title">${file.name}</div>
          <div class="recent-item-meta">${file.folder} • ${timeText}</div>
        </div>
      </div>
    `;
  }).join('');

  // 绑定点击事件
  document.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => {
      const filePath = item.getAttribute('data-filepath');
      const fileName = item.getAttribute('data-filename');
      const fileType = item.getAttribute('data-type');
      
      if (filePath) {
        // 保存跳转参数到 sessionStorage
        sessionStorage.setItem('pendingFile', JSON.stringify({
          action: 'view',
          filePath: filePath,
          fileName: fileName,
          fileType: fileType
        }));
        // 跳转到主页面 (文献储存情况)
        window.location.href = '../main/main.html';
      }
    });
  });
}

// 渲染分类摘要
async function renderCategorySummary(category) {
  try {
    // 更新分类名称和条目数量
    document.getElementById('categoryItemCount').textContent = `${category.count}个知识条目`;
    document.getElementById('categoryName').textContent = category.name;
    document.getElementById('knowledgeItemsTitle').textContent = `知识条目分类管理: ${category.name}`;
    
    // 获取当前分类的详细文件列表
    const detailResult = await window.electronAPI.workspace.getCategoryDetail(category.detailFile || category.name);
    if (detailResult.success && detailResult.files) {
      const files = detailResult.files;
      
      // 统计文档数量（md, txt, pdf）
      const docCount = files.filter(f => {
        const ext = (f.format || '').toLowerCase();
        return ['md', 'txt', 'pdf'].includes(ext);
      }).length;
      
      // 统计图片数量（jpg, jpeg, png, gif, webp, bmp）
      const imageCount = files.filter(f => {
        const ext = (f.format || '').toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
      }).length;
      
      // 显示该分类的统计信息
      document.getElementById('categoryDocCount').textContent = docCount;
      document.getElementById('categoryImageCount').textContent = imageCount;
      
      console.log(`分类 "${category.name}" 统计: 文档 ${docCount}, 图片 ${imageCount}`);
    } else {
      // 如果获取失败，使用默认值
      document.getElementById('categoryDocCount').textContent = '0';
      document.getElementById('categoryImageCount').textContent = '0';
    }
  } catch (error) {
    console.error('渲染分类摘要失败:', error);
    document.getElementById('categoryDocCount').textContent = '0';
    document.getElementById('categoryImageCount').textContent = '0';
  }
}

// 渲染知识条目列表
async function renderKnowledgeItems(categoryId) {
  try {
    console.log('开始渲染知识条目，分类ID:', categoryId);
    const items = await fetchKnowledgeItems(categoryId);
    const itemsList = document.getElementById('knowledgeItemsList');
    
    if (!itemsList) {
      console.error('找不到 knowledgeItemsList 元素');
      return;
    }
    
    if (!items || items.length === 0) {
      itemsList.innerHTML = '<div style="color: #888; text-align: center; padding: 40px;">该分类下暂无知识条目</div>';
      return;
    }
    
    console.log('获取到的知识条目，数量:', items.length);
    
    itemsList.innerHTML = items.map(item => {
      // 根据类型选择图标
      let iconPath = item.icon;
      if (item.type === 'pdf') {
        iconPath = '../../img/file.png';
      } else if (item.type === 'image') {
        iconPath = '../../img/picture.png';
      } else if (item.type === 'note') {
        iconPath = '../../img/chat-bot.png';
      }
      
      // 格式化作者和会议信息
      const metaText = item.conference 
        ? `${item.authors} ${item.conference} - ${item.date}`
        : `${item.authors} - ${item.date}`;
      
      // 渲染标签
      const tagsHtml = item.tags ? item.tags.map(tag => 
        `<span class="knowledge-item-tag">${tag}</span>`
      ).join('') : '';
      
      return `
        <div class="knowledge-item-card" data-id="${item.id}" data-filepath="${item.filePath}" data-filename="${item.title}" data-type="${item.type}">
          <img src="${iconPath}" alt="${item.type}" class="knowledge-item-icon" />
          <div class="knowledge-item-content">
            <div class="knowledge-item-title">${item.title}</div>
            <div class="knowledge-item-meta">${metaText}</div>
            ${tagsHtml ? `<div class="knowledge-item-tags">${tagsHtml}</div>` : ''}
            <div class="knowledge-item-actions">
              <button class="knowledge-item-btn" data-action="view-detail" data-id="${item.id}">查看详情</button>
              <button class="knowledge-item-btn" data-action="ai-explain" data-id="${item.id}">AI解释</button>
            </div>
          </div>
          <div class="knowledge-item-actions-right">
            <div class="knowledge-item-action-icon copy" title="复制文件" data-id="${item.id}">
              <img src="../../img/unfold.png" alt="Copy" />
            </div>
            <div class="knowledge-item-action-icon delete" title="删除" data-id="${item.id}">
              <img src="../../img/delete.png" alt="Delete" />
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    console.log('知识条目已渲染，数量:', itemsList.children.length);
    
    // 绑定卡片点击事件（整体点击跳转）
    document.querySelectorAll('.knowledge-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // 如果点击的是按钮或操作图标，不触发整体跳转
        if (e.target.closest('.knowledge-item-btn') || e.target.closest('.knowledge-item-action-icon')) {
          return;
        }
        
        const itemId = card.getAttribute('data-id');
        const filePath = card.getAttribute('data-filepath');
        const fileName = card.getAttribute('data-filename');
        const fileType = card.getAttribute('data-type');
        
        handleKnowledgeItemAction('view-detail', itemId, filePath, fileName, fileType);
      });
    });
    
    // 绑定按钮事件
    document.querySelectorAll('.knowledge-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const itemId = btn.getAttribute('data-id');
        const card = btn.closest('.knowledge-item-card');
        const filePath = card.getAttribute('data-filepath');
        const fileName = card.getAttribute('data-filename');
        const fileType = card.getAttribute('data-type');
        handleKnowledgeItemAction(action, itemId, filePath, fileName, fileType);
      });
    });
    
    // 绑定右侧图标事件
    document.querySelectorAll('.knowledge-item-action-icon').forEach(icon => {
      icon.addEventListener('click', async (e) => {
        e.stopPropagation();
        const itemId = icon.getAttribute('data-id');
        const card = icon.closest('.knowledge-item-card');
        const filePath = card.getAttribute('data-filepath');
        const fileName = card.getAttribute('data-filename');
        
        if (icon.classList.contains('copy')) {
          // 复制文件到剪贴板
          try {
            const result = await window.electronAPI.file.copy(filePath);
            if (result.success) {
              showToast(`已复制文件: ${result.fileName}`);
            } else {
              showToast('复制失败: ' + result.error, 'error');
            }
          } catch (err) {
            showToast('复制失败: ' + err.message, 'error');
          }
        } else if (icon.classList.contains('delete')) {
          // 删除文件
          if (confirm(`确定要删除 "${fileName}" 吗？\n\n此操作无法撤销！`)) {
            try {
              const result = await window.electronAPI.file.delete(filePath);
              if (result.success) {
                showToast(`已删除: ${fileName}`);
                // 移除卡片
                card.remove();
                // 更新统计数量
                if (currentCategory) {
                  currentCategory.count = Math.max(0, (currentCategory.count || 1) - 1);
                  document.getElementById('categoryItemCount').textContent = `${currentCategory.count}个知识条目`;
                }
              } else {
                showToast('删除失败: ' + result.error, 'error');
              }
            } catch (err) {
              showToast('删除失败: ' + err.message, 'error');
            }
          }
        }
      });
    });
  } catch (error) {
    console.error('渲染知识条目失败:', error);
  }
}

// 显示 Toast 通知
function showToast(message, type = 'success') {
  // 移除已存在的 toast
  const existingToast = document.querySelector('.manage-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `manage-toast ${type}`;
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

// 处理知识条目操作
function handleKnowledgeItemAction(action, itemId, filePath, fileName, fileType) {
  switch (action) {
    case 'view-detail':
      console.log('查看详情，文件:', filePath);
      // 保存跳转参数到 sessionStorage
      sessionStorage.setItem('pendingFile', JSON.stringify({
        action: 'view',
        filePath: filePath,
        fileName: fileName,
        fileType: fileType
      }));
      // 跳转到主页面
      window.location.href = '../main/main.html';
      break;
    case 'ai-explain':
      console.log('AI解释，文件:', filePath);
      // 保存跳转参数到 sessionStorage，包含AI分析指令
      sessionStorage.setItem('pendingFile', JSON.stringify({
        action: 'ai-analyze',
        filePath: filePath,
        fileName: fileName,
        fileType: fileType,
        aiPrompt: '帮我分析这个文件的内容'
      }));
      // 跳转到主页面
      window.location.href = '../main/main.html';
      break;
  }
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('页面加载完成，开始初始化...');
  initSearchHistory();
  updateStatistics();
  loadUserAvatar();
  setupNavigation();
  setupSearchInputs();
  
  // 延迟渲染最近添加，确保DOM完全加载
  setTimeout(() => {
    updateOverviewStats(); // 更新概览统计信息
    renderCategories();
  }, 100);
});

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
  console.log('设置导航...');
  
  // User avatar click (can be used for user profile later)
  const userAvatar = document.getElementById('userAvatar');
  if (userAvatar) {
    userAvatar.onclick = (e) => {
      e.stopPropagation();
      // TODO: 打开用户信息页面或菜单
      console.log('打开用户信息');
    };
  } else {
    console.warn('找不到 userAvatar 元素');
  }
  
  // User avatar - 跳转到首页
  const navUser = document.getElementById('navUser');
  if (navUser) {
    navUser.onclick = (e) => {
      e.stopPropagation();
      window.location.href = '../index.html';
    };
  }
  
  // Navigation icons - 使用onclick直接绑定，避免重复绑定问题
  // 主界面（AI智能解释）
  const navMain = document.getElementById('navMain');
  if (navMain) {
    console.log('找到 navMain，绑定点击事件');
    navMain.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('点击主界面，准备跳转');
      window.location.href = '../main/main.html';
    };
  } else {
    console.warn('找不到 navMain 元素');
  }
  
  // 文献推荐页面
  const navRecommend = document.getElementById('navRecommend');
  if (navRecommend) {
    console.log('找到 navRecommend，绑定点击事件');
    navRecommend.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('点击文献推荐，准备跳转');
      window.location.href = '../recommend/recommend.html';
    };
  } else {
    console.warn('找不到 navRecommend 元素');
  }
  
  // 知识管理页面（当前页面，不需要跳转）
  const navManage = document.getElementById('navManage');
  if (navManage) {
    console.log('找到 navManage');
    navManage.onclick = (e) => {
      e.stopPropagation();
      // Already on manage page, do nothing
      console.log('已在知识管理页面');
    };
  } else {
    console.warn('找不到 navManage 元素');
  }
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

