import json
import httpx
from typing import Dict, Any, List, Optional, Tuple


class MCPService:
    """
    Model Context Protocol (MCP) 工业级通信客户端
    1. 支持标准 SSE (Server-Sent Events) 与 HTTP POST JSON-RPC 2.0 双通信通道
    2. 支持标准 MCP 初始化握手 (initialize -> notifications/initialized -> tools/list)
    3. 支持自定义 HTTP Headers (Authorization, API Key, Token)
    4. 支持缺省默认参数注入 (Default Arguments Injection)，彻底解决 MCP 工具缺少参数问题
    5. 返回精准异常诊断与调试指引
    """

    @classmethod
    async def list_tools(
        cls,
        server_url: str,
        headers: Optional[Dict[str, str]] = None,
        protocol: str = "auto",
        timeout: float = 8.0,
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        向外部 MCP Server 发送探测请求并获取工具列表。
        返回: (tools_list, error_message)
        如果成功，error_message 为 None；如果失败，error_message 提供具体原因与排查建议。
        """
        clean_url = server_url.strip()
        if not clean_url:
            return [], "MCP 端点 URL 不能为空"

        req_headers = {"Content-Type": "application/json"}
        if headers and isinstance(headers, dict):
            for k, v in headers.items():
                if k and v:
                    req_headers[str(k).strip()] = str(v).strip()

        # 1. 尝试 SSE 通信 (若显式指定 sse 或 URL 中包含 /sse)
        is_sse_hint = (protocol == "sse") or ("/sse" in clean_url)
        if is_sse_hint:
            try:
                from mcp.client.sse import sse_client
                from mcp import ClientSession

                async with sse_client(url=clean_url, headers=req_headers, timeout=timeout) as (read_stream, write_stream):
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        list_res = await session.list_tools()
                        tools_out = []
                        for t in list_res.tools:
                            schema = t.inputSchema
                            if hasattr(schema, "model_dump"):
                                schema_dict = schema.model_dump()
                            elif isinstance(schema, dict):
                                schema_dict = schema
                            else:
                                schema_dict = {}
                            tools_out.append({
                                "name": t.name,
                                "description": t.description or "",
                                "inputSchema": schema_dict,
                            })
                        return tools_out, None
            except Exception as e:
                if protocol == "sse":
                    return [], f"SSE 协议连接失败 ({clean_url}): {str(e)}"
                # auto 模式下如果 SSE 失败，自动回退尝试 HTTP POST
                pass

        # 2. HTTP POST JSON-RPC 2.0 通道 (支持初始化握手与直接调用)
        try:
            async with httpx.AsyncClient(timeout=timeout, trust_env=False, headers=req_headers) as client:
                # 尝试标准 initialize 握手
                init_payload = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "agent-demo-mcp-client", "version": "1.0.0"},
                    },
                }

                try:
                    init_resp = await client.post(clean_url, json=init_payload)
                except httpx.ConnectError:
                    return [], f"无法连接到目标服务 ({clean_url})。请确认外部 MCP Server 已启动并处于监听状态。"
                except httpx.TimeoutException:
                    return [], f"请求端点超时 ({timeout}s)。请检查网络或服务响应情况。"
                except Exception as net_err:
                    return [], f"网络通信异常: {str(net_err)}"

                # 检查 HTTP 状态码
                if init_resp.status_code in [401, 403]:
                    return [], (
                        f"HTTP {init_resp.status_code} 认证失败：该 MCP 服务需要身份鉴权，"
                        f"请在配置的【自定义请求头】中填入 Authorization: Bearer <Token> 或 API Key。"
                    )
                elif init_resp.status_code == 404:
                    return [], (
                        f"HTTP 404 端点未找到：请检查 URL 路径是否正确。"
                        f"（注：若该服务遵循 SSE 传输标准，通常以 /sse 结尾，请尝试切换协议为 SSE）。"
                    )
                elif init_resp.status_code == 405:
                    # 405 Method Not Allowed - 通常意味着端点是 SSE GET 端点
                    try:
                        from mcp.client.sse import sse_client
                        from mcp import ClientSession

                        async with sse_client(url=clean_url, headers=req_headers, timeout=timeout) as (read_stream, write_stream):
                            async with ClientSession(read_stream, write_stream) as session:
                                await session.initialize()
                                list_res = await session.list_tools()
                                tools_out = []
                                for t in list_res.tools:
                                    schema = t.inputSchema
                                    schema_dict = schema.model_dump() if hasattr(schema, "model_dump") else (schema if isinstance(schema, dict) else {})
                                    tools_out.append({
                                        "name": t.name,
                                        "description": t.description or "",
                                        "inputSchema": schema_dict,
                                    })
                                return tools_out, None
                    except Exception as sse_err:
                        return [], f"HTTP 405：该端点不允许 POST 请求，尝试以 SSE 接入亦失败 ({str(sse_err)})。请检查 MCP 端点类型。"

                # 发送 tools/list 查询
                list_payload = {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/list",
                    "params": {},
                }
                list_resp = await client.post(clean_url, json=list_payload)
                if list_resp.status_code != 200:
                    return [], f"MCP 服务返回 HTTP {list_resp.status_code}: {list_resp.text[:200]}"

                try:
                    data = list_resp.json()
                except Exception:
                    return [], f"MCP 服务返回了非 JSON 格式内容: {list_resp.text[:200]}"

                if "error" in data:
                    err_info = data["error"]
                    err_msg = err_info.get("message", str(err_info)) if isinstance(err_info, dict) else str(err_info)
                    return [], f"MCP Server 报错: {err_msg}"

                result = data.get("result", {})
                tools_list = []
                if isinstance(result, list):
                    tools_list = result
                elif isinstance(result, dict) and "tools" in result:
                    tools_list = result["tools"]
                elif "tools" in data and isinstance(data["tools"], list):
                    tools_list = data["tools"]

                if not tools_list:
                    return [], f"MCP 服务响应成功，但 tools 列表为空。服务返回: {json.dumps(data, ensure_ascii=False)[:200]}"

                return tools_list, None

        except Exception as e:
            return [], f"探测 MCP 服务异常: {str(e)}"

    @classmethod
    async def call_tool(
        cls,
        server_url: str,
        tool_name: str,
        arguments: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
        default_params: Optional[Dict[str, Any]] = None,
        protocol: str = "auto",
        timeout: float = 20.0,
    ) -> str:
        """
        向外部 MCP Server 发送 tools/call 执行指定工具。
        自动合并配置的 default_params（补充工具缺少或必需的参数）。
        """
        clean_url = server_url.strip()
        req_headers = {"Content-Type": "application/json"}
        if headers and isinstance(headers, dict):
            for k, v in headers.items():
                if k and v:
                    req_headers[str(k).strip()] = str(v).strip()

        # 智能参数补充合并：
        # 1. 扁平默认值注入
        # 2. 通配默认值注入 default_params["*"]
        # 3. 指定工具专属默认值注入 default_params[tool_name]
        merged_args = {}
        if default_params and isinstance(default_params, dict):
            for k, v in default_params.items():
                if k != "*" and not isinstance(v, dict):
                    merged_args[k] = v
            if "*" in default_params and isinstance(default_params["*"], dict):
                merged_args.update(default_params["*"])
            if tool_name in default_params and isinstance(default_params[tool_name], dict):
                merged_args.update(default_params[tool_name])

        # Agent 推理提供的参数优先覆盖默认值
        if arguments and isinstance(arguments, dict):
            merged_args.update(arguments)

        # 检查是否为 SSE 模式
        is_sse = (protocol == "sse") or ("/sse" in clean_url)
        if is_sse:
            try:
                from mcp.client.sse import sse_client
                from mcp import ClientSession

                async with sse_client(url=clean_url, headers=req_headers, timeout=timeout) as (read_stream, write_stream):
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        call_res = await session.call_tool(tool_name, arguments=merged_args)
                        texts = []
                        for c in call_res.content:
                            if hasattr(c, "text") and c.text:
                                texts.append(c.text)
                            elif isinstance(c, dict) and "text" in c:
                                texts.append(c["text"])
                            elif isinstance(c, str):
                                texts.append(c)
                        output_str = "\n".join(texts) if texts else str(call_res)
                        return f"【MCP 服务执行成果 ({tool_name})】:\n{output_str}"
            except Exception as e:
                if protocol == "sse":
                    return f"❌ MCP SSE 执行失败 ({clean_url}): {str(e)}"

        # HTTP POST 通道
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": merged_args,
            },
            "id": 1,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout, trust_env=False, headers=req_headers) as client:
                resp = await client.post(clean_url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    if "error" in data:
                        err = data["error"]
                        err_msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                        return f"❌ MCP 执行报错: {err_msg}"

                    result = data.get("result", {})
                    content_list = result.get("content", [])
                    texts = []
                    for c in content_list:
                        if isinstance(c, dict) and "text" in c:
                            texts.append(c["text"])
                        elif isinstance(c, str):
                            texts.append(c)

                    output_str = "\n".join(texts) if texts else json.dumps(result, ensure_ascii=False)
                    return f"【MCP 工具调用成果 ({tool_name})】:\n{output_str}"
                else:
                    return f"❌ MCP Server 返回状态异常 (HTTP {resp.status_code}): {resp.text[:300]}"
        except Exception as e:
            return f"❌ 连接 MCP Server 失败 ({clean_url}): {str(e)}"
