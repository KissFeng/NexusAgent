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
)
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
        name=req.name,
        provider=req.provider,
        model_name=req.model_name,
        base_url=req.base_url,
        api_key=req.api_key,
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
        model_config.name = req.name
    if req.model_name is not None:
        model_config.model_name = req.model_name
    if req.base_url is not None:
        model_config.base_url = req.base_url
    if req.api_key is not None and req.api_key.strip():
        model_config.api_key = req.api_key
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
