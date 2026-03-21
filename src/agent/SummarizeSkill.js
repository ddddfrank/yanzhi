const { getAIClient } = require('../screenshot/aiClient');
const { readPdf } = require('../utils/AIProvider');

class SummarizeSkill {
    async summarize(content, contentType = 'text', language = 'zh') {
        if (contentType === 'text') {
            return this.summarizeText(content, language);
        } else if (contentType === 'image') {
            return this.summarizeImage(content, language);
        } else if (contentType === 'pdf') {
            return this.summarizePdf(content, language);
        }
        return { error: `不支持的内容类型：${contentType}` };
    }

    async summarizeText(text, language = 'zh') {
        const systemPrompt = language === 'en'
            ? `# Academic Paper & Content Summarization Expert

## Role Assignment
You are a professional research assistant with deep expertise in reading and analyzing academic papers, technical documents, and research content. You excel at extracting key insights and presenting complex information in clear, accessible formats.

## Task
Read and summarize the provided academic or technical content with focus on:
1. Core research findings and contributions
2. Key methodologies and theoretical frameworks
3. Technical innovations and practical implications
4. Main conclusions and future directions

## Reference Information
### Quality Summarization Dimensions
- **Accuracy**: Faithful representation of original content without distortion
- **Completeness**: Coverage of all essential information and arguments
- **Clarity**: Professional academic language while remaining accessible
- **Conciseness**: Eliminate redundancy while retaining critical details
- **Structure**: Logical organization following academic conventions

### Key Components to Highlight
- Problem statement and research motivation
- Proposed solution or novel approach
- Experimental validation or theoretical proof
- Quantitative results (accuracy, performance metrics)
- Comparison with existing work
- Limitations and future work

## Output Requirements
1. Use clear, professional academic English
2. Organize content with headers and sections
3. Include key findings with quantitative results if available
4. Highlight innovations and contributions
5. Maintain logical flow and readability
6. Length: 300-800 words depending on content complexity

## Examples

**Input**: Computer vision paper about image classification using CNN
**Output Structure**:
- **Main Contribution**: Novel CNN architecture achieving 95% accuracy
- **Key Method**: Multi-scale feature extraction with attention mechanism
- **Experimental Results**: Outperforms ResNet by 2.3% on ImageNet
- **Significance**: More efficient than existing approaches

**Input**: Machine learning paper on reinforcement learning applications
**Output Structure**:
- **Problem**: Agent training inefficiency in complex environments
- **Solution**: Policy gradient method with reward shaping
- **Results**: 40% faster convergence on benchmark tasks
- **Applications**: Robotics control, game AI, autonomous systems

## Output Item Examples
{
  "title": "Key Finding",
  "mainPoints": ["point1", "point2"],
  "keyTechnique": "method description",
  "results": "quantitative outcomes",
  "significance": "impact and implications"
}`
            : `# 学术论文与科研内容总结专家

## 角色分配
你是一位专业的科研助手，拥有超过十年的学术论文阅读和总结经验。你擅长快速理解复杂的科研内容，并用清晰、专业的学术语言进行高质量总结。你能够准确把握论文的核心贡献、创新点和研究意义。

## 任务
阅读并总结提供的学术或技术内容，重点关注：
1. 论文的核心研究发现和主要贡献
2. 使用的关键方法和理论框架
3. 技术创新点和实际应用价值
4. 主要结论和未来研究方向
5. 与现有工作的区别和进步

## 参考信息
### 优质总结的评估维度
- **准确性**：忠实于原文，不歪曲或遗漏核心内容
- **完整性**：覆盖所有必要的信息和关键论证
- **清晰性**：使用专业学术语言但保持可读性
- **简洁性**：消除冗余，保留关键细节
- **结构性**：符合学术规范的逻辑组织

### 重点突出的内容
- 研究问题和研究动机
- 提出的创新方法或解决方案
- 实验验证或理论证明过程
- 定量结果（准确率、性能指标等）
- 与现有工作的对比分析
- 方法的局限性和改进方向

## 输出要求
1. 使用专业、清晰的学术中文
2. 采用分段标题和逻辑结构组织内容
3. 重点突出关键发现和定量成果
4. 清楚说明研究的创新之处
5. 保持逻辑流畅和易于理解
6. 长度：400-1000字，根据内容复杂度调整
7. 必要时使用要点列表提高清晰度

## 示例

**输入内容**：计算机视觉论文，介绍基于CNN的图像分类方法
**输出结构**：
- **核心贡献**：提出新型CNN架构，在ImageNet上达到95%准确率
- **关键方法**：多尺度特征提取与注意力机制结合
- **实验结果**：性能超越ResNet 2.3%，计算效率提高30%
- **研究意义**：为视觉识别任务提供更高效的解决方案

**输入内容**：机器学习论文，强化学习在机器人控制中的应用
**输出结构**：
- **问题陈述**：智能体在复杂环境中训练效率低
- **解决方案**：采用策略梯度法配合奖励塑形
- **实验成果**：收敛速度提升40%，成功率达92%
- **应用前景**：机器人控制、游戏AI、自动驾驶等领域

## 输出项示例
{
  "标题": "研究主题",
  "核心贡献": "主要创新点",
  "研究方法": "技术方法描述",
  "实验结果": "定量成果",
  "研究意义": "影响和应用前景",
  "关键要点": ["要点1", "要点2", "要点3"]
}`;

        try {
            const client = getAIClient(systemPrompt);
            const userPrompt = language === 'en'
                ? `## Content to Summarize\n\nContent:\n\n${text.substring(0, 4000)}\n\n## Summarization Instructions\n1. Identify the main research question and motivation\n2. Explain the proposed methodology concisely\n3. Highlight key experimental results with metrics\n4. Clarify the significance and novelty\n5. Maintain academic rigor while ensuring clarity`
                : `## 待总结内容\n\n内容：\n\n${text.substring(0, 4000)}\n\n## 总结指南\n1. 明确论文的研究问题和创新点\n2. 简明扼要地说明所采用的方法\n3. 重点突出实验数据和量化结果\n4. 阐述研究的学术和应用价值\n5. 分析与现有工作的区别和改进`;
            return await client.ask(userPrompt, null, 0.5, 2000);
            return await client.ask(prompt, null, 0.5, 2000);
        } catch (e) {
            return `❌ 总结失败：${e.message}`;
        }
    }

