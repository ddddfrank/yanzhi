import os
import sys
import json
import shutil
from datetime import datetime
from enum import Enum
from typing import Optional, Union
from PIL import Image

from ask_ai import AIClient, get_app_dir


class InputType(Enum):
    """输入模态类型"""
    TEXT = "text"
    IMAGE = "image"
    PDF = "pdf"


class ContentManager:
    """
    内容管理器：根据输入内容自动分类并保存到合适的文件夹
    """
    
    def __init__(self, config_path: str = None):
        """
        初始化内容管理器
        
        :param config_path: 文件夹结构配置文件路径，默认为 exe/脚本 同目录下的 folder_structure.json
        """
        if config_path is None:
            config_path = os.path.join(get_app_dir(), "folder_structure.json")
        self.config_path = config_path
        self.folder_config = self._load_folder_config()
        self.ai_client = AIClient(system_prompt="你是一个文件分类和内容管理助手。")
    
    def _load_folder_config(self) -> dict:
        """加载文件夹结构配置"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"⚠️ 配置文件 {self.config_path} 不存在，将创建空配置")
            return {"folders": []}
        except json.JSONDecodeError as e:
            print(f"❌ 配置文件格式错误: {e}")
            return {"folders": []}
    
    def reload_config(self):
        """重新加载配置文件（用于获取最新的文件夹列表）"""
        self.folder_config = self._load_folder_config()
        print(f"🔄 已重新加载配置，当前有 {len(self.folder_config.get('folders', []))} 个文件夹")
    
    def _save_folder_config(self):
        """保存文件夹结构配置"""
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(self.folder_config, f, ensure_ascii=False, indent=4)
    
    def _get_folder_descriptions(self) -> str:
        """获取所有文件夹的描述文本"""
        descriptions = []
        for folder in self.folder_config.get("folders", []):
            descriptions.append(f"- {folder['name']}: {folder['description']}")
        return "\n".join(descriptions)
    
    def _classify_content(self, content_description: str) -> Optional[dict]:
        """
        使用 AI 对内容进行分类，选择最合适的文件夹
        
        :param content_description: 内容描述（文本内容/图片描述/PDF标题摘要）
        :return: 分类结果 {"folder_name": ..., "reason": ...}
        """
        if not self.folder_config.get("folders"):
            print("⚠️ 没有可用的文件夹配置")
            return None
        
        folder_names = [f["name"] for f in self.folder_config["folders"]]
        folders_text = self._get_folder_descriptions()
        
        prompt = f"""请根据以下内容描述，从给定的文件夹中选择最合适的一个进行分类。

            内容描述:
            {content_description}

            可选文件夹:
            {folders_text}

            请只返回一个 JSON 格式的结果，包含以下字段：
            - folder_name: 选择的文件夹名称（必须是 {folder_names} 中的一个）
            - reason: 选择该文件夹的原因（简短说明）

            示例返回格式：
            {{"folder_name": "GAN", "reason": "该内容与生成对抗网络相关"}}
            """
        
        try:
            result_text = self.ai_client.ask(text=prompt, temperature=0.3, max_tokens=200)
            
            # 处理可能的 markdown 代码块
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()
            
            return json.loads(result_text)
        except Exception as e:
            print(f"❌ AI 分类失败: {e}")
            return None
    
    def _find_or_create_md_file(self, folder_path: str, folder_name: str) -> str:
        """
        查找或创建文件夹下的 markdown 文件
        
        :param folder_path: 文件夹路径
        :param folder_name: 文件夹名称
        :return: markdown 文件路径
        """
        # 优先查找笔记文件夹下的 md 文件
        notes_dir = os.path.join(folder_path, "笔记")
        if os.path.exists(notes_dir):
            md_files = [f for f in os.listdir(notes_dir) if f.endswith('.md')]
            if md_files:
                return os.path.join(notes_dir, md_files[0])
        
        # 查找根目录下的同名 md 文件
        root_md = os.path.join(folder_path, f"{folder_name}.md")
        if os.path.exists(root_md):
            return root_md
        
        # 如果都不存在，在笔记文件夹创建一个
        if not os.path.exists(notes_dir):
            os.makedirs(notes_dir)
        
        new_md_path = os.path.join(notes_dir, f"{folder_name}_笔记.md")
        with open(new_md_path, 'w', encoding='utf-8') as f:
            f.write(f"# {folder_name} 笔记\n\n")
        
        return new_md_path
    
    def _append_to_md(self, md_path: str, content: str):
        """向 markdown 文件末尾追加内容"""
        with open(md_path, 'a', encoding='utf-8') as f:
            f.write(f"\n{content}\n")
    
    def _save_image_and_get_md_ref(self, image: Union[str, Image.Image], folder_path: str) -> tuple:
        """
        保存图片并返回 markdown 引用格式
        
        :return: (保存路径, markdown引用文本)
        """
        # 创建 images 子文件夹
        images_dir = os.path.join(folder_path, "images")
        if not os.path.exists(images_dir):
            os.makedirs(images_dir)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"image_{timestamp}.png"
        save_path = os.path.join(images_dir, filename)
        
        if isinstance(image, str):
            # 如果是路径，复制文件
            shutil.copy(image, save_path)
        else:
            # 如果是 PIL Image，保存
            image.save(save_path, format="PNG")
        
        # 返回相对路径的 markdown 引用
        relative_path = f"images/{filename}"
        md_ref = f"![image]({relative_path})"
        
        return save_path, md_ref
    
    def save_content(self, input_type: InputType, content: Union[str, Image.Image], 
                     description: str = None, sub_folder: str = "文章") -> Optional[str]:
        """
        方法一：根据输入模态和内容，自动分类并保存到合适的位置
        
        :param input_type: 输入类型 (InputType.TEXT / InputType.IMAGE / InputType.PDF)
        :param content: 具体内容
                        - TEXT: 文本字符串
                        - IMAGE: PIL.Image 对象或图片文件路径
                        - PDF: PDF 文件路径
        :param description: 内容描述（可选，用于帮助 AI 分类）
        :param sub_folder: PDF 保存的子文件夹，默认 "文章"，也可以是 "博客"
        :return: 保存的文件路径，失败返回 None
        
        使用示例:
            manager = ContentManager()
            
            # 保存文本
            manager.save_content(InputType.TEXT, "这是关于GAN的笔记内容...")
            
            # 保存图片
            manager.save_content(InputType.IMAGE, "path/to/image.png", description="GAN架构图")
            
            # 保存PDF
            manager.save_content(InputType.PDF, "path/to/paper.pdf", description="GAN论文", sub_folder="文章")
        """
        
        # 0. 重新加载配置文件，确保获取最新的文件夹列表
        self.reload_config()
        
        # 1. 准备内容描述用于分类
        if description:
            content_desc = description
        elif input_type == InputType.TEXT:
            content_desc = content[:500] if len(content) > 500 else content
        elif input_type == InputType.IMAGE:
            # 用 AI 描述图片
            try:
                content_desc = self.ai_client.ask(
                    text="请简要描述这张图片的内容，用于文件分类。",
                    image=content,
                    max_tokens=200
                )
            except:
                content_desc = "一张图片"
        elif input_type == InputType.PDF:
            content_desc = f"PDF文件: {os.path.basename(content) if isinstance(content, str) else 'unknown.pdf'}"
        else:
            print("❌ 不支持的输入类型")
            return None
        
        # 2. AI 分类
        print("🤖 AI 正在分析内容并选择合适的文件夹...")
        classification = self._classify_content(content_desc)
        
        if not classification:
            print("⚠️ 分类失败")
            return None
        
        folder_name = classification.get("folder_name")
        reason = classification.get("reason", "")
        
        print(f"📂 分类结果: {folder_name}")
        print(f"   原因: {reason}")
        
        # 3. 查找目标文件夹路径
        target_folder = None
        for folder in self.folder_config["folders"]:
            if folder["name"] == folder_name:
                target_folder = folder["path"]
                break
        
        if not target_folder:
            print(f"⚠️ 未找到文件夹: {folder_name}")
            return None
        
        # 4. 根据类型处理内容
        if input_type == InputType.TEXT:
            # 文本：追加到 md 文件
            md_path = self._find_or_create_md_file(target_folder, folder_name)
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            entry = f"\n---\n### 📝 {timestamp}\n\n{content}\n\n> 🤖 AI 分类说明: {reason}\n"
            
            self._append_to_md(md_path, entry)
            print(f"✅ 文本已保存到: {md_path}")
            return md_path
        
        elif input_type == InputType.IMAGE:
            # 图片：保存图片并在 md 中插入引用
            md_path = self._find_or_create_md_file(target_folder, folder_name)
            save_path, md_ref = self._save_image_and_get_md_ref(content, target_folder)
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            
            # 如果 description 较长（超过100字符），将其作为图片解释一起插入
            if description and len(description) > 100:
                entry = f"\n---\n### 🖼️ {timestamp}\n\n{md_ref}\n\n#### 💡 AI 解读\n\n{description}\n\n> 🤖 AI 分类说明: {reason}\n"
            else:
                entry = f"\n---\n### 🖼️ {timestamp}\n\n{md_ref}\n\n> 🤖 AI 分类说明: {reason}\n"
            
            self._append_to_md(md_path, entry)
            print(f"✅ 图片已保存到: {save_path}")
            print(f"✅ 引用已添加到: {md_path}")
            return save_path
        
        elif input_type == InputType.PDF:
            # PDF：保存到文章/博客子文件夹
            if sub_folder not in ["文章", "博客"]:
                sub_folder = "文章"
            
            dest_dir = os.path.join(target_folder, sub_folder)
            if not os.path.exists(dest_dir):
                os.makedirs(dest_dir)
            
            original_filename = os.path.basename(content)
            dest_path = os.path.join(dest_dir, original_filename)
            
            # 如果目标文件已存在，添加时间戳
            if os.path.exists(dest_path):
                name, ext = os.path.splitext(original_filename)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                dest_path = os.path.join(dest_dir, f"{name}_{timestamp}{ext}")
            
            shutil.copy(content, dest_path)
            print(f"✅ PDF 已保存到: {dest_path}")
            return dest_path
        
        return None
    
    def create_folder(self, folder_name: str, base_path: str = None) -> Optional[str]:
        """
        方法二：新建文件夹，自动创建子文件夹结构并更新配置
        
        :param folder_name: 文件夹名称
        :param base_path: 基础路径，默认为当前工作目录
        :return: 创建的文件夹路径，失败返回 None
        
        自动创建的结构:
            folder_name/
            ├── 文章/
            ├── 博客/
            ├── images/
            └── folder_name.md
        
        使用示例:
            manager = ContentManager()
            manager.create_folder("Transformer", base_path="D:/CODE/yanzhi")
        """
        
        if base_path is None:
            base_path = os.getcwd()
        
        folder_path = os.path.join(base_path, folder_name)
        
        # 1. 检查文件夹是否已存在
        if os.path.exists(folder_path):
            print(f"⚠️ 文件夹已存在: {folder_path}")
            # 检查是否已在配置中
            for f in self.folder_config.get("folders", []):
                if f["name"] == folder_name:
                    print("   已在配置中，无需重复创建")
                    return folder_path
        
        # 2. 创建文件夹结构
        print(f"📁 正在创建文件夹: {folder_name}")
        
        try:
            os.makedirs(folder_path, exist_ok=True)
            os.makedirs(os.path.join(folder_path, "文章"), exist_ok=True)
            os.makedirs(os.path.join(folder_path, "博客"), exist_ok=True)
            os.makedirs(os.path.join(folder_path, "images"), exist_ok=True)
            
            # 创建同名 markdown 文件
            md_path = os.path.join(folder_path, f"{folder_name}.md")
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(f"# {folder_name}\n\n")
                f.write(f"> 创建时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")
                f.write("## 简介\n\n")
                f.write("## 笔记\n\n")
            
            print(f"   ✅ 创建子文件夹: 文章/, 博客/, images/")
            print(f"   ✅ 创建文件: {folder_name}.md")
            
        except Exception as e:
            print(f"❌ 创建文件夹失败: {e}")
            return None
        
        # 3. 用 AI 生成文件夹描述
        print("🤖 AI 正在生成文件夹描述...")
        
        prompt = f"""请为一个名为 "{folder_name}" 的学术研究文件夹生成一段简短的描述（50-100字）。
        这个文件夹用于存放相关的论文、images和博客。
        描述应该说明这个主题涉及的主要内容、技术或应用领域。

        请只返回描述文本，不要有其他内容。"""
        
        try:
            description = self.ai_client.ask(text=prompt, temperature=0.7, max_tokens=150)
            description = description.strip().strip('"').strip("'")
        except Exception as e:
            print(f"⚠️ AI 生成描述失败: {e}")
            description = f"{folder_name} 相关的论文、images和博客"
        
        print(f"   📝 描述: {description}")
        
        # 4. 更新配置文件
        new_folder_config = {
            "name": folder_name,
            "path": folder_path.replace("\\", "/"),
            "description": description
        }
        
        self.folder_config["folders"].append(new_folder_config)
        self._save_folder_config()
        
        print(f"   ✅ 已更新配置文件: {self.config_path}")
        print(f"\n✅ 文件夹创建完成: {folder_path}")
        
        return folder_path


# ================= 测试入口 =================

if __name__ == "__main__":
    print("="*60)
    print("     📚 内容管理器测试")
    print("="*60)
    
    try:
        manager = ContentManager()
        print("✅ 内容管理器初始化成功")
        print(f"   已加载 {len(manager.folder_config.get('folders', []))} 个文件夹配置")
        
        # 测试创建文件夹
        print("\n--- 测试创建文件夹 ---")
        # manager.create_folder("Transformer", base_path="D:/CODE/yanzhi")
        
        # 测试保存文本
        print("\n--- 测试保存文本 ---")
        # manager.save_content(InputType.TEXT, "这是一段关于生成对抗网络的笔记...")
        
    except Exception as e:
        print(f"❌ 错误: {e}")