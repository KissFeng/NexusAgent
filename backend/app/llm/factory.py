from typing import Any, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI
from app.models.model_provider import ModelConfig

PROVIDER_DEFAULT_URLS = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "ollama": "http://localhost:11434/v1",
}


class LLMFactory:
    @staticmethod
    def clean_base_url(raw_url: Optional[str], provider: str) -> str:
        clean = (raw_url or "").strip().rstrip("/")
        if not clean:
            clean = PROVIDER_DEFAULT_URLS.get(provider.lower(), "https://api.openai.com/v1")
        if clean.endswith("/chat/completions"):
            clean = clean[:-17].rstrip("/")
        elif clean.endswith("/models"):
            clean = clean[:-7].rstrip("/")
        return clean

    @staticmethod
    def get_chat_model(
        config: ModelConfig,
        streaming: bool = True,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> BaseChatModel:
        """
        Dynamically instantiate a LangChain Chat Model according to the workspace ModelConfig.
        Uses OpenAI compatible client interface for high compatibility with:
        OpenAI, DeepSeek, DashScope Qwen, Ollama, SiliconFlow, etc.
        """
        provider = (config.provider or "custom").lower().strip()
        base_url = LLMFactory.clean_base_url(config.base_url, provider)
        model_name = (config.model_name or "").strip()
        api_key = (config.api_key or "").strip()
        if not api_key:
            api_key = "ollama" if provider == "ollama" else "dummy-key"

        return ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url=base_url,
            streaming=streaming,
            temperature=temperature,
            **kwargs,
        )
