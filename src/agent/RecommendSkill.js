const { searchArxiv } = require('../utils/AIProvider');

class RecommendSkill {
    constructor() {
        this.maxResults = 10;
    }

    /**
     * 标准化 arXiv 分类名称
     * @param {string} category - 用户输入或 AI 返回的分类名
     * @returns {string|null} 有效的 arXiv 分类或 null
     */
    _normalizeCategory(category) {
        if (!category) return null;
        const trimmed = category.trim();

        // 如果已经是有效分类，直接返回
        if (ARXIV_CATEGORIES[trimmed]) return trimmed;

        // 查找别名映射
        const lower = trimmed.toLowerCase();
        return CATEGORY_ALIASES[lower] || null;
    }

    /**
     * 用 AI 统一解析用户意图，提取搜索参数
     * @param {string} query - 用户请求
     * @param {string} content - 文章内容（可选）
     * @returns {Promise<{count: number, keywords: string, sortBy: string, category: string|null, daysLimit: number|null}>}
     */
    async _parseUserIntent(query, content = null) {
        try {
            // 先用正则提取数量（作为参考）
            const expectedCount = this._extractCount(query);

            const { getAIClient } = require('../screenshot/aiClient');
            const aiClient = getAIClient("你是一个学术论文搜索助手。分析用户需求，提取搜索参数。");

            const contentPart = content
                ? `\n文章内容摘要：\n${content.substring(0, 3000)}`
                : '';

            const prompt = `分析以下用户请求，提取搜索参数。以 JSON 格式返回。

用户请求：${query}
${contentPart}

返回格式（只返回 JSON，不要其他内容）：
{
    "count": <1-10的数字，用户要几篇论文>,
    "keywords": "<英文关键词，空格分隔，适合 arXiv 搜索>",
    "sortBy": "<relevance 或 submittedDate>",
    "category": "<arXiv 分类如 cs.LG，可选>",
    "daysLimit": <最近N天，可选>
}

重要提示：
- 用户请求中明确提到"${expectedCount}篇"，请返回 count: ${expectedCount}
- 分类必须是有效的 arXiv 分类代码（如 cs.AI, cs.LG, cs.CV, cs.RO），不要返回 'robotics' 这样的名称

示例：
- "推荐两篇论文" → {"count": 2, "keywords": "machine learning", "sortBy": "relevance"}
- "推荐3篇最新的transformer论文" → {"count": 3, "keywords": "transformer", "sortBy": "submittedDate"}
- "找5篇关于attention机制的相关论文" → {"count": 5, "keywords": "attention mechanism", "sortBy": "relevance"}`;

            const result = await aiClient.ask(prompt, null, 0.3, 300);

            // 解析 JSON
            const parsed = JSON.parse(result);

            // 如果正则提取到了明确数量（非默认值3），优先使用正则结果
            const finalCount = (expectedCount !== 3) ? expectedCount : (parsed.count || 3);

            return {
                count: Math.min(Math.max(finalCount, 1), 10),
                keywords: parsed.keywords || 'machine learning',
                sortBy: parsed.sortBy || 'relevance',
                category: this._normalizeCategory(parsed.category),
                daysLimit: parsed.daysLimit || null
            };
        } catch (e) {
            console.error('[Recommend] 解析用户意图失败:', e);
            // 降级：使用正则提取数量
            return {
                count: this._extractCount(query),
                keywords: 'machine learning',
                sortBy: 'relevance',
                category: null,
                daysLimit: null
            };
        }
    }

    /**
     * 从用户请求中提取推荐数量
     * @param {string} query - 用户请求
     * @returns {number} 推荐数量，默认3
     */
    _extractCount(query) {
        // 中文数字映射（包含"两"的常见表达）
        const chineseNumbers = {
            '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
        };

        // 先尝试阿拉伯数字（匹配"3篇"、"推荐5篇"等）
        const arabicMatch = query.match(/(\d+)\s*篇/);
        if (arabicMatch) {
            const count = parseInt(arabicMatch[1]);
            return Math.min(Math.max(count, 1), 10); // 限制1-10篇
        }

        // 再尝试中文数字（匹配"三篇"、"两篇论文"、"介绍两篇"等）
        const chineseMatch = query.match(/([一二两三四五六七八九十])\s*篇/);
        if (chineseMatch) {
            const count = chineseNumbers[chineseMatch[1]];
            if (count) {
                return Math.min(Math.max(count, 1), 10);
            }
        }

        return 3; // 默认3篇
    }

