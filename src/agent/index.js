const ClassifySkill = require('./ClassifySkill');
const { RecommendSkill, ARXIV_CATEGORIES } = require('./RecommendSkill');
const SummarizeSkill = require('./SummarizeSkill');
const ScheduleSkill = require('./ScheduleSkill');

/**
 * 研知 Agent - 统一技能管理入口
 * 整合分类、总结、推荐、定时任务四大技能
 */
class YanzhiAgent {
    constructor(workspaceScanner = null) {
        this.classifySkill = new ClassifySkill(workspaceScanner);
        this.summarizeSkill = new SummarizeSkill();
        this.recommendSkill = new RecommendSkill();
        this.scheduleSkill = new ScheduleSkill(null);

        console.log('✅ 研知 Agent 已初始化');
        console.log('   可用技能：classify, summarize, recommend, schedule');
    }

    /**
     * 设置工作区扫描器
     * @param {Object} scanner - 工作区扫描器实例
     */
    setWorkspaceScanner(scanner) {
        this.classifySkill.setWorkspaceScanner(scanner);
    }

    /**
     * 文献分类技能
     * @param {string|Object} content - 待分类的内容或选项对象
     * @param {string} contentType - 内容类型 'text' | 'image' | 'pdf' | 'auto'
     * @param {string} fileName - 可选，文件名（用于博客判断）
     * @returns {Promise<Object>} 分类结果
     */
    async classify(content, contentType = 'text', fileName = null) {
        // 支持新旧两种调用方式
        if (typeof content === 'object') {
            return this.classifySkill.classify(content);
        }
        return this.classifySkill.classify({
            content: content,
            contentType: contentType,
            fileName: fileName
        });
    }

    /**
     * 文献总结技能
     * @param {string} content - 待总结的内容（文本/图片路径/PDF路径）
     * @param {string} contentType - 内容类型 'text' | 'image' | 'pdf'
     * @param {string} language - 输出语言 'zh' | 'en'
     * @returns {Promise<string>} 总结内容
     */
    async summarize(content, contentType = 'text', language = 'zh') {
        return this.summarizeSkill.summarize(content, contentType, language);
    }

    /**
     * 论文推荐技能
     * @param {string} query - 搜索关键词
     * @param {number} maxResults - 最大结果数
     * @param {Object} context - 上下文参数（可包含文章内容等）
     * @returns {Promise<Array>} 论文列表
     */
    async recommend(query, maxResults = 5, context = {}) {
        return this.recommendSkill.recommend(query, maxResults, context);
    }

    /**
     * 添加定时任务
     * @param {string} keyword - 搜索关键词
     * @param {string} time - 时间 'HH:MM'
     * @param {string} repeat - 重复类型 'daily' | 'weekdays' | 'weekly'
     * @returns {Object} 添加结果
     */
    schedule(keyword, time, repeat = 'daily') {
        return this.scheduleSkill.addSchedule(keyword, time, repeat);
    }

    /**
     * 智能处理指令
     * 根据指令内容自动选择合适的技能
     * @param {string} instruction - 用户指令
     * @param {Object} context - 上下文参数
     * @returns {Promise<Object>} 处理结果
     */
    async process(instruction, context = {}) {
        const instructionLower = instruction.toLowerCase();

        // 总结/讲解技能
        if (['总结', '摘要', '概括', 'summarize', '讲解', '分析', '解释', '解读'].some(kw => instructionLower.includes(kw))) {
            if (context.content) {
                const result = await this.summarize(
                    context.content,
                    context.contentType || 'text',
                    context.language || 'zh'
                );
                return { skill: 'summarize', result };
            }
            return { error: '缺少内容参数，请提供 content' };
        }

        // 分类技能
        if (['分类', '归类', '保存', 'classify'].some(kw => instructionLower.includes(kw))) {
            if (context.content) {
                const result = await this.classify({
                    content: context.content,
                    contentType: context.contentType || 'auto',
                    fileName: context.fileName || null
                });
                return { skill: 'classify', result };
            }
            return { error: '缺少内容参数，请提供 content' };
        }

        // 推荐技能 - 降低”论文”关键词的侵略性，优先匹配更具体的意图
        if (['推荐', '类似', '相关', 'recommend', 'arxiv'].some(kw => instructionLower.includes(kw)) ||
            (instructionLower.includes('论文') && ['找', '搜', '查', '发现', '看到'].some(kw => instructionLower.includes(kw)))) {
            // 从指令中提取数量
            const countMatch = instruction.match(/(\d+)\s*篇/);
            const maxResults = countMatch ? Math.min(parseInt(countMatch[1]), 10) : 3;

            const result = await this.recommend(context.query || instruction, maxResults, context);
            return { skill: 'recommend', result };
        }

        // 定时任务技能
        if (['定时', '每天', '推送', 'schedule', '提醒'].some(kw => instructionLower.includes(kw))) {
            const result = this.schedule(
                context.keyword || 'machine learning',
                context.time || '09:00',
                context.repeat || 'daily'
            );
            return { skill: 'schedule', result };
        }

        return { error: '无法识别指令类型，支持的指令：总结、分类、推荐、定时' };
    }

    /**
     * 获取可用技能列表
     */
    getAvailableSkills() {
        return [
            { name: 'classify', description: '文献分类 - 根据内容选择合适的文件夹' },
            { name: 'summarize', description: '文献总结 - 提取文本/图片/PDF核心内容' },
            { name: 'recommend', description: '论文推荐 - 从 arXiv 搜索相关论文' },
            { name: 'schedule', description: '定时任务 - 设置定时搜索推送' }
        ];
    }
}

// 单例模式
let defaultAgent = null;

/**
 * 初始化 Agent（设置工作区扫描器）
 * @param {Object} workspaceScanner - 工作区扫描器实例
 */
function initAgent(workspaceScanner) {
    if (!defaultAgent) {
        defaultAgent = new YanzhiAgent(workspaceScanner);
    } else {
        defaultAgent.setWorkspaceScanner(workspaceScanner);
    }
    return defaultAgent;
}

/**
 * 获取默认 Agent 实例
 * @returns {YanzhiAgent}
 */
function getAgent() {
    if (!defaultAgent) {
        defaultAgent = new YanzhiAgent();
    }
    return defaultAgent;
}

/**
 * 快捷处理指令
 * @param {string} instruction - 用户指令
 * @param {Object} context - 上下文参数
 * @returns {Promise<Object>}
 */
function processInstruction(instruction, context = {}) {
    return getAgent().process(instruction, context);
}

module.exports = {
    YanzhiAgent,
    getAgent,
    initAgent,
    processInstruction,
    ARXIV_CATEGORIES,
    // 导出各个技能类，方便单独使用
    ClassifySkill,
    SummarizeSkill,
    RecommendSkill,
    ScheduleSkill
};

