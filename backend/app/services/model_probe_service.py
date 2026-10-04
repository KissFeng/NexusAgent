import time
import httpx
from typing import Dict, Any, List, Optional
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from app.llm.factory import PROVIDER_DEFAULT_URLS


class ModelProbeService:
    @staticmethod
    def _clean_base_url(provider: str, base_url: Optional[str]) -> str:
        clean = (base_url or "").strip().rstrip("/")
        if not clean:
            clean = PROVIDER_DEFAULT_URLS.get(provider.lower(), "https://api.openai.com/v1")
        # 如果用户误把 /chat/completions 或 /models 拼在 base_url 末尾，自动去除
        if clean.endswith("/chat/completions"):
            clean = clean[:-17].rstrip("/")
        elif clean.endswith("/models"):
            clean = clean[:-7].rstrip("/")
        return clean

    @staticmethod
    def _clean_model_name(provider: str, model_name: Optional[str]) -> str:
        name = (model_name or "").strip()
        if not name:
            defaults = {
                "deepseek": "deepseek-chat",
                "openai": "gpt-4o-mini",
                "qwen": "qwen-plus",
                "ollama": "llama3:8b",
            }
            name = defaults.get(provider.lower(), "gpt-4o-mini")
        return name

    @classmethod
    async def test_connection(
        cls,
        provider: str,
        model_name: Optional[str],
        base_url: Optional[str],
        api_key: Optional[str],
    ) -> Dict[str, Any]:
        """
        探测模型端点与凭证可用性：
        1. 尝试使用极小 Token 发送简单问候完成推理测试；
        2. 记录真实网络延迟；
        3. 给出精准的失败诊断（401 密钥失效、404 模型不存在、402 欠费、超时等）。
        """
        clean_provider = (provider or "custom").lower().strip()
        clean_url = cls._clean_base_url(clean_provider, base_url)
        clean_model = cls._clean_model_name(clean_provider, model_name)
        clean_key = (api_key or "").strip()
        if not clean_key and clean_provider == "ollama":
            clean_key = "ollama"
        elif not clean_key:
            clean_key = "dummy-key"

        start_time = time.perf_counter()
        async_client = httpx.AsyncClient(trust_env=False, timeout=12.0)

        try:
            llm = ChatOpenAI(
                model=clean_model,
                api_key=clean_key,
                base_url=clean_url,
                streaming=False,
                temperature=0.0,
                max_tokens=15,
                timeout=12.0,
                http_async_client=async_client,
            )

            response = await llm.ainvoke([HumanMessage(content="你好，请回复“连接成功”四个字。")])
            latency_ms = int((time.perf_counter() - start_time) * 1000)

            content = str(response.content).strip() if response and response.content else "成功收到响应"

            # 探测可用模型列表（顺带快捷获取）
            available_models = []
            try:
                disc = await cls.discover_models(clean_provider, clean_url, clean_key)
                if disc.get("success"):
                    available_models = disc.get("models", [])[:30]
            except Exception:
                pass

            return {
                "success": True,
                "latency_ms": latency_ms,
                "message": f"探测成功！模型响应正常，耗时 {latency_ms}ms",
                "sample_response": content[:120],
                "available_models": available_models,
            }

        except Exception as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            err_str = str(e)
            err_type = type(e).__name__

            # 精准错误诊断分类
            if "401" in err_str or "AuthenticationError" in err_type or "invalid_api_key" in err_str:
                diagnostic = (
                    f"【认证失败 401】API Key 无效、已过期或无访问权限。"
                    f"请检查填写的 API Key 是否正确（注意不要包含多余空格）。"
                )
            elif "404" in err_str or "NotFoundError" in err_type or "model_not_found" in err_str:
                diagnostic = (
                    f"【模型未找到 404】端点未能识别模型标识 '{clean_model}'。"
                    f"请检查模型名称是否拼写正确，或尝试点击“探测可用模型”获取支持的模型列表。"
                )
            elif "402" in err_str or "insufficient_quota" in err_str or "balance" in err_str.lower():
                diagnostic = "【配额不足 402】账户余额不足或调用额度已耗尽，请前往供应商后台检查账户余额。"
            elif "429" in err_str or "RateLimitError" in err_type:
                diagnostic = "【频次超限 429】触发了服务商的速率限制 (Rate Limit)，请稍后重试或提高并发额度。"
            elif "ConnectTimeout" in err_type or "Timeout" in err_type or "timed out" in err_str.lower():
                diagnostic = f"【连接超时】访问目标地址 ({clean_url}) 超过 12 秒无响应，请检查网络代理或服务端状态。"
            elif "ConnectError" in err_type or "connection refused" in err_str.lower():
                diagnostic = f"【连接被拒】无法建立连接到 ({clean_url})，请确认服务已启动且监听对应端口。"
            elif "InvalidURL" in err_type or "unsupported protocol" in err_str.lower():
                diagnostic = f"【地址格式错误】Base URL ({clean_url}) 格式不合法，请输入以 http:// 或 https:// 开头的完整地址。"
            else:
                diagnostic = f"【调用异常】{err_str[:200]}"

            return {
                "success": False,
                "latency_ms": latency_ms,
                "message": diagnostic,
                "sample_response": None,
                "available_models": [],
            }
        finally:
            await async_client.aclose()

    @classmethod
    async def discover_models(
        cls,
        provider: str,
        base_url: Optional[str],
        api_key: Optional[str],
    ) -> Dict[str, Any]:
        """
        向端点探测可用的模型列表：
        支持 OpenAI 规范的 /models 接口与 Ollama /api/tags 接口。
        """
        clean_provider = (provider or "custom").lower().strip()
        clean_url = cls._clean_base_url(clean_provider, base_url)
        clean_key = (api_key or "").strip()

        headers = {}
        if clean_key and clean_key != "dummy-key":
            headers["Authorization"] = f"Bearer {clean_key}"

        models_found: List[str] = []

        async with httpx.AsyncClient(trust_env=False, timeout=8.0) as client:
            # 1. 尝试标准的 GET {base_url}/models
            target_url = f"{clean_url}/models"
            try:
                resp = await client.get(target_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    # 兼容 {"data": [{"id": "..."}, ...]}
                    if isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
                        for item in data["data"]:
                            if isinstance(item, dict) and item.get("id"):
                                models_found.append(str(item["id"]))
                    # 兼容 {"models": [{"name": "..."}, ...]}
                    elif isinstance(data, dict) and "models" in data and isinstance(data["models"], list):
                        for item in data["models"]:
                            if isinstance(item, dict):
                                name = item.get("name") or item.get("model") or item.get("id")
                                if name:
                                    models_found.append(str(name))
            except Exception:
                pass

            # 2. 如果是 Ollama，且标准 /models 没查到，尝试 /api/tags
            if not models_found and (clean_provider == "ollama" or "11434" in clean_url):
                try:
                    # 获取 host root
                    host_root = clean_url.split("/v1")[0].rstrip("/")
                    ollama_tags_url = f"{host_root}/api/tags"
                    resp = await client.get(ollama_tags_url)
                    if resp.status_code == 200:
                        data = resp.json()
                        for item in data.get("models", []):
                            name = item.get("name") or item.get("model")
                            if name:
                                models_found.append(str(name))
                except Exception:
                    pass

        if models_found:
            # 去重并排序
            unique_models = sorted(list(dict.fromkeys(models_found)))
            return {
                "success": True,
                "models": unique_models,
                "message": f"成功探测到 {len(unique_models)} 个可用模型",
            }
        else:
            return {
                "success": False,
                "models": [],
                "message": f"未能从端点 ({clean_url}/models) 获取到模型列表，可手动输入模型名称。",
            }