    /**
     * 翻译论文信息为中文
     * @param {Object} paper - 论文信息
     * @returns {Promise<Object>} 翻译后的论文信息
     */
    async _translatePaper(paper) {
        try {
            const { getAIClient } = require('../screenshot/aiClient');
            const aiClient = getAIClient("你是一个学术翻译助手。将英文论文信息翻译为中文。");

            const prompt = `请将以下论文信息翻译为中文（保持学术严谨性，JSON格式返回：{"title":"翻译后的标题","abstract":"翻译后的摘要"}）：

标题：${paper.title || ''}
摘要：${(paper.summary || paper.abstract || '').substring(0, 500)}`;

            const result = await aiClient.ask(prompt, null, 0.3, 500);
            const parsed = JSON.parse(result);
            return {
                ...paper,
                titleCn: parsed.title || paper.title,
                abstractCn: parsed.abstract || paper.summary
            };
        } catch (e) {
            console.error('[Recommend] 翻译失败:', e);
            return {
                ...paper,
                titleCn: paper.title,
                abstractCn: paper.summary || paper.abstract
            };
        }
    }

    /**
     * 处理论文列表（格式化作者、翻译等）
     * @param {Array} papers - 论文列表
     * @returns {Promise<Array>} 处理后的论文列表
     */
    async _processPapers(papers) {
        return Promise.all(papers.map(async (paper) => {
            // 翻译论文信息
            const translated = await this._translatePaper(paper);
            // 格式化作者显示
            const authors = paper.authors || [];
            const authorsDisplay = authors.length > 1
                ? `${authors[0]}等`
                : (authors[0] || '未知');
            return {
                ...translated,
                authorsDisplay
            };
        }));
    }

    /**
     * 推荐论文 - 支持自然语言请求和关键词搜索
     * @param {string} query - 搜索关键词或自然语言请求
     * @param {number} maxResults - 最大结果数
     * @param {Object} context - 上下文参数，可包含文章内容等
     */
    async recommend(query, maxResults = 5, context = {}) {
        // 检测是否是自然语言请求
        const naturalLanguagePatterns = [
            /帮我推荐/,
            /推荐.*篇/,
            /找.*论文/,
            /类似.*文献/,
            /similar.*paper/i,
            /recommend.*paper/i,
            /相关.*论文/,
            /相关文献/
        ];

        const isNaturalLanguage = naturalLanguagePatterns.some(p => p.test(query));

        if (!isNaturalLanguage) {
            // 已经是关键词，直接搜索
            console.log('[Recommend] 使用关键词搜索:', query, '数量:', maxResults);
            const papers = await this.searchPapers(query, maxResults);
            return this._processPapers(papers);
        }

        console.log('[Recommend] 检测到自然语言请求，正在用 AI 解析用户意图...');

        // 用 AI 统一解析用户意图（提取数量、关键词、排序方式等）
        const intent = await this._parseUserIntent(query, context.content);

        // 处理数量优先级
        let count = intent.count;
        if (context.maxResults) {
            count = Math.min(context.maxResults, 10);
        }
        if (maxResults !== 5 && !context.maxResults) {
            count = Math.min(maxResults, 10);
        }
        const finalCount = Math.min(count, 10);

        console.log('[Recommend] 解析结果:', {
            keywords: intent.keywords,
            count: finalCount,
            sortBy: intent.sortBy,
            category: intent.category,
            daysLimit: intent.daysLimit
        });

        // 如果有分类或日期限制，使用高级搜索
        if (intent.category || intent.daysLimit) {
            const papers = await this.advancedSearch(intent.keywords.split(' '), {
                category: intent.category,
                days: intent.daysLimit,
                sortBy: intent.sortBy
            }, finalCount);
            return this._processPapers(papers);
        }

        const papers = await this.searchPapers(intent.keywords, finalCount, intent.sortBy);
        return this._processPapers(papers);
    }

