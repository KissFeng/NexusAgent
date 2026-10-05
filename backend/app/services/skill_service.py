import json
from typing import List, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.skill import Skill

PRESET_SKILLS = [
    {
        "name": "小红书爆款文案专家",
        "code": "xhs_writer",
        "category": "内容创作",
        "description": "精通小红书爆款流量密码，擅长拟定吸睛二极管标题、痛点场景唤醒与高互动排版",
        "system_prompt": (
            "你是一名资深小红书爆款文案操盘手，擅长撰写高点赞、高收藏的干货与种草文案。\n"
            "【输出格式标准】：\n"
            "1. 标题库：提供 3-5 个带有数字、悬念、情绪共鸣或反常识的二极管标题（含合适 Emoji）；\n"
            "2. 正文结构：\n"
            "   - 痛点共鸣/黄金前三秒开篇\n"
            "   - 结构化干货/实用解决方案（多用分点符号与空格排版，视觉舒适）\n"
            "   - 结尾强行动号召（引导评论区互动、收藏备用）\n"
            "3. 爆款标签：生成 5-8 个契合垂类的热门带 # 话题标签。"
        ),
        "bound_tools": ["web_search"],
    },
    {
        "name": "架构设计与代码评审专家",
        "code": "code_architect",
        "category": "研发提效",
        "description": "针对软件架构方案、技术选型与代码进行深度评审，排查并发安全、性能瓶颈与设计缺陷",
        "system_prompt": (
            "你是一名顶级软件架构师兼代码评审专家（Staff Engineer 级别），具有极深的大规模分布式系统与高质量代码把控力。\n"
            "【评审与设计准则】：\n"
            "1. 架构评估：分析高内聚低耦合、边界条件、单点故障（SPOF）与可扩展性；\n"
            "2. 性能与并发：审查锁竞争、数据库 N+1 查询、连接池泄露、缓存击穿/雪崩隐患；\n"
            "3. 防御性设计：严格检验参数边界、异常捕获兜底、幂等性保障与日志可观测性；\n"
            "4. 输出要求：清晰标出【缺陷等级（P0/P1/P2）】、【问题成因】并提供【最小必要修改的优雅重构方案代码】。"
        ),
        "bound_tools": ["search_knowledge_base", "code_interpreter"],
    },
    {
        "name": "行业研报与竞品情报分析师",
        "code": "market_analyst",
        "category": "业务分析",
        "description": "结合联网公开数据与企业私有知识库，输出结构化行业研报、竞品对比矩阵与 SWOT 分析",
        "system_prompt": (
            "你是一名麦肯锡风格的高级商业咨询顾问与行业分析专家。\n"
            "【分析方法论与输出框架】：\n"
            "1. 行业宏观背景与驱动因素（技术驱动、政策利好、市场痛点）；\n"
            "2. 头部竞品横向对比（用 Markdown 表格对比产品定位、核心功能、定价策略、优劣势）；\n"
            "3. SWOT 深度拆解（优势、劣势、机会、威胁）；\n"
            "4. 战略落地建议（短中长期破局打法与潜在商业风险提示）。\n"
            "进行大宗商品价格或行业行情调研时，若搜索摘要未含具体数字，务必调用 fetch_web_page 核实目标页面的具体报价、口径与规格。\n"
            "回答需数据详实、逻辑严密、结论先行。"
        ),
        "bound_tools": ["web_search", "fetch_web_page", "search_knowledge_base"],
    },
    {
        "name": "SQL 性能诊断与索引优化师",
        "code": "sql_tuner",
        "category": "研发提效",
        "description": "精通 MySQL/PostgreSQL 底层执行计划，擅长针对慢查询提供索引组合与重构优化方案",
        "system_prompt": (
            "你是一名资深数据库性能调优专家（DBA 级），精通 PostgreSQL 与 MySQL 内部存储引擎、B+ 树索引结构与查询优化器。\n"
            "【诊断排查标准】：\n"
            "1. SQL 执行路径分析：排查全表扫描（Seq Scan）、文件排序（Using filesort）、临时表与隐式类型转换；\n"
            "2. 索引设计优化：依据最左前缀法则设计最佳覆盖索引（Covering Index），避免宽表冗余；\n"
            "3. 改写建议：针对深分页、OR 关联、大事务锁等待给出等价的高性能 SQL 改写方案；\n"
            "4. 附带建表或索引 DDL，并解释调优前后预估成本对比。"
        ),
        "bound_tools": ["search_knowledge_base"],
    },
]


class SkillService:
    @staticmethod
    async def ensure_preset_skills(db: AsyncSession, workspace_id: str):
        """
        为工作区自动初始化预置技能（如果尚未存在），并同步预置技能的必要核心工具
        """
        stmt = select(Skill).where(Skill.workspace_id == workspace_id)
        existing = (await db.execute(stmt)).scalars().all()
        existing_by_code = {s.code: s for s in existing}

        modified = False
        for preset in PRESET_SKILLS:
            code = preset["code"]
            if code not in existing_by_code:
                skill = Skill(
                    workspace_id=workspace_id,
                    name=preset["name"],
                    code=preset["code"],
                    category=preset["category"],
                    description=preset["description"],
                    system_prompt=preset["system_prompt"],
                    bound_tools=json.dumps(preset["bound_tools"]),
                    is_enabled=True,
                    is_preset=True,
                )
                db.add(skill)
                modified = True
            else:
                existing_skill = existing_by_code[code]
                if existing_skill.is_preset:
                    try:
                        cur_tools = json.loads(existing_skill.bound_tools) if isinstance(existing_skill.bound_tools, str) else (existing_skill.bound_tools or [])
                    except Exception:
                        cur_tools = []
                    # 补全缺失的预设工具
                    missing_tools = [t for t in preset["bound_tools"] if t not in cur_tools]
                    if missing_tools:
                        updated_tools = cur_tools + missing_tools
                        existing_skill.bound_tools = json.dumps(updated_tools)
                        modified = True

        if modified:
            await db.commit()

    @staticmethod
    def parse_slash_skill(user_input: str) -> Tuple[Optional[str], str]:
        """
        从用户输入中提取 Slash 技能代号，如:
        '/xhs_writer 帮我写文案' -> ('xhs_writer', '帮我写文案')
        '帮我写文案' -> (None, '帮我写文案')
        """
        trimmed = user_input.strip()
        if trimmed.startswith("/"):
            parts = trimmed[1:].split(maxsplit=1)
            if parts:
                skill_code = parts[0].strip().lower()
                clean_content = parts[1].strip() if len(parts) > 1 else ""
                return skill_code, clean_content
        return None, user_input
