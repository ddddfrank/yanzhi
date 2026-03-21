# 研知科研助手 - API 配置指南

## 🔐 第一步：获取 API 密钥

### 推荐方案：SiliconFlow

1. 访问 [SiliconFlow 官网](https://cloud.siliconflow.cn/)
2. 注册账户并登录
3. 进入「API 密钥」管理页面
4. 创建新的 API 密钥
5. 复制密钥备用

### 备选方案：GitHub Models

1. 访问 [GitHub Models Marketplace](https://github.com/marketplace/models)
2. 确保您有 GitHub 账户并已启用 Models 功能
3. 生成 Personal Access Token
4. 赋予相应权限

---

## 📝 第二步：配置应用

### 方法A：编辑 token.env 文件

1. 解压应用后，找到 `data/` 文件夹
2. 打开或创建 `token.env` 文件
3. 填写您的 API 密钥：

```
$env:SILICONFLOW_API_KEY="sk-你的密钥"
```

或使用标准格式：
```
SILICONFLOW_API_KEY=sk-你的密钥
```

4. 保存文件
5. 重启应用

### 方法B：从模板复制（推荐）

1. 在 `data/` 文件夹中找到 `.env.example`
2. 复制该文件并重命名为 `token.env`
3. 使用文本编辑器打开 `token.env`
4. 替换 `你的API密钥` 为实际密钥
5. 保存并重启应用

---

## ✅ 第三步：测试配置

配置完成后，应用会自动：
- ✓ 加载 token.env 文件
- ✓ 初始化 AI 客户端
- ✓ 启用 OCR、论文搜索、内容总结等功能

如果功能无法正常使用，请检查：
- [ ] token.env 文件是否存在
- [ ] API 密钥是否复制正确
- [ ] API 账户是否有足够的配额
- [ ] 网络连接是否正常

---

## 🚨 重要提醒

⚠️ **安全警告**：
- 不要将 token.env 上传到公开的代码仓库
- 不要在公开场合或群聊中分享您的 API 密钥
- 定期检查 API 使用情况，防止异常消费

---

## 📂 文件结构示例

```
研知科研助手-win32-x64/
├── 研知科研助手.exe          ← 应用主程序
├── data/
│   ├── token.env             ← 您的配置文件（需要创建）
│   ├── .env.example          ← 配置模板
│   └── workspaces/           ← 工作区数据
├── resources/
├── package.json
└── ...其他文件
```

---

## 🆘 常见问题

**Q: 提示 "token.env 文件不存在" 怎么办？**
A: 这是正常提示。您需要手动创建 token.env 文件并填写 API 密钥。

**Q: 修改了 token.env 但不生效？**
A: 需要完全关闭应用后重新启动，应用会在启动时读取配置。

**Q: 支持多个 API 提供商吗？**
A: 目前主要支持 SiliconFlow 和 GitHub Models，应用会自动尝试其中可用的。

**Q: 如何更换另一个 API 密钥？**
A: 编辑 token.env 文件，替换密钥内容，保存并重启应用。

---

## 📞 获取帮助

如有问题，请：
1. 检查网络连接
2. 验证 API 密钥有效性
3. 查看应用日志
4. 联系技术支持