    /**
     * 从文章内容中提取关键词
     * @param {string} content - 文章内容
     * @returns {Promise<string>} 关键词
     */
    async _extractKeywordsFromContent(content) {
        try {
            const { getAIClient } = require('../screenshot/aiClient');
            const systemPrompt = `# 学术文体关键词提取专家

## 角色分配
你是一个资深的学术文献分析师，擅长从学术文章中精准提取核心概念和技术关键词。你需要提取最能代表文章核心内容的英文关键词，用于arXiv学术搜索。

## 任务
1. 深度分析文章的核心研究内容
2. 识别关键的技术概念、方法、理论框架
3. 提取3-5个最有代表性的英文关键词
4. 这些关键词应该能够精准匹配相关研究论文

## 参考信息
### 优先类别
- 核心技术方法：transformer, attention mechanism, BERT, CNN等
- 研究领域：machine learning, computer vision, NLP等
- 特定问题：classification, object detection, sentiment analysis等
- 创新点：novel approach, optimization, improvement等

### 应避免
- 过于宽泛的词：study, research, analysis, method, development
- 通用词：paper, article, we, this work
- 过于具体的名词：author name, institution

## 输出要求
1. 仅返回英文关键词，不含任何解释
2. 用空格分隔多个关键词
3. 关键词应该是学术界公认的术语
4. 按照重要性从高到低排列
5. 每个关键词简洁清晰（通常1-3个单词）

## 示例
文章内容："我们提出了一个基于Transformer的视觉识别框架..."
输出：transformer vision recognition deep learning

文章内容："本文采用LSTM网络进行时间序列预测..."
输出：LSTM time series prediction recurrent neural network

## 输出项示例
keyword1 keyword2 keyword3 keyword4 keyword5`;
            const aiClient = getAIClient(systemPrompt);

            // 只使用前3页的内容（约6000字符）来减少 token 消耗
            const limitedContent = content.substring(0, 6000);

            const userPrompt = `## 文章分析
请从以下文章内容中提取最适合arXiv搜索的核心关键词。

**文章内容预览：**
${limitedContent}

## 提取指南
1. 重点关注：核心技术、研究方法、创新点
2. 优先级：越能体现论文价值的关键词优先级越高
3. 确保关键词在学术搜索中能找到相关论文
4. 返回格式：关键词1 关键词2 关键词3 ... （仅英文关键词，用空格分隔）`;
            const keywords = await aiClient.ask(userPrompt, null, 0.3, 100);


            return keywords.trim() || 'machine learning';
        } catch (e) {
            console.error('[Recommend] 提取关键词失败:', e);
            return 'machine learning';
        }
    }

    /**
     * 从用户请求中提取关键词
     * @param {string} query - 用户请求
     * @returns {Promise<string>} 关键词
     */
    async _extractKeywordsFromQuery(query) {
        try {
            const { getAIClient } = require('../screenshot/aiClient');
            const systemPrompt = `# 学术搜索关键词智能提取器

## 角色分配
你是一个专业的学术搜索关键词提取专家，能够准确理解用户意图并将其转化为高效的arXiv搜索关键词。你需要从自然语言请求中捕捉核心研究概念。

## 任务
将用户的自然语言搜索请求转化为精简、高效的英文关键词组合，用于arXiv论文库搜索，帮助用户快速找到相关研究。

## 参考信息
### 常见研究领域和技术术语映射
- 深度学习 → deep learning, neural network, convolutional neural network（CNN）
- 视觉 → computer vision, visual recognition, image processing
- 自然语言 → natural language processing（NLP）, language model, text analysis
- 强化学习 → reinforcement learning, policy gradient, Q-learning
- 机器学习 → machine learning, supervised learning, unsupervised learning
- 特定方法 → attention mechanism, transformer, LSTM, GAN, diffusion model

### 优化建议
- 优先提取专有技术名词（如BERT、GPT、ResNet）
- 识别领域标签（如robotics、medical imaging、recommendation system）
- 避免通用动词和助词（improve, propose, novel, method）

## 输出要求
1. 仅返回英文关键词，多个词用空格分隔（无逗号、无中文）
2. 提取2-4个核心关键词为最佳
3. 关键词顺序按重要性降序排列
4. 拒绝返回无意义的词汇，宁可少也不要多
5. 完全匹配学术术语标准写法

## 示例
**用户请求**: "我想找关于图像识别的论文"
**输出**: image recognition computer vision deep learning

**用户请求**: "推荐一些Transformer在NLP上的应用"
**输出**: transformer natural language processing NLP

**用户请求**: "最近有什么关于强化学习在机器人控制的研究"
**输出**: reinforcement learning robotics control policy

## 输出项示例
keyword1 keyword2 keyword3`;
            const aiClient = getAIClient(systemPrompt);

            const userPrompt = `## 用户搜索请求分析
请从以下用户请求中提取最核心的学术搜索关键词。

**用户请求**：${query}

## 提取指南
1. 识别主要研究方向和技术方法
2. 转化为学术标准英文术语
3. 排除冗余和通用词汇
4. 仅返回关键词，空格分隔，无其他内容`;

            const keywords = await aiClient.ask(userPrompt, null, 0.3, 100);
            return keywords.trim() || 'machine learning';
        } catch (e) {
            console.error('[Recommend] 提取关键词失败:', e);
            return 'machine learning';
        }
    }