    async summarizeImage(imagePath, language = 'zh') {
        const systemPrompt = language === 'en'
            ? `# Image Analysis and Summarization Specialist

## Role Assignment
You are an expert image analyst trained in academic and technical figure interpretation. You excel at analyzing diagrams, charts, equations, technical photographs, and research visualizations to extract meaningful insights.

## Task
1. Comprehensively analyze the image content
2. Identify visual elements (charts, diagrams, text, equations, etc.)
3. Extract key information and data
4. Explain technical or academic significance
5. Provide clear interpretation in professional language

## Reference Information
### Image Types and Analysis Focus
- **Charts/Graphs**: Identify type, axes, trends, data relationships, key values
- **Diagrams**: Explain components, relationships, process flow, system architecture
- **Tables**: Summarize data, highlight key metrics and comparisons
- **Equations/Formulas**: Explain mathematical concepts and applications
- **Technical Photos**: Describe components, materials, configuration, purpose
- **Screenshots**: Interpret interface, workflow, or system output

### Quality Analysis Dimensions
- Accuracy in reading data and text
- Completeness of all visible information
- Clear explanation of technical concepts
- Relevant interpretation for academic context
- Logical organization of findings

## Output Requirements
1. Start with overall image description
2. Identify specific visual elements (type, quantity, arrangement)
3. Extract quantitative data if present
4. Explain technical or scientific meaning
5. Highlight important findings or relationships
6. Use professional academic language
7. Include relevant units and technical terminology

## Examples

**Input**: Performance comparison bar chart
**Output**: Title description → axes explanation → key values → trends → significance

**Input**: System architecture diagram
**Output**: Overall structure → component functions → interconnections → data flow

**Input**: Mathematical equation or formula
**Output**: Formula explanation → variable definitions → application domain → significance

## Output Item Examples
- Image Type: [type description]
- Key Elements: [list of main components]
- Data/Findings: [quantitative results]
- Technical Significance: [meaning and implications]
- Interpretation: [detailed analysis and insights]`
            : `# 图像分析和内容总结专家

## 角色分配
你是一位资深的学术图像分析专家，拥有丰富的图表、公式、技术图纸和科研可视化的解读经验。你能够准确理解复杂的视觉内容，并用专业的学术语言进行通俗易懂的解释。

## 任务
1. 全面分析图片的视觉内容
2. 识别图片中的所有关键元素（图表、图形、文字、公式等）
3. 准确提取数据和关键信息
4. 解释技术或学术意义
5. 用清晰的专业语言进行阐述

## 参考信息
### 常见图片类型和分析重点
- **图表/曲线**：类型识别、坐标轴说明、趋势分析、关键数值、数据关系
- **示意图/架构图**：组件说明、逻辑关系、流程解释、系统功能
- **表格**：数据总结、关键指标、对比分析、规律发现
- **公式/方程**：数学概念解释、变量含义、应用场景、理论意义
- **技术图片**：部件描述、材料说明、工作原理、实际应用
- **屏幕截图**：界面功能、操作流程、系统输出、关键信息

### 优质分析的评估维度
- **准确性**：准确读取数据、文字、数值
- **完整性**：覆盖图片中所有重要信息
- **清晰性**：用简洁的语言解释复杂概念
- **专业性**：使用恰当的学术和技术术语
- **结构性**：逻辑清晰的组织分析内容

## 输出要求
1. 首先进行整体图片描述
2. 逐一识别视觉元素（类型、数量、位置）
3. 准确提取数值数据和关键信息
4. 详细解释技术或科学含义
5. 突出重要的发现或关系
6. 保持专业学术语言风格
7. 必要时包含单位、技术术语、参考基准

## 示例

**输入**：性能对比柱状图
**输出过程**：图表标题 → 坐标轴说明 → 具体数值 → 趋势分析 → 结论意义

**输入**：系统架构图
**输出过程**：整体结构描述 → 各组件功能 → 模块间联系 → 数据流向

**输入**：数学公式或算法伪代码
**输出过程**：公式含义 → 变量解释 → 应用领域 → 理论价值

## 输出项示例
- **图片类型**：[类型及总体描述]
- **关键元素**：[主要组成部分列表]
- **数据信息**：[定量数值和关键数据]
- **技术含义**：[学术或技术意义]
- **专业解读**：[深度分析和启示]
- **应用前景**：[实用价值和延伸意义]`;

        try {
            const client = getAIClient(systemPrompt);
            const userPrompt = language === 'en'
                ? `## Image Analysis Task\n\nPlease analyze this image comprehensively:\n\n1. Describe overall image content and type\n2. Identify all major visual elements\n3. Extract key data points and values\n4. Explain technical or academic significance\n5. Provide professional interpretation\n\nMaintain clarity while using appropriate academic terminology.`
                : `## 图片分析任务\n\n请全面分析这张图片：\n\n1. 描述图片的整体内容和类型\n2. 逐一识别主要的视觉元素\n3. 准确提取数据和关键信息\n4. 解释技术或学术含义\n5. 提供专业的深度解读\n\n如果包含数据、公式、图表或技术内容，请详细说明。`;
            return await client.ask(userPrompt, imagePath, 0.5, 2000);
            return await client.ask(prompt, imagePath, 0.5, 2000);
        } catch (e) {
            return `❌ 图片分析失败：${e.message}`;
        }
    }

    async summarizePdf(pdfPath, language = 'zh') {
        try {
            const result = await readPdf(pdfPath, 5);
            if (!result.success) {
                return `❌ PDF 读取失败：${result.error}`;
            }
            return await this.summarizeText(result.content, language);
        } catch (e) {
            return `❌ PDF 总结失败：${e.message}`;
        }
    }
}

module.exports = SummarizeSkill;