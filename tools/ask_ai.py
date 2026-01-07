import os
import sys
import base64
import io
import re

# ================= Windows 编码修复 =================
# 解决 PyInstaller 打包后 emoji 输出乱码问题
if sys.platform == 'win32':
    try:
        # 强制 stdout/stderr 使用 UTF-8 编码
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        # Python < 3.7 或其他情况
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, errors='replace')
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, errors='replace')

from openai import OpenAI
from PIL import Image

# ================= 路径工具 =================

def get_app_dir():
    """
    获取应用程序所在目录
    - 开发时: 返回脚本所在目录
    - 打包后: 返回 exe 所在目录
    """
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后
        return os.path.dirname(sys.executable)
    else:
        # 开发模式
        return os.path.dirname(os.path.abspath(__file__))


# ================= 环境变量加载 =================

def load_env_file(env_path: str = None):
    """
    从 token.env 文件加载环境变量（支持 PowerShell 格式）
    
    :param env_path: env 文件路径，默认为 exe/脚本 同目录下的 token.env
    """
    if env_path is None:
        env_path = os.path.join(get_app_dir(), "token.env")
    
    if not os.path.exists(env_path):
        return
    
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                # 匹配 PowerShell 格式: $env:VAR_NAME = "value" 或 $env:VAR_NAME="value"
                match = re.match(r'\$env:(\w+)\s*=\s*["\']?([^"\']+)["\']?', line)
                if match:
                    key, value = match.groups()
                    os.environ[key] = value.strip()
                    continue
                
                # 匹配标准格式: VAR_NAME=value
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    os.environ[key] = value
    except Exception as e:
        print(f"⚠️ 加载环境变量文件失败: {e}")


# 启动时自动加载环境变量
load_env_file()


# ================= AI 客户端类 =================

