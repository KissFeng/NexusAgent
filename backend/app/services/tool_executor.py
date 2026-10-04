import io
import sys
import json
import re
import urllib.parse
import httpx
from typing import Dict, Any, List, Optional


class ToolExecutor:
    @staticmethod
    async def execute_web_search(query: str, max_results: int = 4) -> str:
        """
        轻量高效联网检索工具
        """
        clean_q = query.strip()
        if not clean_q:
            return "搜索关键词不能为空。"

        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(clean_q)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, trust_env=False) as client:
                resp = await client.post(url, headers=headers)
                if resp.status_code == 200:
                    snippets = re.findall(r'<a class="result__snippet[^"]*"[^>]*>(.*?)</a>', resp.text, re.DOTALL)
                    urls = re.findall(r'<a class="result__url[^"]*"[^>]*>(.*?)</a>', resp.text, re.DOTALL)

                    items = []
                    for u, s in zip(urls[:max_results], snippets[:max_results]):
                        clean_u = re.sub(r'<.*?>', '', u).strip()
                        clean_s = re.sub(r'<.*?>', '', s).strip()
                        if clean_s:
                            items.append(f"- 来源: {clean_u}\n  摘要: {clean_s}")

                    if items:
                        return f"【联网检索结果 (关键词: {clean_q})】:\n" + "\n\n".join(items)
        except Exception as e:
            return f"联网搜索暂时不可用: {str(e)}"

        return f"未能获取到关键词【{clean_q}】的公开检索结果。"

    @staticmethod
    def execute_python_code(code: str) -> str:
        """
        安全 Python 代码沙箱执行器
        """
        code_clean = code.strip()
        if not code_clean:
            return "代码不能为空。"

        # 捕获标准输出
        old_stdout = sys.stdout
        redirected_output = sys.stdout = io.StringIO()

        # 受限全局命名空间
        safe_globals = {
            "__builtins__": {
                "print": print,
                "range": range,
                "len": len,
                "sum": sum,
                "min": min,
                "max": max,
                "abs": abs,
                "round": round,
                "int": int,
                "float": float,
                "str": str,
                "bool": bool,
                "list": list,
                "dict": dict,
                "set": set,
                "tuple": tuple,
                "zip": zip,
                "enumerate": enumerate,
                "sorted": sorted,
                "filter": filter,
                "map": map,
            }
        }

        try:
            import math
            import datetime
            safe_globals["math"] = math
            safe_globals["datetime"] = datetime

            exec(code_clean, safe_globals)
            output = redirected_output.getvalue().strip()
            if not output:
                output = "代码执行成功 (无标准输出内容)。"
            return f"【Python 执行输出】:\n{output}"
        except Exception as err:
            return f"【代码执行报错】: {type(err).__name__}: {str(err)}"
        finally:
            sys.stdout = old_stdout

    @staticmethod
    async def execute_custom_http(config: Dict[str, Any], params: Dict[str, Any]) -> str:
        """
        自定义 REST API Webhook 执行器
        """
        url = config.get("url") or config.get("endpoint")
        if not url:
            return "未配置有效的 API URL。"

        method = config.get("method", "GET").upper()
        headers = config.get("headers", {})

        try:
            async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
                if method == "POST":
                    resp = await client.post(url, headers=headers, json=params)
                else:
                    resp = await client.get(url, headers=headers, params=params)

                try:
                    data = resp.json()
                    return f"【API 响应结果 ({resp.status_code})】:\n" + json.dumps(data, ensure_ascii=False, indent=2)
                except Exception:
                    return f"【API 响应结果 ({resp.status_code})】:\n" + resp.text[:1000]
        except Exception as e:
            return f"调用外部 API 失败: {str(e)}"

    @staticmethod
    async def execute_mcp_tool(
        server_url: str,
        tool_name: str,
        arguments: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
        default_params: Optional[Dict[str, Any]] = None,
        protocol: str = "auto",
    ) -> str:
        """
        Model Context Protocol (MCP) 标准远程工具执行器 (支持自定义 Header 与缺省默认参数注入)
        """
        from app.services.mcp_service import MCPService
        return await MCPService.call_tool(
            server_url=server_url,
            tool_name=tool_name,
            arguments=arguments,
            headers=headers,
            default_params=default_params,
            protocol=protocol,
        )
