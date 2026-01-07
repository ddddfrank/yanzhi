import arxiv
from datetime import datetime
import textwrap

class ArxivRecommender:
    def __init__(self, max_results=5):
        """
        初始化 Arxiv 推荐器
        :param max_results: 每次推荐的文章数量，默认为 5
        """
        self.max_results = max_results
        # 实例化一个 Client，复用连接
        self.client = arxiv.Client(
            page_size=max_results,
            delay_seconds=3.0,
            num_retries=3
        )

    def get_latest_papers(self, query):
        """
        根据关键词获取最新论文
        :param query: 用户关心的领域关键词 (支持 AND, OR, NOT，例如: "LLM AND RAG")
        :return: 包含论文信息的列表
        """
        # 构造搜索对象
        # sort_by=arxiv.SortCriterion.SubmittedDate 确保是“最新”提交的
        search = arxiv.Search(
            query=query,
            max_results=self.max_results,
            sort_by=arxiv.SortCriterion.SubmittedDate,
            sort_order=arxiv.SortOrder.Descending
        )

        papers_data = []

        try:
            # 执行搜索
            results = self.client.results(search)
            
            for r in results:
                # 提取并清洗数据
                paper_info = {
                    "title": r.title.replace('\n', ' '),
                    "authors": ", ".join([a.name for a in r.authors]),
                    "published_date": r.published.strftime("%Y-%m-%d"),
                    "summary": r.summary.replace('\n', ' '), # 去除摘要中的换行符
                    "url": r.entry_id,
                    "pdf_url": r.pdf_url
                }
                papers_data.append(paper_info)
                
        except Exception as e:
            print(f"[错误] 获取 Arxiv 数据失败: {e}")
            return []

        return papers_data

    def format_display(self, papers):
        """
        将论文列表格式化打印
        """
        if not papers:
            print("未找到相关论文。")
            return

        print(f"\n{'='*20} 推荐结果 (Top {len(papers)}) {'='*20}\n")
        
        for idx, p in enumerate(papers, 1):
            print(f"[{idx}] {p['title']}")
            print(f"    📅 日期: {p['published_date']}")
            print(f"    👥 作者: {p['authors']}")
            print(f"    🔗 链接: {p['url']}")
            
            # 摘要稍微缩进并折行，防止刷屏
            summary_short = textwrap.shorten(p['summary'], width=200, placeholder="...")
            print(f"    📝 摘要: {summary_short}")
            print("-" * 60)

# ================= 主函数入口 =================

def main():
    print(">>> 提示：支持简单关键词，也支持逻辑符 (如: \"LLM AND (RAG OR Fine-tuning)\")")
    
    recommender = ArxivRecommender(max_results=5)
    
    while True:
        try:
            user_input = input("\n请输入你关心的领域/关键词 (输入 q 退出): ").strip()
            
            if user_input.lower() in ['q', 'quit', 'exit']:
                print("程序已退出。")
                break
            
            if not user_input:
                continue
                
            print(f"正在 Arxiv 上搜索关于 \"{user_input}\" 的最新论文...")
            papers = recommender.get_latest_papers(user_input)
            recommender.format_display(papers)
            
        except KeyboardInterrupt:
            print("\n程序已退出。")
            break

if __name__ == "__main__":
    main()