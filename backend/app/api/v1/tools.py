import json
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.workspace import Workspace
from app.models.tool import ToolConfig
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
