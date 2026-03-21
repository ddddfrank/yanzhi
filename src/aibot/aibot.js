/**
 * 研知AI助手
 * 智能帮助用户解答应用使用问题
 */

class YanzhiAIBot {
    constructor() {
        this.isOpen = false;
        this.isTyping = false;
        this.conversationHistory = [];
        this.currentQuestion = '';

        // 拖拽相关状态
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.triggerStartX = 0;
        this.triggerStartY = 0;
        this.hasMoved = false;

        // 基于用户使用文档的知识库
        this.knowledgeBase = this.buildKnowledgeBase();

        // 初始化UI元素
        this.initElements();
        // 绑定事件
        this.bindEvents();
        // 尝试连接Electron API
        this.initElectronAPI();
    }

    /**
     * 构建知识库
     */
    buildKnowledgeBase() {
        return {
            // 安装配置相关
            '安装': {
                keywords: ['安装', '配置', '下载', '设置', '启动'],
                response: `**安装和配置研知助手**

1. **下载应用**
   \`\`\`bash
   git clone https://github.com/ddddfrank/yanzhi.git
   cd yanzhi
   \`\`\`

2. **安装依赖**
   \`\`\`bash
   npm install
   \`\`\`

3. **启动应用**
   \`\`\`bash
   npm start
   \`\`\`

4. **配置API密钥**
   - 在 \`data/\` 文件夹找到 \`.env.example\`
   - 复制并重命名为 \`token.env\`
   - 填写API密钥：\`SILICONFLOW_API_KEY=sk-你的密钥\`
   - 重启应用

5. **配置浏览器**
   - 右键Edge快捷方式 → 属性
   - 目标末尾添加 \`--remote-debugging-port=9222\`

需要更多帮助吗？`
            },

            // API配置相关
            'API': {
                keywords: ['api', '密钥', 'token', 'siliconflow', '配置密钥'],
                response: `**如何配置API密钥**

**获取API密钥：**
1. 访问 [SiliconFlow官网](https://cloud.siliconflow.cn/)
2. 注册账户并登录
3. 进入「API密钥」管理页面
4. 创建新的API密钥

**配置应用：**
1. 在项目根目录的 \`data/\` 文件夹
2. 复制 \`.env.example\` 文件并重命名为 \`token.env\`
3. 使用文本编辑器打开 \`token.env\`
4. 填写您的API密钥：
   \`\`\`
   SILICONFLOW_API_KEY=sk-你的密钥
   \`\`\`
5. 保存文件并重启应用

**验证配置：**
配置完成后，应用会自动加载并测试API连接。如果功能无法正常使用，请检查：
- token.env文件是否存在
- API密钥是否复制正确
- 网络连接是否正常`
            },

            // 快捷键相关
            '快捷键': {
                keywords: ['快捷键', '截图', 'ctrl', 'ctrl+b', 'ctrl+shift+a'],
                response: `**快捷键说明**

**全局快捷键：**
| 快捷键 | 功能 |
|--------|------|
| \`Ctrl+Shift+A\` | 启动截图功能 |
| \`Ctrl+B\` | 捕获选中文字 |
| \`Ctrl+Shift+P\` | 网页转PDF |

**应用内快捷键：**
| 快捷键 | 功能 |
|--------|------|
| \`Ctrl+N\` | 新建文件/文件夹 |
| \`Ctrl+F\` | 搜索文件 |
| \`Ctrl+S\` | 保存当前文件 |
| \`Ctrl+W\` | 关闭当前标签页 |
| \`Ctrl+Tab\` | 切换标签页 |
| \`F2\` | 重命名文件 |
| \`Delete\` | 删除选中文件 |

**自定义快捷键：**
进入设置页面 → 找到「快捷键配置」 → 修改默认快捷键 → 保存设置

需要自定义特定快捷键吗？`
            },

            // 截图功能相关
            '截图': {
                keywords: ['截图', '截图功能', '如何截图', 'ctrl+shift+a', '图片捕获'],
                response: `**截图功能使用指南**

**快捷键：** \`Ctrl+Shift+A\`

**使用步骤：**
1. 按下 \`Ctrl+Shift+A\` 启动截图功能
2. 鼠标变成十字光标，按住左键拖拽选择区域
3. 松开鼠标完成截图
4. 在弹出的编辑窗口中可以：
   - 调整选区
   - 添加标注和文字
   - 识别图片内容（OCR）
   - 选择保存位置

**常见用途：**
- 捕获网页图表和公式
- 保存论文中的图像
- 截取重要数据可视化
- 制作技术文档配图

**问题排查：**
- 快捷键冲突：检查其他应用是否占用
- 权限问题：确保应用有屏幕录制权限
- 检查系统通知权限是否开启

还有什么问题吗？`
            },

            // 文献添加相关
            '添加文献': {
                keywords: ['添加文献', '下载论文', '保存文献', 'arxiv', '导入'],
                response: `**如何添加文献**

**方法一：拖拽上传**
1. 将PDF文件拖拽到主界面
2. 系统自动分析并提示分类选项
3. 选择目标分类或使用AI推荐分类

**方法二：从ArXiv下载**
1. 在搜索框输入关键词
2. 选择感兴趣的论文
3. 点击「下载并保存」
4. AI自动分类到合适文件夹

**方法三：截图捕获**
1. 按 \`Ctrl+Shift+A\` 启动截图
2. 框选需要捕获的区域
3. 选择保存位置和分类

**支持的文件格式：**
- PDF文档
- 文本文件（.txt, .md）
- 图片文件（.jpg, .png, .gif, .webp）

**自动分类：**
系统会根据论文标题、摘要、关键词等内容，智能推荐合适的分类。你可以选择接受AI推荐，或手动选择分类。

需要了解更多关于文献管理的内容吗？`
            },

            // 文献分类相关
            '文献分类': {
                keywords: ['分类', '归类', '如何分类', '智能分类'],
                response: `**文献智能分类**

**AI自动分类：**
系统会根据以下信息智能分析文献内容：
- 论文标题
- 摘要内容
- 关键词
- 作者信息
- 主题领域

**分类流程：**
1. 上传或下载文献后，系统自动分析
2. AI推荐最合适的分类文件夹
3. 你可以选择：
   - 接受AI推荐
   - 手动选择其他分类
   - 创建新分类

**创建新分类：**
1. 右键点击文件夹区域
2. 选择「新建文件夹」
3. 输入文件夹名称（如「深度学习」）
4. 系统自动创建子文件夹：images、博客、文章

**调整分类：**
- 拖拽文件到其他分类
- 右键文件 → 移动到...
- 文件会保留所有标签和元数据

需要帮助创建特定的分类吗？`
            },

            // 知识脉络图相关
            '知识脉络图': {
                keywords: ['脉络图', '知识图', '生成脉络图', '知识体系'],
                response: `**知识脉络图生成**

**自动生成知识脉络图：**
1. 在工作区界面选择一个文件夹
2. 右键选择「生成知识脉络图」
3. 等待AI分析文件内容
4. 生成Markdown格式的知识导图
5. 双击打开查看和编辑

**脉络图特点：**
- 自动分析文件夹内所有文件
- 提取核心内容和关联
- 生成层级化知识结构
- 支持Markdown格式编辑
- 便于导航和检索

**包含内容：**
- 子文件夹内容概览
- 文件标题和摘要
- 内容关联关系
- 知识结构导引

**使用建议：**
- 定期为重要文件夹生成脉络图
- 结合文献管理使用
- 作为研究进度的可视化工具
- 方便快速定位相关文献

有什么具体的知识体系构建问题吗？`
            },

            // 论文推荐相关
            '论文推荐': {
                keywords: ['推荐', '相关论文', 'arxiv搜索', '找论文', '搜论文'],
                response: `**论文推荐功能**

**搜索相关论文：**
1. 在搜索框输入关键词
2. 点击「搜索相关论文」
3. 系统从ArXiv数据库检索
4. 查看推荐结果并下载感兴趣论文

**推荐依据：**
- 关键词匹配
- 当前文档内容分析
- 相关研究领域
- 引用关系

**ArXiv搜索技巧：**
- 使用精确关键词
- 添加限定条件（作者、时间范围）
- 选择排序方式（相关度、时间等）
- 查看论文摘要和引用数

**定时推荐：**
1. 进入「推荐」页面
2. 点击「添加定时任务」
3. 设置关键词、时间、频率
4. 系统自动推送最新相关论文

**支持频率：**
- 每日
- 工作日
- 每周

需要搜索特定领域的论文吗？`
            },

            // 常见问题相关
            '常见问题': {
                keywords: ['问题', '错误', '失败', '无法', '不能', '不工作'],
                response: `**常见问题解决方案**

**安装启动问题：**
- ✅ 检查Node.js版本（需18.x+）
- ✅ 运行 \`npm install\` 确保依赖完整
- ✅ 检查端口9222是否被占用

**API配置问题：**
- ✅ 确认 \`data/token.env\` 文件存在
- ✅ 检查API密钥格式正确
- ✅ 重启应用加载配置

**截图功能问题：**
- ✅ 检查快捷键是否冲突
- ✅ 确认屏幕录制权限
- ✅ 检查系统通知权限

**网页转PDF问题：**
- ✅ 确认Edge浏览器配置正确
- ✅ 检查浏览器是否正常运行
- ✅ 尝试重启浏览器和应用

**AI响应慢：**
- ✅ 检查网络连接稳定性
- ✅ API服务可能繁忙
- ✅ 内容过长可能导致处理时间长

**性能优化：**
- ✅ 定期清理临时文件
- ✅ 减少同时打开的文件数量
- ✅ 关闭不需要的标签页
- ✅ 考虑分多个工作区管理

请描述你遇到的具体问题，我会帮你解决！`
            },

            // 备份相关
            '备份': {
                keywords: ['备份', '导出', '保存数据', '迁移', '恢复'],
                response: `**数据备份与迁移**

**备份数据：**
1. 定期备份工作区文件夹
2. 备份 \`data/workspaces\` 目录
3. 导出重要的笔记和配置

**迁移到新电脑：**
1. 复制整个项目文件夹到新电脑
2. 复制 \`data\` 目录（包含工作区配置）
3. 在新电脑安装Node.js
4. 运行 \`npm install\` 重新安装依赖
5. 配置API密钥
6. 启动应用

**重要提醒：**
- 💡 定期备份是数据安全的保障
- 💡 建议每周备份一次重要数据
- 💡 云存储可作为额外的备份方案
- 💡 记住API密钥需要重新配置

需要具体的备份操作指导吗？`
            }
        };
    }

