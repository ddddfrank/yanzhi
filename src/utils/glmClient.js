/**
 * GLM API Client - 用于调用智谱清言 (Zhipu GLM) API
 * 
 * 使用方法:
 * const glmClient = require('./glmClient');
 * const response = await glmClient.chat('你好');
 */

require('dotenv').config();

const API_KEY = process.env.GLM_API_KEY;
const API_BASE = process.env.GLM_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
const MODEL = process.env.GLM_MODEL || 'glm-4-flash';
const TIMEOUT = parseInt(process.env.API_TIMEOUT || '30000');
const MAX_RETRIES = parseInt(process.env.API_MAX_RETRIES || '3');

class GLMClient {
    constructor() {
        if (!API_KEY) {
            throw new Error('GLM_API_KEY not found in environment variables. Please set it in .env file.');
        }
        this.apiKey = API_KEY;
        this.baseUrl = API_BASE;
        this.model = MODEL;
        this.retries = 0;
    }

    /**
     * 发送聊天请求到 GLM API
     * @param {string} message - 用户消息
     * @param {Object} options - 可选参数
     * @returns {Promise<Object>} API 响应
     */
    async chat(message, options = {}) {
        const {
            temperature = 0.7,
            max_tokens = 2000,
            top_p = 0.7,
            messages = null
        } = options;

        const requestMessages = messages || [
            { role: 'user', content: message }
        ];

        const payload = {
            model: this.model,
            messages: requestMessages,
            temperature,
            max_tokens,
            top_p
        };

        return this._request('/chat/completions', payload);
    }

    /**
     * 进行内部 API 请求
     * @private
     */
    async _request(endpoint, payload, retryCount = 0) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API Error (${response.status}): ${error}`);
            }

            return await response.json();
        } catch (error) {
            if (retryCount < MAX_RETRIES) {
                console.log(`Retry ${retryCount + 1}/${MAX_RETRIES}...`);
                await this._delay(1000 * (retryCount + 1)); // 指数退避
                return this._request(endpoint, payload, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * 延迟函数
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 流式请求（SSE）
     * @param {string} message - 用户消息  
     * @param {Function} onChunk - 每个数据块的回调函数
     */
    async *streamChat(message, options = {}) {
        const {
            temperature = 0.7,
            max_tokens = 2000,
            top_p = 0.7,
        } = options;

        const payload = {
            model: this.model,
            messages: [{ role: 'user', content: message }],
            temperature,
            max_tokens,
            top_p,
            stream: true
        };

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.choices?.[0]?.delta?.content) {
                            yield data.choices[0].delta.content;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }
    }
}

// 导出单例
module.exports = new GLMClient();

// 也导出类以便自定义配置
module.exports.GLMClient = GLMClient;

// 快速使用方式
module.exports.ask = async (question) => {
    const client = new GLMClient();
    const response = await client.chat(question);
    return response.choices[0].message.content;
};
