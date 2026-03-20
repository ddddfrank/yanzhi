/**
 * GLM API 使用示例
 * 
 * 确保已配置 .env 文件中的 GLM_API_KEY、GLM_API_BASE 和 GLM_MODEL
 */

const glmClient = require('./glmClient');

/**
 * 示例 1: 基础聊天
 */
async function basicChat() {
    try {
        console.log('=== 示例 1: 基础聊天 ===');
        const response = await glmClient.chat('你好，请介绍一下自己');
        console.log('回复:', response.choices[0].message.content);
    } catch (error) {
        console.error('错误:', error.message);
    }
}

/**
 * 示例 2: 自定义参数
 */
async function customChat() {
    try {
        console.log('\n=== 示例 2: 自定义参数 ===');
        const response = await glmClient.chat('写一个简短的 Python 函数', {
            temperature: 0.3, // 更确定的输出
            max_tokens: 500,
            top_p: 0.5
        });
        console.log('回复:', response.choices[0].message.content);
    } catch (error) {
        console.error('错误:', error.message);
    }
}

/**
 * 示例 3: 多轮对话
 */
async function multiTurnChat() {
    try {
        console.log('\n=== 示例 3: 多轮对话 ===');

        const messages = [
            { role: 'user', content: '你是谁？' },
        ];

        // 第一轮
        const response1 = await glmClient.chat('', {
            messages: messages
        });
        const assistantMessage = response1.choices[0].message.content;
        console.log('助手:', assistantMessage);

        messages.push({ role: 'assistant', content: assistantMessage });
        messages.push({ role: 'user', content: '你能帮我做什么？' });

        // 第二轮
        const response2 = await glmClient.chat('', {
            messages: messages
        });
        console.log('助手:', response2.choices[0].message.content);
    } catch (error) {
        console.error('错误:', error.message);
    }
}

/**
 * 示例 4: 流式输出（如果 Node.js 支持异步生成器）
 */
async function streamChat() {
    try {
        console.log('\n=== 示例 4: 流式输出 ===');
        console.log('回复: ');

        for await (const chunk of glmClient.streamChat('讲一个笑话')) {
            process.stdout.write(chunk);
        }
        console.log('\n');
    } catch (error) {
        console.error('错误:', error.message);
    }
}

/**
 * 示例 5: 使用快速方法
 */
async function quickAsk() {
    try {
        console.log('\n=== 示例 5: 快速提问 ===');
        const answer = await glmClient.ask('1+1等于几?');
        console.log('回复:', answer);
    } catch (error) {
        console.error('错误:', error.message);
    }
}

/**
 * 主函数
 */
async function main() {
    console.log('GLM API 客户端使用示例\n');
    console.log('配置信息:');
    console.log('- 基础 URL:', process.env.GLM_API_BASE);
    console.log('- 模型:', process.env.GLM_MODEL);
    console.log('- 超时:', process.env.API_TIMEOUT, 'ms');
    console.log('- 最大重试:', process.env.API_MAX_RETRIES, '次\n');

    // 取消注释要运行的示例
    // await basicChat();
    // await customChat();
    // await multiTurnChat();
    // await streamChat();
    // await quickAsk();

    console.log('示例代码已准备好，请取消注释 main() 中的示例代码来运行。');
}

// 仅在直接运行此文件时执行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    basicChat,
    customChat,
    multiTurnChat,
    streamChat,
    quickAsk
};
