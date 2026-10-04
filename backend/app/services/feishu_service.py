import json
import base64
import hashlib
import logging
from typing import Dict, Any, Optional
import httpx
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding

logger = logging.getLogger(__name__)

class FeishuService:
    @staticmethod
    def verify_signature(timestamp: str, nonce: str, encrypt_key: str, body: str, signature: str) -> bool:
        """飞书签名校验：SHA256(timestamp + nonce + encrypt_key + body)"""
        if not signature:
            return True  # 未启用签名校验时放行
        content = f"{timestamp}{nonce}{encrypt_key}{body}"
        calc_sig = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return calc_sig == signature

    @staticmethod
    def decrypt_content(encrypt_key: str, encrypt_data: str) -> Dict[str, Any]:
        """飞书 AES-256-CBC 报文解密"""
        if not encrypt_data:
            return {}
        try:
            raw_key = hashlib.sha256(encrypt_key.encode("utf-8")).digest()
            raw_cipher = base64.b64decode(encrypt_data)
            iv = raw_cipher[:16]
            ciphertext = raw_cipher[16:]

            cipher = Cipher(algorithms.AES(raw_key), modes.CBC(iv))
            decryptor = cipher.decryptor()
            decrypted_padded = decryptor.update(ciphertext) + decryptor.finalize()

            unpadder = padding.PKCS7(128).unpadder()
            decrypted = unpadder.update(decrypted_padded) + unpadder.finalize()
            return json.loads(decrypted.decode("utf-8"))
        except Exception as e:
            logger.error(f"Feishu decryption failed: {e}")
            raise ValueError(f"报文解密失败: {e}")

    @staticmethod
    async def get_tenant_access_token(app_id: str, app_secret: str) -> Optional[str]:
        """获取飞书应用凭证 tenant_access_token"""
        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json={"app_id": app_id, "app_secret": app_secret})
            if res.status_code == 200:
                data = res.json()
                if data.get("code") == 0:
                    return data.get("tenant_access_token")
                logger.error(f"Failed to get tenant_access_token: {data}")
        return None

    @staticmethod
    async def send_message_to_feishu_chat(
        app_id: str,
        app_secret: str,
        receive_id: str,
        text_content: str,
        receive_id_type: str = "chat_id",
    ) -> bool:
        """使用飞书开放平台 OpenAPI 发送群聊/单聊消息"""
        token = await FeishuService.get_tenant_access_token(app_id, app_secret)
        if not token:
            logger.error("Cannot send feishu message: failed to get access token")
            return False

        url = f"https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type={receive_id_type}"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}
        body = {
            "receive_id": receive_id,
            "msg_type": "text",
            "content": json.dumps({"text": text_content}, ensure_ascii=False),
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, headers=headers, json=body)
            data = res.json()
            if data.get("code") == 0:
                return True
            logger.error(f"Feishu OpenAPI send message failed: {data}")
            return False

    @staticmethod
    async def send_webhook_bot(channel_type: str, webhook_url: str, text_content: str) -> bool:
        """向自定义群机器人 Webhook 推送消息 (支持飞书与企业微信)"""
        if not webhook_url:
            return False

        async with httpx.AsyncClient(timeout=10.0) as client:
            if channel_type == "feishu":
                payload = {
                    "msg_type": "text",
                    "content": {"text": text_content},
                }
            elif channel_type == "wecom":
                payload = {
                    "msg_type": "text",
                    "text": {"content": text_content},
                }
            else:
                payload = {"text": text_content}

            try:
                res = await client.post(webhook_url, json=payload)
                if res.status_code == 200:
                    return True
                logger.error(f"Webhook push failed with status {res.status_code}: {res.text}")
                return False
            except Exception as e:
                logger.error(f"Webhook push exception: {e}")
                return False