    async searchPapers(query, maxResults = 5, sortBy = 'relevance', sortOrder = 'descending') {
        try {
            let result = await searchArxiv(query, maxResults, sortBy);
            let papers = result.success ? (result.papers || []) : [];

            // 兜底策略1：如果无结果且有关键词限制，尝试移除分类限制
            if (papers.length === 0 && query.includes('cat:')) {
                console.log('[Recommend] 尝试降级策略：移除分类限制...');
                const simplifiedQuery = query.split(' AND ').filter(p => !p.startsWith('cat:')).join(' AND ');
                if (simplifiedQuery && simplifiedQuery !== query) {
                    result = await searchArxiv(simplifiedQuery, maxResults, sortBy);
                    if (result.success) papers = result.papers || [];
                }
            }

            // 兜底策略2：如果还是无结果，尝试减少关键词数量
            if (papers.length === 0 && query.includes(' AND ')) {
                console.log('[Recommend] 尝试降级策略：减少关键词...');
                const parts = query.split(' AND ');
                // 只保留前3个关键词条件
                const reducedQuery = parts.slice(0, Math.min(3, parts.length)).join(' AND ');
                if (reducedQuery && reducedQuery !== query) {
                    result = await searchArxiv(reducedQuery, maxResults, sortBy);
                    if (result.success) papers = result.papers || [];
                }
            }

            // 如果使用相关性排序且请求数量 >= 5，额外获取一些近期论文混合
            if (sortBy === 'relevance' && maxResults >= 5 && papers.length > 0) {
                const recentResult = await searchArxiv(query, Math.ceil(maxResults / 2), 'submittedDate');
                if (recentResult.success && recentResult.papers) {
                    // 合并结果，去重（按 arxivId）
                    const existingIds = new Set(papers.map(p => p.arxivId));
                    for (const paper of recentResult.papers) {
                        if (!existingIds.has(paper.arxivId) && papers.length < maxResults) {
                            papers.push(paper);
                        }
                    }
                }
            }

            return papers;
        } catch (e) {
            console.error('搜索失败:', e.message);
            return [];
        }
    }

