import json
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db, AsyncSessionLocal
from app.models.workspace import Workspace
from app.models.tool import ToolConfig
from app.models.governance import WebhookConfig
from app.services.feishu_service import FeishuService
from app.services.audit_service import AuditService
from app.schemas.tool import (
    ToolConfigCreateRequest,
    ToolConfigUpdateRequest,
    ToolConfigResponse,
    TestMCPRequest,
    TestMCPResponse,
)
from app.api.deps import get_current_workspace

router = APIRouter(prefix="/tools", tags=["Tools"])

DEFAULT_BUILTIN_TOOLS = [
    {
        "tool_type": "web_search",
        "name": "实时联网搜索 (Web Search)",
        "description": "通过搜索引擎查询互联网公开实时资讯、官方文档与最新数据",
        "config": {},
        "is_enabled": True,
    },
    {
        "tool_type": "code_interpreter",
        "name": "Python 代码沙箱 (Code Interpreter)",
        "description": "在受控隔离沙箱环境中执行 Python 代码并输出运行结果，支持数学运算与数据统计",
        "config": {},
        "is_enabled": True,
    },
    {
        "tool_type": "mcp_server",
        "name": "示例 MCP 服务 (Model Context Protocol)",
        "description": "遵循 Anthropic MCP 协议标准的外部服务（支持 tools/list 工具发现与 tools/call 远程调用）",
        "config": {
            "server_url": "http://127.0.0.1:8000/api/v1/tools/mcp-mock",
            "protocol": "jsonrpc-2.0",
        },
        "is_enabled": True,
    },
    {
        "tool_type": "mcp_server",
        "name": "外部渠道与 Webhook 广播服务 (MCP)",
        "description": "基于 MCP 协议的外部协同通讯服务，支持向已配置的飞书群、企业微信群或 Webhook 推送通知与播报",
        "config": {
            "server_url": "http://127.0.0.1:8000/api/v1/tools/mcp-webhooks",
            "protocol": "jsonrpc-2.0",
        },
        "is_enabled": True,
    },
]