class AIClient:
    """
    多模态 AI 客户端，支持文本和图片输入
    自动检测可用的 API（优先 GitHub GPT-4o，其次硅基流动）
    对于不支持视觉的模型，使用 OCR + 文本模型的方式处理图片
    """
    
    # 类变量：缓存已验证的客户端配置
    _verified_config = None
    _current_model_display = None
    _ocr_config = None  # OCR 模型配置
    
    # 支持视觉的模型列表
    VLM_MODELS = [
        "gpt-4o", "gpt-4-vision", "gpt-4-turbo",
        "qwen-vl", "qwen2-vl", "Qwen2.5-VL",
        "deepseek-vl", "glm-4v",
    ]
    
    def __init__(self, system_prompt: str = "你是一个乐于助人的AI助手。"):
        """
        初始化 AI 客户端，自动选择可用的 API
        
        优先级：
        1. SILICONFLOW_API_KEY (硅基流动 - Qwen，速度快)
        2. GITHUB_TOKEN (GitHub Models - GPT-4o)
        """
        self.system_prompt = system_prompt
        
        # 如果已有验证过的配置，直接使用
        if AIClient._verified_config:
            config = AIClient._verified_config
            self.token = config['token']
            self.endpoint = config['endpoint']
            self.model_name = config['model_name']
            self.is_vlm = config.get('is_vlm', False)
            self.client = OpenAI(base_url=self.endpoint, api_key=self.token)
            return
        
        # 首次初始化：测试可用的 API
        self._init_with_test()
    
    def _is_vlm_model(self, model_name: str) -> bool:
        """检查模型是否支持视觉（VLM）"""
        model_lower = model_name.lower()
        for vlm in self.VLM_MODELS:
            if vlm.lower() in model_lower:
                return True
        return False
    
    def _init_with_test(self):
        """测试并初始化可用的 API"""
        
        # API 配置列表（按优先级排序）
        api_configs = []
        # 1. SiliconFlow (备用 - Qwen2.5-7B 是纯文本模型)
        if os.environ.get("SILICONFLOW_API_KEY"):
            api_configs.append({
                'name': 'SiliconFlow',
                'token': os.environ.get("SILICONFLOW_API_KEY"),
                'endpoint': "https://api.siliconflow.cn/v1",
                'model_name': "Qwen/Qwen2.5-7B-Instruct",
                'display': "🚀 硅基流动 Qwen2.5-7B + OCR",
                'is_vlm': False
            })
        # 2. GitHub Models (优先 - GPT-4o 支持视觉)
        if os.environ.get("GITHUB_TOKEN"):
            api_configs.append({
                'name': 'GitHub',
                'token': os.environ.get("GITHUB_TOKEN"),
                'endpoint': "https://models.github.ai/inference",
                'model_name': "openai/gpt-4o",
                'display': "🐙 GitHub GPT-4o (VLM)",
                'is_vlm': True
            })

        
        if not api_configs:
            raise ValueError("请设置环境变量: SILICONFLOW_API_KEY 或 GITHUB_TOKEN")
        
        # 逐个测试 API
        for config in api_configs:
            try:
                print(f"🔍 测试 {config['name']} API...")
                client = OpenAI(base_url=config['endpoint'], api_key=config['token'])
                
                # 发送测试请求
                response = client.chat.completions.create(
                    messages=[
                        {"role": "user", "content": "hi"}
                    ],
                    temperature=0.1,
                    max_tokens=5,
                    model=config['model_name']
                )
                
                # 测试成功
                print(f"✅ {config['name']} API 可用")
                
                self.token = config['token']
                self.endpoint = config['endpoint']
                self.model_name = config['model_name']
                self.is_vlm = config.get('is_vlm', False)
                self.client = client
                
                # 缓存配置
                AIClient._verified_config = config
                AIClient._current_model_display = config['display']
                
                # 如果不是 VLM，初始化 OCR 配置
                if not self.is_vlm:
                    self._init_ocr()
                
                return
                
            except Exception as e:
                print(f"❌ {config['name']} API 不可用: {e}")
                continue
        
        raise RuntimeError("所有 API 均不可用，请检查网络或 API Key")
    
    def _init_ocr(self):
        """初始化 OCR 模型（用于非 VLM 模型处理图片）"""
        # 使用硅基流动的 DeepSeek-OCR
        if os.environ.get("SILICONFLOW_API_KEY"):
            AIClient._ocr_config = {
                'token': os.environ.get("SILICONFLOW_API_KEY"),
                'endpoint': "https://api.siliconflow.cn/v1",
                'model_name': "deepseek-ai/DeepSeek-OCR"
            }
            print("📷 已配置 DeepSeek-OCR 用于图片文字识别")
        else:
            print("⚠️ 未配置 SILICONFLOW_API_KEY，图片识别功能不可用")
    
    def _ocr_image(self, image) -> str:
        """
        使用 OCR 模型识别图片中的文字
        
        :param image: PIL.Image 对象或图片文件路径
        :return: 识别出的文字内容
        """
        if not AIClient._ocr_config:
            return "[OCR 未配置，无法识别图片内容]"
        
        try:
            # 转换图片为 base64
            data_url = self._image_to_base64(image)
            
            # 创建 OCR 客户端
            ocr_client = OpenAI(
                base_url=AIClient._ocr_config['endpoint'],
                api_key=AIClient._ocr_config['token']
            )
            
            # 调用 OCR 模型
            response = ocr_client.chat.completions.create(
                model=AIClient._ocr_config['model_name'],
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": data_url
                                }
                            },
                            {
                                "type": "text",
                                "text": "请识别并输出图片中的所有文字内容，保持原有格式和结构。如果图片中包含公式、代码或表格，请尽量保持其格式。"
                            }
                        ]
                    }
                ],
                max_tokens=4096
            )
            
            ocr_text = response.choices[0].message.content
            print(f"📷 OCR 识别完成，识别到 {len(ocr_text)} 字符")
            print(f"--- OCR 识别内容 开始 ---\n{ocr_text}\n--- OCR 识别内容 结束 ---")
            return ocr_text
            
        except Exception as e:
            print(f"❌ OCR 识别失败: {e}")
            return f"[OCR 识别失败: {e}]"
    
    @classmethod
    def get_current_model_display(cls) -> str:
        """获取当前使用的模型显示名称"""
        return cls._current_model_display or "未初始化"
    
    def _image_to_base64(self, image) -> str:
        """
        将图片转换为 base64 编码的 data URL
        
        :param image: PIL.Image 对象或图片文件路径
        :return: data URL 字符串
        """
        if isinstance(image, str):
            # 如果是文件路径，先加载图片
            image = Image.open(image)
        
        # 转换为 RGB 避免 RGBA 问题
        if image.mode in ('RGBA', 'LA'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            background.paste(image, image.split()[-1] if image.mode == 'RGBA' else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        buffered = io.BytesIO()
        image.save(buffered, format="JPEG", quality=85)
        img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{img_base64}"
    
    def ask(self, text: str = None, image = None, 
            temperature: float = 0.7, max_tokens: int = 2000) -> str:
        """
        向 AI 发送请求，支持文本和/或图片输入
        
        :param text: 文本输入（可选）
        :param image: 图片输入，可以是 PIL.Image 对象或图片路径（可选）
        :param temperature: 生成温度，控制随机性
        :param max_tokens: 最大生成 token 数
        :return: AI 的回复文本
        """
        if text is None and image is None:
            raise ValueError("text 和 image 至少需要提供一个")
        
        # 如果有图片但当前模型不是 VLM，使用 OCR 提取文字
        ocr_text = None
        if image and not getattr(self, 'is_vlm', False):
            print("📷 当前模型不支持视觉，使用 OCR 识别图片...")
            ocr_text = self._ocr_image(image)
            # OCR 后不再需要图片
            image = None
        
        # 构建用户消息内容
        content = []
        
        # 添加原始文本
        if text:
            content.append({
                "type": "text",
                "text": text
            })
        
        # 如果有 OCR 识别的文字，添加到内容中
        if ocr_text:
            ocr_prompt = f"\n\n【图片 OCR 识别内容】:\n{ocr_text}\n\n请根据以上图片中识别出的内容进行分析和回答。"
            if text:
                # 追加到现有文本
                content[0]["text"] = text + ocr_prompt
            else:
                # 作为新文本
                content.append({
                    "type": "text",
                    "text": ocr_prompt.strip()
                })
        
        # 如果是 VLM 且有图片，添加图片
        if image and getattr(self, 'is_vlm', False):
            try:
                data_url = self._image_to_base64(image)
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": data_url
                    }
                })
            except Exception as e:
                print(f"⚠️ 图片处理失败: {e}")
        
        # 如果只有文本，简化内容格式
        if len(content) == 1 and content[0]["type"] == "text":
            user_content = content[0]["text"]
        else:
            user_content = content
        
        try:
            response = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": self.system_prompt,
                    },
                    {
                        "role": "user",
                        "content": user_content,
                    }
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                model=self.model_name
            )
            return response.choices[0].message.content
        except Exception as e:
            raise RuntimeError(f"AI 请求失败: {e}")


