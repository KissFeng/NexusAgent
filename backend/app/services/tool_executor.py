import io
import os
import sys
import json
import re
import asyncio
import base64
import urllib.parse
import httpx
from typing import Dict, Any, List, Optional
from lxml import html


class ToolExecutor:
    @staticmethod
    async def execute_web_search(query: str, max_results: int = 4) -> str:
        """
        轻量高效联网检索工具 (支持 Bing / DuckDuckGo 双通道容错与精准 URL 提取)
        """
        clean_q = query.strip()
        if not clean_q:
            return "搜索关键词不能为空。"

        items: List[str] = []

        # 1. 优先通道：专业中文产业与行情检索 (支持原站 URL 直提与防频控)
        try:
            so_url = f"https://www.so.com/s?q={urllib.parse.quote(clean_q)}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            }
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, trust_env=False) as client:
                resp = await client.get(so_url, headers=headers)
                if resp.status_code == 200:
                    tree = html.fromstring(resp.content.decode("utf-8", errors="replace"))
                    res_items = tree.xpath("//li[contains(@class, 'res-list')]")
                    for el in res_items[:max_results]:
                        title = "".join(el.xpath(".//h3//text()")).strip()
                        raw_urls = el.xpath(".//h3/a/@data-mdurl") or el.xpath(".//h3/a/@href")
                        desc = "".join(el.xpath(".//p[contains(@class, 'res-desc')]//text()")).strip()
                        target_url = raw_urls[0] if raw_urls else ""
                        if title and target_url:
                            snippet_text = desc if desc else "（点击查看该页面详情及实时报价）"
                            items.append(f"- 【标题】: {title}\n  【网址】: {target_url}\n  【摘要】: {snippet_text}")
        except Exception:
            pass

        # 2. 备选通道：Bing 搜索 (国际与综合信息补充)
        if not items:
            try:
                bing_url = f"https://www.bing.com/search?q={urllib.parse.quote(clean_q)}"
                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                }
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, trust_env=False) as client:
                    resp = await client.get(bing_url, headers=headers)
                    if resp.status_code == 200:
                        tree = html.fromstring(resp.content.decode("utf-8", errors="replace"))
                        algo_items = tree.xpath("//li[contains(@class, 'b_algo')]")
                        for el in algo_items[:max_results]:
                            title = "".join(el.xpath(".//h2//text()")).strip()
                            raw_href = el.xpath(".//h2/a/@href")
                            snippet = "".join(el.xpath(".//div[contains(@class, 'b_caption')]//p//text()")).strip()
                            real_url = raw_href[0] if raw_href else ""
                            if "u=a1" in real_url:
                                try:
                                    m = re.search(r"u=a1([A-Za-z0-9_-]+)", real_url)
                                    if m:
                                        b64_str = m.group(1).replace("-", "+").replace("_", "/")
                                        pad = len(b64_str) % 4
                                        if pad:
                                            b64_str += "=" * (4 - pad)
                                        decoded_u = base64.b64decode(b64_str).decode("utf-8", errors="ignore")
                                        if decoded_u.startswith("http"):
                                            real_url = decoded_u
                                except Exception:
                                    pass
                            if title and snippet:
                                items.append(f"- 【标题】: {title}\n  【网址】: {real_url}\n  【摘要】: {snippet}")
            except Exception:
                pass

        # 2. 备选通道：DuckDuckGo (如 Bing 暂不可用时降级)
        if not items:
            try:
                ddg_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(clean_q)}"
                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, trust_env=False) as client:
                    resp = await client.post(ddg_url, headers=headers)
                    if resp.status_code == 200:
                        snippets = re.findall(r'<a class="result__snippet[^"]*"[^>]*>(.*?)</a>', resp.text, re.DOTALL)
                        urls = re.findall(r'<a class="result__url[^"]*"[^>]*>(.*?)</a>', resp.text, re.DOTALL)
                        for u, s in zip(urls[:max_results], snippets[:max_results]):
                            clean_u = re.sub(r'<.*?>', '', u).strip()
                            clean_s = re.sub(r'<.*?>', '', s).strip()
                            if clean_s:
                                items.append(f"- 【网址】: https://{clean_u}\n  【摘要】: {clean_s}")
            except Exception:
                pass

        if items:
            return (
                f"【联网检索结果 (关键词: {clean_q})】:\n"
                + "\n\n".join(items)
                + "\n\n*提示：若摘要未展示详细数值、表格或具体报价，请使用 fetch_web_page(url='目标网址') 读取网页正文和表格数据。*"
            )

        return f"未能获取到关键词【{clean_q}】的公开检索结果。建议更换更简炼的关键词或直接使用目标网址阅读。"

    @staticmethod
    async def execute_fetch_web_page(url: str, max_chars: int = 6000) -> str:
        """
        深度网页正文与表格阅读器：解析网页文本，并将 table 转换为结构化 Markdown 表格
        """
        clean_url = url.strip()
        if not clean_url:
            return "目标 URL 不能为空。"

        if not clean_url.startswith(("http://", "https://")):
            clean_url = "https://" + clean_url

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
        }

        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, trust_env=False) as client:
                resp = await client.get(clean_url, headers=headers)
                if resp.status_code != 200:
                    return f"访问目标网页失败 (HTTP 状态码: {resp.status_code}): {clean_url}"

                # 编码多重容错 (优先 UTF-8，回退 GB18030 / GBK 兼容国内传统行情网站)
                raw_bytes = resp.content
                decoded_html = None
                for enc in ["utf-8", "gb18030", "gbk", "gb2312", "big5"]:
                    try:
                        decoded_html = raw_bytes.decode(enc)
                        break
                    except (UnicodeDecodeError, LookupError):
                        continue

                if not decoded_html:
                    decoded_html = raw_bytes.decode("utf-8", errors="replace")

                tree = html.fromstring(decoded_html)

                # 1. 提取页面标题
                title_list = tree.xpath("//title/text()")
                page_title = "".join(title_list).strip() if title_list else "无标题"

                # 2. 剥离脚本、样式、导航等噪声节点
                for bad in tree.xpath("//script | //style | //nav | //header | //footer | //aside | //noscript | //iframe | //svg"):
                    if bad.getparent() is not None:
                        bad.getparent().remove(bad)

                # 3. 将网页数据表格 <table> 转换为 Markdown 表格，保留核心行情数字
                for table in tree.xpath("//table"):
                    rows = []
                    for tr in table.xpath(".//tr"):
                        cells = [re.sub(r'\s+', ' ', td.text_content().strip()) for td in tr.xpath(".//th | .//td")]
                        if any(cells):
                            rows.append(cells)
                    if rows:
                        max_cols = max(len(r) for r in rows)
                        if max_cols > 0:
                            norm_rows = [r + ['-'] * (max_cols - len(r)) for r in rows]
                            md_table_lines = [
                                "| " + " | ".join(norm_rows[0]) + " |",
                                "| " + " | ".join(["---"] * max_cols) + " |"
                            ]
                            for r in norm_rows[1:15]:  # 最多保留前 15 行表格明细
                                md_table_lines.append("| " + " | ".join(r) + " |")
                            md_table_text = "\n\n" + "\n".join(md_table_lines) + "\n\n"
                            
                            try:
                                replacement = html.fromstring(f"<div>{md_table_text}</div>")
                                if table.getparent() is not None:
                                    table.getparent().replace(table, replacement)
                            except Exception:
                                pass

                # 4. 提取清洗后的结构化纯文本
                content_text = tree.text_content()
                lines = [re.sub(r'\s+', ' ', line.strip()) for line in content_text.splitlines() if line.strip()]
                clean_body = "\n".join(lines)

                # 5. 长度限制与智能截断 (保留前 max_chars 字符)
                is_truncated = False
                if len(clean_body) > max_chars:
                    clean_body = clean_body[:max_chars]
                    is_truncated = True

                result = (
                    f"【目标网页详情 (URL: {clean_url})】\n"
                    f"【页面标题】: {page_title}\n"
                    f"【正文与表格内容】:\n{clean_body}"
                )
                if is_truncated:
                    result += f"\n\n*(注意：正文内容过长，已截取前 {max_chars} 字符)*"

                return result

        except Exception as e:
            return f"读取网页内容失败 ({clean_url}): {str(e)}"

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
    async def execute_bash(command: str, cwd: Optional[str] = None, timeout: float = 30.0) -> str:
        """
        通用异步 Bash / Python 沙箱执行器
        支持在关联的项目目录中执行 Shell 命令、Python 动态脚本与系统指令。
        """
        cmd_clean = command.strip()
        if not cmd_clean:
            return "执行命令不能为空。"

        # 1. 危险命令黑名单熔断拦截 (防止不可逆全盘破坏)
        forbidden_patterns = [
            r"\brm\s+-[rRfF]*\s+/\b",
            r"\bmkfs\b",
            r"\bdd\s+if=/dev/zero\b",
            r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;",  # Fork bomb
            r">\s*/dev/sd[a-z]",
        ]
        for pat in forbidden_patterns:
            if re.search(pat, cmd_clean):
                return f"【安全拦截】: 该命令包含高风险破坏性操作 ({cmd_clean})，已被沙箱策略安全拒绝执行。"

        # 2. 确定工作目录 (优先用户关联的项目路径)
        base_dir = os.path.abspath(cwd) if cwd and os.path.isdir(cwd) else os.getcwd()

        try:
            process = await asyncio.create_subprocess_shell(
                cmd_clean,
                cwd=base_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "PAGER": "cat", "TERM": "dumb"}
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            try:
                process.kill()
            except Exception:
                pass
            return f"【Bash 执行超时】: 命令执行超过 {timeout} 秒限制，已被安全终止。\n工作目录: {base_dir}\n命令: {cmd_clean}"
        except Exception as e:
            return f"【Bash 执行异常】: {str(e)}"

        exit_code = process.returncode
        stdout_str = stdout_bytes.decode("utf-8", errors="replace")
        stderr_str = stderr_bytes.decode("utf-8", errors="replace")

        # 智能输出截断 (截取前 3500 字符，防止输出过大撑爆上下文)
        max_output_len = 3500
        combined_output = ""
        if stdout_str:
            combined_output += stdout_str
        if stderr_str:
            if combined_output:
                combined_output += "\n--- [stderr] ---\n"
            combined_output += stderr_str

        if len(combined_output) > max_output_len:
            combined_output = combined_output[:max_output_len] + f"\n\n...(输出内容过长，已截取前 {max_output_len} 字符)"

        output_display = combined_output.strip() if combined_output.strip() else "(无标准输出)"
        status_tag = "✅ 执行成功" if exit_code == 0 else f"❌ 执行失败 (Exit Code: {exit_code})"
        return (
            f"【Bash 命令执行 - {status_tag}】\n"
            f"工作目录: {base_dir}\n"
            f"执行指令: {cmd_clean}\n"
            f"输出结果:\n{output_display}"
        )

    @staticmethod
    def execute_file_system(
        action: str,
        path: str,
        content: Optional[str] = None,
        start_line: Optional[int] = None,
        end_line: Optional[int] = None,
        cwd: Optional[str] = None,
    ) -> str:
        """
        工作区文件系统操作工具 (list / read / write)
        """
        base_dir = os.path.abspath(cwd) if cwd and os.path.isdir(cwd) else os.getcwd()
        target_path = os.path.normpath(os.path.join(base_dir, path)) if not os.path.isabs(path) else os.path.normpath(path)

        act = action.strip().lower()

        if act == "list":
            if not os.path.exists(target_path):
                return f"目录不存在: {target_path}"
            if not os.path.isdir(target_path):
                return f"目标路径不是目录: {target_path}"
            try:
                entries = []
                for item in sorted(os.listdir(target_path))[:100]:
                    if item.startswith(".git"):
                        continue
                    full_p = os.path.join(target_path, item)
                    tag = "[DIR]" if os.path.isdir(full_p) else "[FILE]"
                    size = f" ({os.path.getsize(full_p)} bytes)" if os.path.isfile(full_p) else ""
                    entries.append(f"{tag} {item}{size}")
                return f"【目录清单: {target_path}】\n" + "\n".join(entries)
            except Exception as e:
                return f"读取目录失败: {str(e)}"

        elif act == "read":
            if not os.path.exists(target_path):
                return f"文件不存在: {target_path}"
            if not os.path.isfile(target_path):
                return f"目标路径不是文件: {target_path}"
            try:
                with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
                total_lines = len(lines)
                s = max(1, start_line) if start_line else 1
                e = min(total_lines, end_line) if end_line else min(total_lines, s + 300)
                selected = lines[s - 1:e]
                indexed_content = "".join([f"{idx}: {line}" for idx, line in enumerate(selected, start=s)])
                return (
                    f"【文件内容: {target_path} (行 {s}-{e} / 共 {total_lines} 行)】\n"
                    f"{indexed_content}"
                )
            except Exception as e:
                return f"读取文件失败: {str(e)}"

        elif act == "write":
            if content is None:
                return "写入内容不能为空。"
            try:
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(content)
                return f"✅ 成功写入文件 ({len(content)} 字符): {target_path}"
            except Exception as e:
                return f"写入文件失败: {str(e)}"

        return f"不支持的文件操作类型: {action} (仅支持 list / read / write)"

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
