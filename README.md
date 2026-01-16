# 研知科研助手 (Yanzhi Research Assistant)

研知科研助手是一款专为科研人员打造的智能化工具，旨在通过 AI 技术简化文献管理、笔记整理及知识体系构建流程，全面提升科研效率。

合作者：
@liulixin- [liulixin](https://github.com/liulixin)
@17825470707yx-sketch- [17825470707yx-sketch](https://github.com/17825470707yx-sketch)
@soulll1- [soulll1](https://github.com/soulll1)
@ZC_N- [ZC_N](https://github.com/ZC_N)



## 🚀 核心功能

| 功能模块 | 核心优势 |
| :--- | :--- |
| **网页信息精准获取** | 结合图片截取、网页保存与文本复制，灵活处理可见内容，支持图表与公式捕获。 |
| **文献/笔记自动整理** | AI 深度主导，利用多模态大模型自动完成繁琐的笔记整理工作，最大化减少人工干预。 |
| **定制化笔记模板** | 内置可视化模板构建器，协助用户快速建立标准化的科研笔记结构。（本功能尚未开发完毕） |
| **知识体系高效构建** | 采用多层文件夹设计，父文件夹作为宏观路径，子文件夹实现微观关联，满足复合型科研需求。 |

## 🛠️ 环境准备

在开始使用前，请确保您的系统已安装以下环境：
- **Node.js & npm**: 用于运行 Electron 客户端。
- **Python (建议 3.7+)**: 用于驱动后台 AI 脚本与数据处理。

## 📦 快速开始

1. **克隆仓库**：
   ```bash
   git clone https://github.com/ddddfrank/yanzhi.git
   cd yanzhi
   ```

2. **配置 Python 环境**：
   建议创建一个虚拟环境：
   ```bash
   python -m venv venv
   .\venv\Scripts\activate  # Windows
   pip install -r requirement.txt
   ```

3. **启动程序**：
   ```bash
   npm start
   ```

## ⚙️ 详细配置

### 1. API 配置
本软件默认使用硅基流动（SiliconCloud）提供的 **DeepSeek OCR + Qwen2.5 7B** 模型。
- 前往 [硅基流动官网](https://cloud.siliconflow.cn/) 注册并申请 API Key。
- 将申请到的 Key 填入 [tools/token.env](tools/token.env) 文件中。

### 2. 浏览器配置 (Edge)
程序需要通过远程调试端口操作浏览器以生成 PDF 或抓取内容。
- 右键点击 Edge 浏览器的桌面快捷方式，选择“属性”。
- 在“目标”栏的末尾添加 `--remote-debugging-port=9222`（注意前面有空格）。
- **注意**：启动浏览器时必须通过该快捷方式打开。如果报错，请在终端运行以下命令关闭所有 Edge 进程后重试：
  ```cmd
  taskkill /F /IM msedge.exe
  ```

### 3. 文件结构配置
在新环境下运行时，请按照以下步骤初始化：
- 清空 [tools/folder_structure/](tools/folder_structure/) 目录下的旧配置。
- 在软件界面中选择目标文件夹后，使用“新建文件夹”功能建立您的科研目录。

---
感谢使用研知科研助手！如有问题请查阅 [配置方法.md](配置方法.md) 或提交 Issue。
