// Tab切换功能
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

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
  // TODO: 后续接入实际的计算逻辑
  return {
    totalItems: 68,
    totalItemsChange: 12,
    categoryCount: 4,
    notesCount: 45,
    imagesCount: 23
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

// 获取分类数据（占位）
async function fetchCategories() {
  // TODO: 后续接入实际的数据接口
  return [
    {
      id: 1,
      name: '机器学习',
      count: 15,
      color: null // 没有颜色线
    },
    {
      id: 2,
      name: '深度学习',
      count: 23,
      color: '#4ade80' // 绿色
    },
    {
      id: 3,
      name: '深度学习',
      count: 23,
      color: null
    },
    {
      id: 4,
      name: '可视化',
      count: 23,
      color: '#fbbf24' // 黄色
    },
    {
      id: 5,
      name: '自然语言处理',
      count: 18,
      color: null
    },
    {
      id: 6,
      name: '计算机视觉',
      count: 12,
      color: '#4ade80' // 绿色
    }
  ];
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
            <button class="category-menu-btn" title="更多选项">⋯</button>
          </div>
          <div class="category-actions">
            <button class="category-btn" data-action="edit" data-id="${category.id}">编辑</button>
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
  // TODO: 后续接入实际的数据接口
  // 模拟数据，根据分类ID返回不同的知识条目
  const allItems = [
    {
      id: 1,
      categoryId: 1,
      title: 'Affective Communication via Haptic Technology: A Usability Study of a Huggable Device with Older Adults',
      authors: '2E Nunez, Z Radosz-Knawa, A Kołbasa, P Zguda, A Kamińska, T Kukier, M Hirokawa, K Suzuki, B Indurkhya',
      conference: 'Social Robotics+ AI: 17th International Conference, ICSR+ AI 2025, Naples, Italy, September 10-12, 2025, Proceedings, Part 1',
      date: '3 天前',
      type: 'pdf',
      icon: '../../img/file.png',
      tags: ['NLP', 'Transformer'],
      summary: 'This paper presents a comprehensive usability study exploring how older adults interact with haptic communication devices.'
    },
    {
      id: 2,
      categoryId: 1,
      title: 'Deep Learning for Multimodal Data Analysis',
      authors: 'John Smith, Jane Doe',
      conference: 'International Conference on Machine Learning 2025',
      date: '5 天前',
      type: 'image',
      icon: '../../img/picture.png',
      tags: ['Deep Learning', 'Multimodal'],
      summary: 'An in-depth analysis of deep learning techniques applied to multimodal datasets.'
    },
    {
      id: 3,
      categoryId: 1,
      title: 'Neural Architecture Search for Efficient Edge Computing',
      authors: 'C Zhang, Y Wang, H Li, X Chen',
      conference: 'IEEE Transactions on Neural Networks and Learning Systems, 2025',
      date: '7 天前',
      type: 'pdf',
      icon: '../../img/file.png',
      tags: ['NAS', 'Edge Computing'],
      summary: 'We present a novel neural architecture search method for edge computing environments.'
    },
    {
      id: 4,
      categoryId: 1,
      title: '机器学习模型训练笔记',
      authors: '用户笔记',
      conference: '',
      date: '10 天前',
      type: 'note',
      icon: '../../img/chat-bot.png',
      tags: ['训练', '优化'],
      summary: '记录了深度学习模型训练过程中的关键参数调整和优化方法。'
    },
    {
      id: 5,
      categoryId: 2,
      title: 'Advanced Deep Learning Architectures',
      authors: 'Alice Johnson, Bob Williams',
      conference: 'NeurIPS 2025',
      date: '2 天前',
      type: 'pdf',
      icon: '../../img/file.png',
      tags: ['Deep Learning', 'Architecture'],
      summary: 'Exploring advanced deep learning architectures for various applications.'
    }
  ];
  
  // 根据分类ID过滤
  return allItems.filter(item => item.categoryId === categoryId);
}

// 渲染分类摘要
function renderCategorySummary(category) {
  // 更新分类名称和条目数量
  document.getElementById('categoryItemCount').textContent = `${category.count}个知识条目`;
  document.getElementById('categoryName').textContent = category.name;
  document.getElementById('knowledgeItemsTitle').textContent = `知识条目分类管理: ${category.name}`;
  
  // 计算文档和图片数量（模拟数据，后续接入实际计算）
  const docCount = Math.floor(category.count * 0.65); // 假设65%是文档
  const imageCount = category.count - docCount;
  
  document.getElementById('categoryDocCount').textContent = docCount;
  document.getElementById('categoryImageCount').textContent = imageCount;
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
        <div class="knowledge-item-card" data-id="${item.id}">
          <img src="${iconPath}" alt="${item.type}" class="knowledge-item-icon" />
          <div class="knowledge-item-content">
            <div class="knowledge-item-title">${item.title}</div>
            <div class="knowledge-item-meta">${metaText}</div>
            ${tagsHtml ? `<div class="knowledge-item-tags">${tagsHtml}</div>` : ''}
            <div class="knowledge-item-actions">
              <button class="knowledge-item-btn" data-action="view-detail" data-id="${item.id}">查看详细</button>
              <button class="knowledge-item-btn" data-action="view-image" data-id="${item.id}">查看图片</button>
              <button class="knowledge-item-btn" data-action="ai-explain" data-id="${item.id}">AI解释</button>
            </div>
          </div>
          <div class="knowledge-item-actions-right">
            <div class="knowledge-item-action-icon refresh" title="刷新" data-id="${item.id}">
              <img src="../../img/update.png" alt="Refresh" />
            </div>
            <div class="knowledge-item-action-icon delete" title="删除" data-id="${item.id}">
              <img src="../../img/delete.png" alt="Delete" />
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    console.log('知识条目已渲染，数量:', itemsList.children.length);
    
    // 绑定按钮事件
    document.querySelectorAll('.knowledge-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const itemId = btn.getAttribute('data-id');
        handleKnowledgeItemAction(action, itemId);
      });
    });
    
    // 绑定右侧图标事件
    document.querySelectorAll('.knowledge-item-action-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = icon.getAttribute('data-id');
        if (icon.classList.contains('refresh')) {
          console.log('刷新知识条目，ID:', itemId);
          // TODO: 实现刷新功能
        } else if (icon.classList.contains('delete')) {
          console.log('删除知识条目，ID:', itemId);
          // TODO: 实现删除功能
          if (confirm('确定要删除这个知识条目吗？')) {
            // TODO: 调用删除API
          }
        }
      });
    });
  } catch (error) {
    console.error('渲染知识条目失败:', error);
  }
}

// 处理知识条目操作
function handleKnowledgeItemAction(action, itemId) {
  switch (action) {
    case 'view-detail':
      console.log('查看详细，条目ID:', itemId);
      // TODO: 实现查看详细功能
      alert(`查看详细功能开发中...\n条目ID: ${itemId}`);
      break;
    case 'view-image':
      console.log('查看图片，条目ID:', itemId);
      // TODO: 实现查看图片功能
      alert(`查看图片功能开发中...\n条目ID: ${itemId}`);
      break;
    case 'ai-explain':
      console.log('AI解释，条目ID:', itemId);
      // TODO: 实现AI解释功能
      alert(`AI解释功能开发中...\n条目ID: ${itemId}`);
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
    renderRecentItems();
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