# ================= 便捷函数 =================

_default_client = None

def ask_ai(text: str = None, image = None, 
           system_prompt: str = "你是一个乐于助人的AI助手。",
           temperature: float = 0.7, max_tokens: int = 2000) -> str:
    """
    便捷函数：向 AI 发送请求
    
    :param text: 文本输入（可选）
    :param image: 图片输入，可以是 PIL.Image 对象或图片路径（可选）
    :param system_prompt: 系统提示词
    :param temperature: 生成温度
    :param max_tokens: 最大生成 token 数
    :return: AI 的回复文本
    
    使用示例:
        from ask_ai import ask_ai
        
        # 仅文本
        response = ask_ai(text="什么是深度学习？")
        
        # 仅图片
        response = ask_ai(image="screenshot.png")
        
        # 文本 + 图片
        from PIL import Image
        img = Image.open("chart.png")
        response = ask_ai(text="解释这个图表", image=img)
    """
    global _default_client
    
    if _default_client is None or _default_client.system_prompt != system_prompt:
        _default_client = AIClient(system_prompt=system_prompt)
    
    return _default_client.ask(text=text, image=image, 
                                temperature=temperature, max_tokens=max_tokens)


# ================= 测试入口 =================

if __name__ == "__main__":
    # 简单测试
    try:
        print("=" * 50)
        print("🔧 AI 客户端初始化测试")
        print("=" * 50)
        
        client = AIClient()
        print(f"\n✅ 初始化成功！当前模型: {AIClient.get_current_model_display()}")
        print(f"   是否 VLM: {client.is_vlm}")
        
        # 测试纯文本
        print("\n--- 测试纯文本 ---")
        response = client.ask(text="用一句话介绍什么是GAN", max_tokens=100)
        print(f"回复: {response}")
        
        # 如果有 OCR 配置，测试 OCR 功能
        if AIClient._ocr_config:
            print("\n--- OCR 配置已就绪 ---")
            print(f"OCR 模型: {AIClient._ocr_config['model_name']}")
        
    except ValueError as e:
        print(f"❌ 初始化失败: {e}")
    except Exception as e:
        print(f"❌ 请求失败: {e}")