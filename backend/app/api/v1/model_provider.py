from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.database import get_db
from app.models.workspace import Workspace
from app.models.model_provider import ModelConfig
from app.schemas.model_provider import (
    ModelConfigCreateRequest,
    ModelConfigUpdateRequest,
    ModelConfigResponse,
    TestModelConnectionRequest,
    TestModelConnectionResponse,
    DiscoverModelsRequest,
    DiscoverModelsResponse,
)
from app.services.model_probe_service import ModelProbeService
from app.api.deps import get_current_workspace

router = APIRouter(prefix="/models", tags=["Model Configs"])

@router.get("", response_model=List[ModelConfigResponse])
async def list_models(
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = (
        select(ModelConfig)
        .where(ModelConfig.workspace_id == workspace.id)
        .order_by(ModelConfig.is_default.desc(), ModelConfig.created_at.asc())
    )
    result = await db.execute(stmt)
    models = result.scalars().all()
    
    return [
        ModelConfigResponse(
            id=m.id,
            workspace_id=m.workspace_id,
            name=m.name,
            provider=m.provider,
            model_name=m.model_name,
            base_url=m.base_url,
            has_api_key=bool(m.api_key and m.api_key.strip()),
            is_default=m.is_default,
            created_at=m.created_at,
        )
        for m in models
    ]

@router.post("", response_model=ModelConfigResponse)
async def create_model(
    req: ModelConfigCreateRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有管理员或所有者可以添加模型配置")

    # 如果设为默认，先取消之前的默认
    if req.is_default:
        await db.execute(
            update(ModelConfig)
            .where(ModelConfig.workspace_id == workspace.id)
            .values(is_default=False)
        )

    model_config = ModelConfig(
        workspace_id=workspace.id,
        name=req.name.strip(),
        provider=req.provider.strip(),
        model_name=req.model_name.strip(),
        base_url=req.base_url.strip() if req.base_url else None,
        api_key=req.api_key.strip() if req.api_key else None,
        is_default=req.is_default,
    )
    db.add(model_config)
    await db.commit()
    await db.refresh(model_config)

    return ModelConfigResponse(
        id=model_config.id,
        workspace_id=model_config.workspace_id,
        name=model_config.name,
        provider=model_config.provider,
        model_name=model_config.model_name,
        base_url=model_config.base_url,
        has_api_key=bool(model_config.api_key and model_config.api_key.strip()),
        is_default=model_config.is_default,
        created_at=model_config.created_at,
    )

@router.put("/{model_id}", response_model=ModelConfigResponse)
async def update_model(
    model_id: str,
    req: ModelConfigUpdateRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改模型配置")

    stmt = select(ModelConfig).where(ModelConfig.id == model_id, ModelConfig.workspace_id == workspace.id)
    model_config = (await db.execute(stmt)).scalar_one_or_none()
    if not model_config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模型配置不存在")

    if req.name is not None:
        model_config.name = req.name.strip()
    if req.provider is not None:
        model_config.provider = req.provider.strip()
    if req.model_name is not None:
        model_config.model_name = req.model_name.strip()
    if req.base_url is not None:
        model_config.base_url = req.base_url.strip() if req.base_url else None
    if req.api_key is not None and req.api_key.strip():
        model_config.api_key = req.api_key.strip()
    if req.is_default is True:
        await db.execute(
            update(ModelConfig)
            .where(ModelConfig.workspace_id == workspace.id)
            .values(is_default=False)
        )
        model_config.is_default = True

    await db.commit()
    await db.refresh(model_config)

    return ModelConfigResponse(
        id=model_config.id,
        workspace_id=model_config.workspace_id,
        name=model_config.name,
        provider=model_config.provider,
        model_name=model_config.model_name,
        base_url=model_config.base_url,
        has_api_key=bool(model_config.api_key and model_config.api_key.strip()),
        is_default=model_config.is_default,
        created_at=model_config.created_at,
    )

@router.post("/{model_id}/set-default", response_model=ModelConfigResponse)
async def set_default_model(
    model_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改模型配置")

    stmt = select(ModelConfig).where(ModelConfig.id == model_id, ModelConfig.workspace_id == workspace.id)
    model_config = (await db.execute(stmt)).scalar_one_or_none()
    if not model_config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模型配置不存在")

    # 取消当前工作区内其他所有默认模型
    await db.execute(
        update(ModelConfig)
        .where(ModelConfig.workspace_id == workspace.id)
        .values(is_default=False)
    )
    model_config.is_default = True

    await db.commit()
    await db.refresh(model_config)

    return ModelConfigResponse(
        id=model_config.id,
        workspace_id=model_config.workspace_id,
        name=model_config.name,
        provider=model_config.provider,
        model_name=model_config.model_name,
        base_url=model_config.base_url,
        has_api_key=bool(model_config.api_key and model_config.api_key.strip()),
        is_default=model_config.is_default,
        created_at=model_config.created_at,
    )

@router.delete("/{model_id}")
async def delete_model(
    model_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除模型配置")

    stmt = select(ModelConfig).where(ModelConfig.id == model_id, ModelConfig.workspace_id == workspace.id)
    model_config = (await db.execute(stmt)).scalar_one_or_none()
    if not model_config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模型配置不存在")

    await db.delete(model_config)
    await db.commit()
    return {"message": "模型配置已删除"}


@router.post("/test-connection", response_model=TestModelConnectionResponse)
async def test_model_connection(
    req: TestModelConnectionRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    通用模型连通性与健康度探测：
    支持在表单录入阶段直接测试，或者引用已有模型配置进行测试。
    """
    workspace, _ = ws_info
    provider = req.provider or "custom"
    model_name = req.model_name
    base_url = req.base_url
    api_key = req.api_key

    # 若指定了已有 model_id，且缺少部分入参，则从数据库中提取补齐（例如复用原有 API Key）
    if req.model_id:
        stmt = select(ModelConfig).where(ModelConfig.id == req.model_id, ModelConfig.workspace_id == workspace.id)
        saved = (await db.execute(stmt)).scalar_one_or_none()
        if saved:
            provider = req.provider or saved.provider
            model_name = model_name or saved.model_name
            base_url = base_url if (base_url and base_url.strip()) else saved.base_url
            if not api_key or not api_key.strip():
                api_key = saved.api_key

    result = await ModelProbeService.test_connection(
        provider=provider,
        model_name=model_name,
        base_url=base_url,
        api_key=api_key,
    )
    return TestModelConnectionResponse(**result)


@router.post("/{model_id}/probe", response_model=TestModelConnectionResponse)
async def probe_existing_model(
    model_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    针对已保存模型的快捷一键健康探测
    """
    workspace, _ = ws_info
    stmt = select(ModelConfig).where(ModelConfig.id == model_id, ModelConfig.workspace_id == workspace.id)
    saved = (await db.execute(stmt)).scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模型配置不存在")

    result = await ModelProbeService.test_connection(
        provider=saved.provider,
        model_name=saved.model_name,
        base_url=saved.base_url,
        api_key=saved.api_key,
    )
    return TestModelConnectionResponse(**result)


@router.post("/discover-models", response_model=DiscoverModelsResponse)
async def discover_endpoint_models(
    req: DiscoverModelsRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    向目标服务端点探测所有可用模型清单（支持 OpenAI 规范 /models 与 Ollama /api/tags）
    """
    workspace, _ = ws_info
    provider = req.provider or "custom"
    base_url = req.base_url
    api_key = req.api_key

    if req.model_id:
        stmt = select(ModelConfig).where(ModelConfig.id == req.model_id, ModelConfig.workspace_id == workspace.id)
        saved = (await db.execute(stmt)).scalar_one_or_none()
        if saved:
            provider = req.provider or saved.provider
            base_url = base_url if (base_url and base_url.strip()) else saved.base_url
            if not api_key or not api_key.strip():
                api_key = saved.api_key

    result = await ModelProbeService.discover_models(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
    )
    return DiscoverModelsResponse(**result)
