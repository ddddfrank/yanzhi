/**
 * AI助手集成脚本
 * 在主界面加载完成后注入AI助手
 */

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
    console.log('开始集成AI助手...');

    // 动态加载AI助手资源
    loadAIBot();
});

/**
 * 动态加载AI助手
 */
async function loadAIBot() {
    try {
        // 1. 加载CSS
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'aibot/aibot.css';
        document.head.appendChild(cssLink);

        // 2. 加载HTML内容
        const htmlResponse = await fetch('aibot/aibot.html');
        const htmlContent = await htmlResponse.text();

        // 3. 创建临时容器解析HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // 4. 提取AI助手的DOM元素
        const trigger = tempDiv.querySelector('#aibot-trigger');
        const window = tempDiv.querySelector('#aibot-window');

        // 5. 添加到页面
        document.body.appendChild(trigger);
        document.body.appendChild(window);

        // 6. 加载JavaScript（注意：由于HTML中已有script标签，会自动执行）
        // 这里只是为了确保加载完成
        const script = document.createElement('script');
        script.src = 'aibot/aibot.js';
        script.async = true;
        document.body.appendChild(script);

        console.log('AI助手资源加载完成');

        // 7. 等待AI助手初始化完成
        waitForAIBotInit();

    } catch (error) {
        console.error('加载AI助手失败:', error);
        showError('AI助手加载失败，请刷新页面重试');
    }
}

/**
 * 等待AI助手初始化完成
 */
function waitForAIBotInit() {
    let attempts = 0;
    const maxAttempts = 50; // 最多等待5秒

    const checkInterval = setInterval(() => {
        attempts++;

        if (window.yanzhiAIBot) {
            clearInterval(checkInterval);
            console.log('AI助手初始化成功');
            onAIBotReady();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error('AI助手初始化超时');
            showError('AI助手初始化超时，请检查控制台错误');
        }
    }, 100);
}

/**
 * AI助手准备就绪回调
 */
function onAIBotReady() {
    console.log('AI助手已就绪，可以开始使用');

    // 可以在这里添加额外的初始化逻辑
    // 例如：获取当前页面上下文、预加载问题等

    // 显示欢迎提示（可选）
    setTimeout(() => {
        showWelcomeTip();
    }, 2000);
}

/**
 * 显示欢迎提示
 */
function showWelcomeTip() {
    if (!sessionStorage.getItem('aibot_welcome_shown')) {
        const tip = document.createElement('div');
        tip.className = 'aibot-welcome-tip';
        tip.innerHTML = `
            <div class="aibot-welcome-content">
                <span class="aibot-welcome-icon">💡</span>
                <span class="aibot-welcome-text">遇到问题？点击右下角的AI助手获取帮助</span>
                <button class="aibot-welcome-close">知道了</button>
            </div>
        `;

        document.body.appendChild(tip);

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .aibot-welcome-tip {
                position: fixed;
                bottom: 100px;
                right: 100px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 20px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
                z-index: 10002;
                animation: slideIn 0.5s ease-out;
                max-width: 280px;
            }

            .aibot-welcome-content {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .aibot-welcome-icon {
                font-size: 24px;
            }

            .aibot-welcome-text {
                flex: 1;
                font-size: 14px;
                line-height: 1.5;
            }

            .aibot-welcome-close {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                padding: 4px 12px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }

            .aibot-welcome-close:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(50px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            @keyframes slideOut {
                from {
                    opacity: 1;
                    transform: translateX(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(50px);
                }
            }
        `;
        document.head.appendChild(style);

        // 关闭按钮事件
        const closeBtn = tip.querySelector('.aibot-welcome-close');
        closeBtn.addEventListener('click', () => {
            tip.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                tip.remove();
            }, 300);
            sessionStorage.setItem('aibot_welcome_shown', 'true');
        });

        // 5秒后自动关闭
        setTimeout(() => {
            if (document.body.contains(tip)) {
                tip.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => {
                    tip.remove();
                }, 300);
                sessionStorage.setItem('aibot_welcome_shown', 'true');
            }
        }, 5000);
    }
}

/**
 * 显示错误提示
 */
function showError(message) {
    console.error(message);

    // 在页面右上角显示错误提示
    const errorDiv = document.createElement('div');
    errorDiv.className = 'aibot-error-toast';
    errorDiv.textContent = message;

    const errorStyle = document.createElement('style');
    errorStyle.textContent = `
        .aibot-error-toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4757;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10003;
            animation: fadeInDown 0.3s ease-out;
            max-width: 300px;
        }

        @keyframes fadeInDown {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;

    document.head.appendChild(errorStyle);
    document.body.appendChild(errorDiv);

    // 3秒后移除
    setTimeout(() => {
        errorDiv.style.transition = 'opacity 0.3s, transform 0.3s';
        errorDiv.style.opacity = '0';
        errorDiv.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            errorDiv.remove();
            errorStyle.remove();
        }, 300);
    }, 3000);
}

/**
 * 供外部调用的API
 */
window.AIBotIntegration = {
    /**
     * 手动打开AI助手
     */
    open: () => {
        if (window.yanzhiAIBot) {
            window.yanzhiAIBot.open();
        } else {
            console.error('AI助手未初始化');
        }
    },

    /**
     * 手动关闭AI助手
     */
    close: () => {
        if (window.yanzhiAIBot) {
            window.yanzhiAIBot.close();
        }
    },

    /**
     * 直接发送问题
     */
    ask: (question) => {
        if (window.yanzhiAIBot) {
            window.yanzhiAIBot.input.value = question;
            window.yanzhiAIBot.sendMessage();
        } else {
            console.error('AI助手未初始化');
        }
    },

    /**
     * 检查AI助手是否可用
     */
    isReady: () => {
        return typeof window.yanzhiAIBot !== 'undefined';
    }
};

console.log('AI助手集成脚本已加载');