    /**
     * 使用高级搜索语法搜索论文
     * @param {string} keywords - 关键词数组
     * @param {Object} options - 搜索选项
     * @param {string} options.category - arXiv 分类 (如 'cs.AI', 'cs.LG')
     * @param {number} options.days - 限制最近N天内提交的论文
     * @param {number} maxResults - 最大结果数
     */
    async advancedSearch(keywords, options = {}, maxResults = 5) {
        const parts = [];

        // 添加关键词
        if (keywords && keywords.length > 0) {
            const kwQuery = keywords.map(kw => `all:${kw}`).join(' AND ');
            parts.push(kwQuery);
        }

        // 添加分类限制
        if (options.category) {
            parts.push(`cat:${options.category}`);
        }

        // 添加日期限制
        if (options.days) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - options.days);
            const startStr = startDate.toISOString().replace(/[-:T]/g, '').substring(0, 8) + '000000';
            parts.push(`submittedDate:[${startStr} TO *]`);
        }

        const query = parts.join(' AND ');
        return this.searchPapers(query, maxResults, options.sortBy || 'submittedDate');
    }

    async searchByLogic(keywords, logic = 'AND', maxResults = 5) {
        const query = keywords.map(kw => `all:${kw}`).join(` ${logic} `);
        return this.searchPapers(query, maxResults);
    }

    async getRecentPapers(category, days = 7, maxResults = 5) {
        // 计算日期范围
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startStr = startDate.toISOString().replace(/[-:T]/g, '').substring(0, 8) + '000000';

        const query = `cat:${category} AND submittedDate:[${startStr} TO *]`;
        return this.searchPapers(query, maxResults);
    }

    /**
     * 格式化论文列表为可读文本
     * @param {Array} papers - 论文列表
     * @param {string} format - 格式 'text' | 'markdown' | 'json'
     */
    formatPapers(papers, format = 'markdown') {
        if (!papers || papers.length === 0) {
            return '未找到相关论文';
        }

        if (format === 'json') {
            return JSON.stringify(papers, null, 2);
        }

        if (format === 'text') {
            return papers.map((p, i) => {
                let text = `${i + 1}. ${p.title}\n`;
                text += `   作者: ${p.authors ? p.authors.join(', ') : '未知'}\n`;
                text += `   发布: ${p.published || '未知'}\n`;
                text += `   PDF: ${p.pdfUrl || '无'}\n`;
                return text;
            }).join('\n');
        }

        // markdown 格式
        return papers.map((p, i) => {
            let md = `### ${i + 1}. ${p.title}\n`;
            md += `**作者**: ${p.authors ? p.authors.join(', ') : '未知'}\n`;
            md += `**发布**: ${p.published || '未知'}\n`;
            if (p.pdfUrl) {
                md += `**PDF**: [下载链接](${p.pdfUrl})\n`;
            }
            if (p.arxivId) {
                md += `**arXiv**: ${p.arxivId}\n`;
            }
            if (p.summary || p.abstract) {
                const summary = (p.summary || p.abstract).substring(0, 200);
                md += `\n> ${summary}${summary.length >= 200 ? '...' : ''}\n`;
            }
            return md;
        }).join('\n---\n\n');
    }
}

// arXiv 常用分类
const ARXIV_CATEGORIES = {
    'cs.AI': '人工智能',
    'cs.CL': '计算语言学',
    'cs.CV': '计算机视觉',
    'cs.LG': '机器学习',
    'cs.NE': '神经网络',
    'cs.IR': '信息检索',
    'cs.SE': '软件工程',
    'cs.DB': '数据库',
    'cs.DC': '分布式计算',
    'cs.CR': '密码学与安全',
    'cs.RO': '机器人学',
    'physics.med-ph': '医学物理',
    'q-bio.GN': '基因组学',
    'q-bio.QM': '定量方法',
    'math.NA': '数值分析',
    'stat.ML': '统计机器学习'
};

// 分类别名映射（用户常用词 → arXiv 标准分类）
const CATEGORY_ALIASES = {
    'robotics': 'cs.RO',
    'robot': 'cs.RO',
    'ai': 'cs.AI',
    'artificial intelligence': 'cs.AI',
    'machine learning': 'cs.LG',
    'ml': 'cs.LG',
    'computer vision': 'cs.CV',
    'cv': 'cs.CV',
    'nlp': 'cs.CL',
    'natural language processing': 'cs.CL',
    'deep learning': 'cs.LG',
    'reinforcement learning': 'cs.LG',
    'neural network': 'cs.NE',
    'information retrieval': 'cs.IR',
    'software engineering': 'cs.SE',
    'database': 'cs.DB',
    'security': 'cs.CR',
    'cryptography': 'cs.CR'
};

module.exports = { RecommendSkill, ARXIV_CATEGORIES };