@router.get("", response_model=List[ToolConfigResponse])
async def list_tools(
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    # 初始化内置基础工具
    stmt = select(ToolConfig).where(ToolConfig.workspace_id == workspace.id)
    existing = (await db.execute(stmt)).scalars().all()
    existing_types = {t.tool_type for t in existing}

    added = False
    for builtin in DEFAULT_BUILTIN_TOOLS:
        if builtin["tool_type"] not in existing_types:
            tool = ToolConfig(
                workspace_id=workspace.id,
                tool_type=builtin["tool_type"],
                name=builtin["name"],
                description=builtin["description"],
                config_json=json.dumps(builtin["config"]),
                is_enabled=builtin["is_enabled"],
            )
            db.add(tool)
            added = True

    if added:
        await db.commit()
        existing = (await db.execute(stmt)).scalars().all()

    return [ToolConfigResponse.from_orm_model(t) for t in existing]


@router.post("", response_model=ToolConfigResponse)
async def create_tool(
    req: ToolConfigCreateRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权创建工具配置")

    tool = ToolConfig(
        workspace_id=workspace.id,
        tool_type=req.tool_type,
        name=req.name,
        description=req.description,
        config_json=json.dumps(req.config),
        is_enabled=req.is_enabled,
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return ToolConfigResponse.from_orm_model(tool)


@router.put("/{tool_id}", response_model=ToolConfigResponse)
async def update_tool(
    tool_id: str,
    req: ToolConfigUpdateRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改工具配置")

    stmt = select(ToolConfig).where(ToolConfig.id == tool_id, ToolConfig.workspace_id == workspace.id)
    tool = (await db.execute(stmt)).scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工具不存在")

    if req.name is not None:
        tool.name = req.name
    if req.description is not None:
        tool.description = req.description
    if req.config is not None:
        tool.config_json = json.dumps(req.config)
    if req.is_enabled is not None:
        tool.is_enabled = req.is_enabled

    await db.commit()
    await db.refresh(tool)
    return ToolConfigResponse.from_orm_model(tool)


@router.delete("/{tool_id}")
async def delete_tool(
    tool_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除工具配置")

    stmt = select(ToolConfig).where(ToolConfig.id == tool_id, ToolConfig.workspace_id == workspace.id)
    tool = (await db.execute(stmt)).scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工具不存在")

    await db.delete(tool)
    await db.commit()
    return {"message": "工具已删除"}


@router.post("/test-mcp", response_model=TestMCPResponse)
async def test_mcp_server(
    req: TestMCPRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
):
    from app.services.mcp_service import MCPService
    tools, err_msg = await MCPService.list_tools(
        server_url=req.server_url,
        headers=req.headers,
        protocol=req.protocol or "auto",
    )
    if err_msg is None:
        return TestMCPResponse(
            success=True,
            tools=tools,
            message=f"连接成功！该 MCP Server 成功汇报了 {len(tools)} 个标准工具。",
        )
    else:
        return TestMCPResponse(
            success=False,
            tools=[],
            message=err_msg,
        )


@router.post("/mcp-mock")
async def mock_mcp_endpoint(payload: dict):
    """
    内置官方演示 MCP Server (符合 Model Context Protocol 规范)
    用于开箱即用地体验 MCP tools/list 发现与 tools/call 执行
    """
    method = payload.get("method")
    msg_id = payload.get("id", 1)

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {"listChanged": False}
                },
                "serverInfo": {
                    "name": "enterprise-agent-demo-mcp",
                    "version": "1.0.0"
                }
            },
            "id": msg_id,
        }
    elif method == "notifications/initialized":
        return {"jsonrpc": "2.0", "result": {}, "id": msg_id}
    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "result": {
                "tools": [
                    {
                        "name": "fetch_city_weather",
                        "description": "查询指定城市的实时气象与空气指数 (MCP 协议服务)",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "city": {"type": "string", "description": "目标城市中文名，如北京、上海、深圳"}
                            },
                            "required": ["city"],
                        },
                    },
                    {
                        "name": "query_inventory_db",
                        "description": "查询企业实时物资库存数据库 (MCP 只读数据服务)",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "category": {"type": "string", "description": "库存物资品类名称"}
                            },
                            "required": ["category"],
                        },
                    },
                ]
            },
            "id": msg_id,
        }
    elif method == "tools/call":
        params = payload.get("params", {})
        tool_name = params.get("name")
        args = params.get("arguments", {})
        if tool_name == "fetch_city_weather":
            city = args.get("city", "未知")
            content = f"【MCP 服务实时响应】: {city}当前晴朗，气温 22℃，湿度 45%，空气质量优。"
        elif tool_name == "query_inventory_db":
            category = args.get("category", "默认")
            content = f"【MCP 数据库响应】: 品类【{category}】当前在库数量为 1,280 件，仓位 A-03，周转正常。"
        else:
            content = f"【MCP 服务响应】: 工具 {tool_name} 执行成功，接收参数: {json.dumps(args, ensure_ascii=False)}"

        return {
            "jsonrpc": "2.0",
            "result": {
                "content": [
                    {"type": "text", "text": content}
                ]
            },
            "id": msg_id,
        }

    return {
        "jsonrpc": "2.0",
        "error": {"code": -32601, "message": "Method not found"},
        "id": msg_id,
    }