    /**
     * 初始化DOM元素
     */
    initElements() {
        this.trigger = document.getElementById('aibot-trigger');
        this.window = document.getElementById('aibot-window');
        this.closeBtn = this.window.querySelector('.aibot-close');
        this.messagesContainer = document.getElementById('aibot-messages');
        this.input = document.getElementById('aibot-input');
        this.sendBtn = document.getElementById('aibot-send');
        this.quickButtons = document.querySelectorAll('.aibot-quick-btn');
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 拖拽事件
        this.trigger.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.endDrag());

        // 触摸设备支持
        this.trigger.addEventListener('touchstart', (e) => this.startDrag(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.drag(e), { passive: false });
        document.addEventListener('touchend', () => this.endDrag());

        // 关闭窗口
        this.closeBtn.addEventListener('click', () => this.close());

        // 发送消息
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 输入框自适应高度
        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
            this.sendBtn.disabled = !this.input.value.trim();
        });

        // 快捷问题按钮
        this.quickButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.dataset.question;
                this.input.value = question;
                this.sendMessage();
            });
        });

        // 点击窗口外部关闭
        document.addEventListener('click', (e) => {
            if (this.isOpen &&
                !this.window.contains(e.target) &&
                !this.trigger.contains(e.target)) {
                this.close();
            }
        });
    }

    /**
     * 初始化Electron API
     */
    initElectronAPI() {
        // 检查是否在Electron环境中
        if (window.electronAPI) {
            console.log('AI助手：检测到Electron环境');
        }
    }

    /**
     * 开始拖拽
     */
    startDrag(e) {
        e.preventDefault();

        this.isDragging = true;
        this.hasMoved = false;

        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        this.dragStartX = clientX;
        this.dragStartY = clientY;

        const rect = this.trigger.getBoundingClientRect();
        this.triggerStartX = rect.left;
        this.triggerStartY = rect.top;

        this.trigger.style.cursor = 'grabbing';
        this.trigger.style.transition = 'none';
    }

    /**
     * 拖拽中
     */
    drag(e) {
        if (!this.isDragging) return;

        e.preventDefault();

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - this.dragStartX;
        const deltaY = clientY - this.dragStartY;

        // 判断是否移动了（超过5px算移动）
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            this.hasMoved = true;
        }

        // 计算新位置
        let newX = this.triggerStartX + deltaX;
        let newY = this.triggerStartY + deltaY;

        // 边界限制
        const triggerSize = 60;
        const maxX = window.innerWidth - triggerSize;
        const maxY = window.innerHeight - triggerSize;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        // 更新位置
        this.trigger.style.left = newX + 'px';
        this.trigger.style.top = newY + 'px';
        this.trigger.style.right = 'auto';
        this.trigger.style.bottom = 'auto';

        // 更新窗口位置
        this.updateWindowPosition(newX, newY);
    }

    /**
     * 结束拖拽
     */
    endDrag() {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.trigger.style.cursor = 'pointer';
        this.trigger.style.transition = 'all 0.3s ease';

        // 如果没有移动，则触发点击事件打开窗口
        if (!this.hasMoved) {
            this.toggle();
        }
    }

    /**
     * 更新窗口位置
     */
    updateWindowPosition(triggerX, triggerY) {
        const windowWidth = 420;
        const windowHeight = 600;
        const triggerSize = 60;
        const gap = 10;

        let windowX, windowY;

        // 判断窗口应该显示在按钮的哪一侧
        if (triggerX > window.innerWidth - windowWidth - triggerSize - gap) {
            // 按钮在右侧，窗口显示在左侧
            windowX = triggerX - windowWidth - gap;
        } else {
            // 按钮在左侧，窗口显示在右侧
            windowX = triggerX + triggerSize + gap;
        }

        // 窗口垂直位置
        windowY = triggerY;

        // 确保窗口不超出屏幕
        windowY = Math.max(10, Math.min(windowY, window.innerHeight - windowHeight - 10));

        this.window.style.left = windowX + 'px';
        this.window.style.top = windowY + 'px';
        this.window.style.right = 'auto';
        this.window.style.bottom = 'auto';
    }

    /**
     * 切换窗口显示/隐藏
     */
    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    /**
     * 打开AI助手窗口
     */
    open() {
        // 根据按钮位置更新窗口位置
        const rect = this.trigger.getBoundingClientRect();
        this.updateWindowPosition(rect.left, rect.top);

        this.window.classList.add('active');
        this.trigger.style.display = 'none';
        this.isOpen = true;
        this.input.focus();
    }

    /**
     * 关闭AI助手窗口
     */
    close() {
        this.window.classList.remove('active');
        setTimeout(() => {
            this.trigger.style.display = 'flex';
        }, 300);
        this.isOpen = false;
    }

    /**
     * 发送消息
     */
    async sendMessage() {
        const message = this.input.value.trim();
        if (!message || this.isTyping) return;

        // 显示用户消息
        this.addMessage(message, 'user');
        this.input.value = '';
        this.input.style.height = 'auto';
        this.sendBtn.disabled = true;

        // 添加到对话历史
        this.conversationHistory.push({ role: 'user', content: message });

        // 显示加载动画
        this.showTyping();

        // 获取AI回复
        const response = await this.getResponse(message);

        // 移除加载动画
        this.hideTyping();

        // 显示AI回复
        this.addMessage(response, 'ai');

        // 添加到对话历史
        this.conversationHistory.push({ role: 'assistant', content: response });

        // 限制对话历史长度
        if (this.conversationHistory.length > 10) {
            this.conversationHistory = this.conversationHistory.slice(-10);
        }
    }

    /**
     * 获取AI回复
     */
    async getResponse(question) {
        // 首先在知识库中搜索
        const knowledgeResponse = this.searchKnowledgeBase(question);
        if (knowledgeResponse) {
            return knowledgeResponse;
        }

        // 如果知识库中没有，尝试使用Electron API
        if (window.electronAPI && window.electronAPI.ai && window.electronAPI.ai.ask) {
            try {
                const systemPrompt = `你是一个研知科研助手的使用指南专家，基于以下知识库回答用户问题：

${this.getKnowledgeBaseSummary()}

请用简洁、友好的语言回答问题，必要时提供具体的操作步骤。`;

                const result = await window.electronAPI.ai.ask(
                    systemPrompt + '\n\n用户问题：' + question,
                    null,
                    '研知用户使用问题'
                );

                if (result && result.success) {
                    return result.response;
                }
            } catch (error) {
                console.error('AI助手调用失败:', error);
            }
        }

        // 如果都失败了，返回通用回复
        return this.getGenericResponse(question);
    }

    /**
     * 在知识库中搜索答案
     */
    searchKnowledgeBase(question) {
        const lowerQuestion = question.toLowerCase();

        for (const [category, data] of Object.entries(this.knowledgeBase)) {
            const keywordMatch = data.keywords.some(keyword =>
                lowerQuestion.includes(keyword.toLowerCase()) ||
                keyword.toLowerCase().includes(lowerQuestion)
            );

            if (keywordMatch) {
                return data.response;
            }
        }

        return null;
    }

    /**
     * 获取知识库摘要
     */
    getKnowledgeBaseSummary() {
        const categories = Object.keys(this.knowledgeBase);
        return `知识库包含以下类别：${categories.join('、')}。`;
    }

    /**
     * 获取通用回复
     */
    getGenericResponse(question) {
        return `感谢你的提问！关于「${question}」，我目前的知识库中还没有确切的答案。

**建议你可以：**
1. 查看《用户使用文档》获取详细信息
2. 尝试用不同的关键词提问
3. 或者在GitHub提交Issue获取帮助

**我擅长解答：**
- 安装配置相关问题
- 功能使用方法
- 快捷键操作
- 常见问题解决

还有什么我可以帮助你的吗？`;
    }

    /**
     * 添加消息到聊天界面
     */
    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `aibot-message aibot-message-${type}`;

        const avatar = document.createElement('div');
        avatar.className = 'aibot-avatar';
        avatar.textContent = type === 'ai' ? '🤖' : '👤';

        const content = document.createElement('div');
        content.className = 'aibot-content';

        const textDiv = document.createElement('div');
        textDiv.className = 'aibot-text';
        textDiv.innerHTML = this.formatMessage(text);

        content.appendChild(textDiv);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    /**
     * 格式化消息内容
     */
    formatMessage(text) {
        // 转义HTML特殊字符
        text = text.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 转换Markdown语法
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        text = text.replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code>$2</code></pre>');
        text = text.replace(/\n/g, '<br>');

        return text;
    }

    /**
     * 显示输入动画
     */
    showTyping() {
        this.isTyping = true;

        const typingDiv = document.createElement('div');
        typingDiv.className = 'aibot-message aibot-message-ai';
        typingDiv.id = 'aibot-typing';

        const avatar = document.createElement('div');
        avatar.className = 'aibot-avatar';
        avatar.textContent = '🤖';

        const content = document.createElement('div');
        content.className = 'aibot-content';

        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'aibot-typing';
        typingIndicator.innerHTML = `
            <div class="aibot-typing-dot"></div>
            <div class="aibot-typing-dot"></div>
            <div class="aibot-typing-dot"></div>
        `;

        content.appendChild(typingIndicator);
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(content);

        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    /**
     * 隐藏输入动画
     */
    hideTyping() {
        this.isTyping = false;
        const typingIndicator = document.getElementById('aibot-typing');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// 初始化AI助手
document.addEventListener('DOMContentLoaded', () => {
    window.yanzhiAIBot = new YanzhiAIBot();
    console.log('研知AI助手已启动');
});

// 导出供外部使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YanzhiAIBot;
}