from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.core.security import (
    hash_password, verify_password, create_access_token, create_ws_ticket
)
from backend.app.core.dependencies import get_current_user
from backend.app.models import User
from backend.app.schemas import (
    UserRegisterRequest, UserLoginRequest, TokenResponse, UserResponse,
    WsTicketRequest, WsTicketResponse
)
from backend.app.services.audit_service import log_action

router = APIRouter(prefix="/auth", tags=["Authentication & Identity"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    req: UserRegisterRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    # Check duplicate email
    existing_user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists"
        )

    # Server-verified role provisioning
    assigned_role = "student"
    if req.role == "teacher":
        if not req.teacher_provisioning_key or req.teacher_provisioning_key != settings.TEACHER_PROVISIONING_KEY:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or missing teacher provisioning key"
            )
        assigned_role = "teacher"

    new_user = User(
        email=req.email.lower().strip(),
        hashed_password=hash_password(req.password),
        full_name=req.full_name.strip(),
        role=assigned_role,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="USER_REGISTERED",
        actor_user_id=new_user.id,
        target_resource=new_user.id,
        ip_address=client_ip,
        details={"email": new_user.email, "role": new_user.role}
    )

    return new_user


@router.post("/login", response_model=TokenResponse)
def login(
    req: UserLoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.id,
        role=user.role,
        extra_data={"email": user.email, "full_name": user.full_name},
        expires_delta=expires_delta
    )

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="USER_LOGIN",
        actor_user_id=user.id,
        target_resource=user.id,
        ip_address=client_ip
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user)
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user


@router.post("/ws-ticket", response_model=WsTicketResponse)
def issue_ws_ticket(
    req: WsTicketRequest,
    current_user: User = Depends(get_current_user)
):
    # Channel target: "teacher" if user is teacher and requests teacher channel; "student" for students
    target_channel = req.channel or current_user.role
    if target_channel == "teacher" and current_user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot request teacher channel ticket with student role"
        )

    ticket = create_ws_ticket(
        user_id=current_user.id,
        role=current_user.role,
        channel=target_channel
    )
    return WsTicketResponse(
        ticket=ticket,
        expires_in=settings.WS_TICKET_EXPIRE_SECONDS
    )