@router.post("/mcp-webhooks")
async def mcp_webhooks_endpoint(payload: dict, request: Request):
    """
    外部渠道与 Webhook 机器人的标准 MCP Server (Model Context Protocol)
    1. 遵循标准 JSON-RPC 2.0 通信协议
    2. 支持 tools/list 发现：send_channel_message, list_channels, test_channel
    3. 支持 tools/call 真实执行：向飞书群、企业微信群或 Webhook URL 异步推送消息
    """
    import json
    method = payload.get("method")
    msg_id = payload.get("id", 1)
    workspace_id = request.headers.get("X-Workspace-Id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {"listChanged": False}
                },
                "serverInfo": {
                    "name": "webhook-notification-mcp",
                    "version": "1.0.0"
                }
            },
            "id": msg_id,
        }

    elif method == "notifications/initialized":
        return {"jsonrpc": "2.0", "result": {}, "id": msg_id}

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "result": {
                "tools": [
                    {
                        "name": "send_channel_message",
                        "description": "向工作空间已配置的外部渠道（飞书群、企业微信群或 Webhook 机器人）发送通知或播报消息",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "content": {
                                    "type": "string",
                                    "description": "要发送的消息正文内容 (支持纯文本或 Markdown 格式)"
                                },
                                "channel_name": {
                                    "type": "string",
                                    "description": "目标渠道名称（可选，如'飞书研发部答疑助手'。若不传，默认推送到首个启用的外部渠道）"
                                },
                                "title": {
                                    "type": "string",
                                    "description": "消息标题或卡片抬头（可选）"
                                }
                            },
                            "required": ["content"],
                        },
                    },
                    {
                        "name": "list_channels",
                        "description": "查询当前工作空间已配置并激活的外部通讯渠道列表（包含渠道名称、平台类型及配置状态）",
                        "inputSchema": {
                            "type": "object",
                            "properties": {},
                        },
                    },
                    {
                        "name": "test_channel",
                        "description": "对指定的外部渠道或群机器人执行网络握手与连通性测试",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "channel_name": {
                                    "type": "string",
                                    "description": "要测试连通性的目标渠道名称 (可选，默认测试首个可用渠道)"
                                }
                            },
                        },
                    },
                ]
            },
            "id": msg_id,
        }

    elif method == "tools/call":
        params = payload.get("params", {})
        tool_name = params.get("name")
        args = params.get("arguments", {})

        async with AsyncSessionLocal() as session:
            # 1. 查询渠道配置
            stmt = select(WebhookConfig).where(WebhookConfig.is_active == True)
            if workspace_id:
                stmt = stmt.where(WebhookConfig.workspace_id == workspace_id)
            res = await session.execute(stmt)
            channels = res.scalars().all()

            if tool_name == "list_channels":
                if not channels:
                    content = "当前空间尚未配置任何启用的外部渠道或 Webhook 机器人。请前往【运营治理】->【外部渠道】添加。"
                else:
                    ch_list = [
                        {
                            "name": c.name,
                            "type": c.channel_type.upper(),
                            "has_webhook_url": bool(c.webhook_url),
                            "has_app_credentials": bool(c.app_id and c.app_secret),
                        }
                        for c in channels
                    ]
                    content = f"【当前已配置的外部渠道 ({len(channels)} 个)】:\n" + json.dumps(ch_list, ensure_ascii=False, indent=2)

            elif tool_name == "send_channel_message":
                target_name = args.get("channel_name")
                msg_body = args.get("content", "").strip()
                title = args.get("title")

                if not msg_body:
                    content = "发送失败：消息正文内容 (content) 不能为空。"
                elif not channels:
                    content = "发送失败：当前空间未找到任何已激活的外部渠道，请先在运营治理面板中配置飞书/企微机器人。"
                else:
                    target_ch = None
                    if target_name:
                        for c in channels:
                            if target_name.lower() in c.name.lower():
                                target_ch = c
                                break
                    if not target_ch:
                        target_ch = channels[0]  # 默认使用首个可用渠道

                    full_text = f"【{title}】\n\n{msg_body}" if title else msg_body
                    success = False

                    # 尝试推送
                    if target_ch.webhook_url:
                        success = await FeishuService.send_webhook_bot(
                            channel_type=target_ch.channel_type,
                            webhook_url=target_ch.webhook_url,
                            text_content=full_text,
                        )
                    elif target_ch.app_id and target_ch.app_secret:
                        # 若仅有 app_id 则提示缺少群 ID
                        content = f"渠道 [{target_ch.name}] 为企业应用模式，暂未配置目标群 ID (chat_id)。建议配置群机器人 Webhook URL。"
                        return {
                            "jsonrpc": "2.0",
                            "result": {"content": [{"type": "text", "text": content}]},
                            "id": msg_id,
                        }

                    if success:
                        content = f"✅ 已成功将消息推送到外部渠道 [{target_ch.name}] ({target_ch.channel_type.upper()})！\n推送摘要: {full_text[:100]}..."
                        # 记录审计
                        await AuditService.log_action(
                            db=session,
                            workspace_id=target_ch.workspace_id,
                            action="mcp.webhook.send",
                            resource_type="webhook",
                            resource_id=target_ch.id,
                            details={"channel": target_ch.name, "text_len": len(full_text)},
                        )
                    else:
                        content = f"❌ 消息推送到渠道 [{target_ch.name}] 失败，请检查网络或该机器人的 Webhook URL 是否有效。"

            elif tool_name == "test_channel":
                target_name = args.get("channel_name")
                if not channels:
                    content = "未找到可供测试的渠道配置。"
                else:
                    target_ch = channels[0]
                    if target_name:
                        for c in channels:
                            if target_name.lower() in c.name.lower():
                                target_ch = c
                                break
                    if target_ch.webhook_url:
                        test_str = f"【MCP 测试握手】渠道 [{target_ch.name}] 连通性测试正常！"
                        ok = await FeishuService.send_webhook_bot(target_ch.channel_type, target_ch.webhook_url, test_str)
                        content = f"渠道 [{target_ch.name}] 测试结果: {'✅ 成功送达' if ok else '❌ 连接失败'}"
                    else:
                        content = f"渠道 [{target_ch.name}] 未配置 Webhook URL，无法执行推流测试。"

            else:
                content = f"未知的 MCP 工具名称: {tool_name}"

        return {
            "jsonrpc": "2.0",
            "result": {
                "content": [
                    {"type": "text", "text": content}
                ]
            },
            "id": msg_id,
        }

    return {
        "jsonrpc": "2.0",
        "error": {"code": -32601, "message": "Method not found"},
        "id": msg_id,
    }
