from typing import Any
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
        provider = config.provider.lower()
        base_url = config.base_url or PROVIDER_DEFAULT_URLS.get(provider)
        api_key = config.api_key or ("ollama" if provider == "ollama" else "dummy-key")

        return ChatOpenAI(
            model=config.model_name,
            api_key=api_key,
            base_url=base_url,
            streaming=streaming,
            temperature=temperature,
            **kwargs,
        )
