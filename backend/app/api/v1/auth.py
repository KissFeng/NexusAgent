from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.models.model_provider import ModelConfig
from app.schemas.user import UserRegisterRequest, UserLoginRequest, TokenResponse, UserResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register", response_model=TokenResponse)
async def register(
    req: UserRegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stmt = select(User).where(User.email == req.email)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )

    # 1. 创建新用户
    user = User(
        email=req.email,
        username=req.username,
        hashed_password=get_password_hash(req.password),
    )
    db.add(user)
    await db.flush()

    # 2. 自动初始化用户的个人空间
    workspace = Workspace(
        name=f"{req.username} 的个人空间",
        type="personal",
        owner_id=user.id,
    )
    db.add(workspace)
    await db.flush()

    # 3. 添加所有者成员关系
    membership = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role="owner",
    )
    db.add(membership)

    # 4. 初始化一个默认的演示模型配置（支持后续修改填入自己的 Key）
    default_model = ModelConfig(
        workspace_id=workspace.id,
        name="DeepSeek-Chat",
        provider="deepseek",
        model_name="deepseek-chat",
        base_url="https://api.deepseek.com/v1",
        api_key=None,
        is_default=True,
    )
    db.add(default_model)

    await db.commit()
    await db.refresh(user)

    token = create_access_token(data={"sub": user.id, "email": user.email})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))

@router.post("/login", response_model=TokenResponse)
async def login(
    req: UserLoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stmt = select(User).where(User.email == req.email)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被禁用",
        )

    token = create_access_token(data={"sub": user.id, "email": user.email})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))

@router.get("/me", response_model=UserResponse)
async def get_me(user: Annotated[User, Depends(get_current_user)]):
    return UserResponse.model_validate(user)
