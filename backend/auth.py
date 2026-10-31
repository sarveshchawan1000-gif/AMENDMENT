"""
Authentication module for AMENDMENT board game.

Provides guest authentication, optional Google OAuth token verification,
signed JWT issuance, in-memory rate limiting, and the reusable FastAPI `get_current_user` dependency.
"""

import os
import re
import time
import uuid
import threading
from pathlib import Path
from typing import Dict, Optional, Any, Tuple
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=_env_path)
except ImportError:
    pass

router = APIRouter(prefix="/auth", tags=["auth"])

DEV_JWT_SECRET = "amendment-dev-secret-key-change-in-prod"


def validate_jwt_secret() -> str:
    """
    Validate and return JWT_SECRET.
    In production mode (ENVIRONMENT='production' / 'prod'):
      - Missing secret fails fast with RuntimeError.
      - Known development default fails fast with RuntimeError.
      - Secret shorter than 32 characters fails fast with RuntimeError.
    In development mode:
      - Falls back to DEV_JWT_SECRET if not supplied.
    NEVER print or log the secret value.
    """
    env = os.getenv("ENVIRONMENT", os.getenv("APP_ENV", os.getenv("ENV", "development"))).lower()
    is_prod = env in ("production", "prod")
    secret = os.getenv("JWT_SECRET", "").strip()

    if is_prod:
        if not secret:
            raise RuntimeError(
                "Production startup failed: JWT_SECRET environment variable is missing. "
                "A strong secret (at least 32 characters) must be configured in production."
            )
        if secret == DEV_JWT_SECRET or secret.lower() in ("changeme", "secret", "password"):
            raise RuntimeError(
                "Production startup failed: JWT_SECRET cannot use the development default. "
                "A strong, unique secret (at least 32 characters) must be configured in production."
            )
        if len(secret) < 32:
            raise RuntimeError(
                "Production startup failed: JWT_SECRET is too short. "
                "Must be at least 32 characters for sufficient entropy."
            )
        return secret

    return secret or DEV_JWT_SECRET


JWT_SECRET: str = validate_jwt_secret()
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRATION_SECONDS: int = 7 * 24 * 3600  # 7 days

GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "").strip()

security = HTTPBearer(auto_error=False)


def get_client_ip(request: Request) -> str:
    """Extract client IP, inspecting X-Forwarded-For when behind a reverse proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# --- Consistent API Error Exception ---

class APIError(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(
            status_code=status_code,
            detail={"detail": detail, "code": code}
        )


# --- In-Memory Rate Limiter ---

class InMemoryRateLimiter:
    """Thread-safe sliding-window rate limiter per client IP."""

    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._requests: Dict[str, list] = {}

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        with self._lock:
            history = self._requests.get(client_ip, [])
            cutoff = now - self.window_seconds
            # Purge requests outside window
            valid_history = [t for t in history if t > cutoff]
            if len(valid_history) >= self.max_requests:
                self._requests[client_ip] = valid_history
                return False
            valid_history.append(now)
            self._requests[client_ip] = valid_history
            return True


auth_rate_limiter = InMemoryRateLimiter(max_requests=30, window_seconds=60.0)


def check_auth_rate_limit(request: Request) -> None:
    client_ip = get_client_ip(request)
    if not auth_rate_limiter.is_allowed(client_ip):
        raise APIError(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Please wait a moment.",
            code="RATE_LIMITED"
        )


# --- User Store Interface & In-Memory Implementation ---

class User(BaseModel):
    id: str
    nickname: str
    type: str  # "guest" | "google"
    avatar_url: Optional[str] = None
    created_at: float = Field(default_factory=time.time)
    google_sub: Optional[str] = None


class UserStore:
    """Thread-safe in-memory user repository."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._users_by_id: Dict[str, User] = {}
        self._users_by_google_sub: Dict[str, str] = {}

    def save_user(self, user: User) -> User:
        with self._lock:
            self._users_by_id[user.id] = user
            if user.google_sub:
                self._users_by_google_sub[user.google_sub] = user.id
            return user

    def get_by_id(self, user_id: str) -> Optional[User]:
        with self._lock:
            return self._users_by_id.get(user_id)

    def get_by_google_sub(self, google_sub: str) -> Optional[User]:
        with self._lock:
            user_id = self._users_by_google_sub.get(google_sub)
            if user_id:
                return self._users_by_id.get(user_id)
            return None


user_store = UserStore()


# --- Nickname Generation & Sanitization ---

ADJECTIVES: list = [
    "Swift", "Clever", "Brave", "Silent", "Noble", "Cunning", "Fierce",
    "Bold", "Keen", "Mighty", "Quick", "Vigilant", "Wise", "Witty", "Astute",
    "Stalwart", "Valiant", "Zealous", "Radiant", "Dynamic"
]

NOUNS: list = [
    "Fox", "Falcon", "Owl", "Wolf", "Badger", "Otter", "Lynx",
    "Raven", "Hawk", "Panther", "Tiger", "Bear", "Eagle", "Stag", "Dolphin",
    "Cipher", "Judge", "Juror", "Scholar", "Advocate"
]


def generate_guest_nickname() -> str:
    """Generate a readable guest nickname e.g. 'SwiftFox42'."""
    import random
    adj = random.choice(ADJECTIVES)
    noun = random.choice(NOUNS)
    num = random.randint(10, 99)
    return f"{adj}{noun}{num}"


def sanitize_nickname(name: Optional[str]) -> str:
    """Sanitize nickname: strip HTML, control characters, whitespace, cap at 20 chars."""
    if not name or not isinstance(name, str):
        return generate_guest_nickname()

    cleaned = re.sub(r"<[^>]*?>", "", name)
    cleaned = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if not cleaned:
        return generate_guest_nickname()

    return cleaned[:20]


# --- JWT Helpers ---

def create_access_token(user: User) -> str:
    """Issue a signed JWT token with claims: sub, nickname, type, avatar_url, iat, exp."""
    now = int(time.time())
    payload = {
        "sub": user.id,
        "nickname": user.nickname,
        "type": user.type,
        "avatar_url": user.avatar_url,
        "iat": now,
        "exp": now + JWT_EXPIRATION_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT access token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please re-authenticate.",
            code="EXPIRED_TOKEN"
        )
    except jwt.PyJWTError:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            code="INVALID_TOKEN"
        )


# --- Request & Response Models ---

class GuestAuthRequest(BaseModel):
    nickname: Optional[str] = Field(None, max_length=100)


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(..., min_length=10, description="Google ID Token from Google Identity Services")


class AuthResponse(BaseModel):
    player_id: str
    nickname: str
    type: str
    avatar_url: Optional[str] = None
    token: str


class CurrentUserResponse(BaseModel):
    player_id: str
    nickname: str
    type: str
    avatar_url: Optional[str] = None


# --- FastAPI Dependency: get_current_user ---

def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> User:
    """
    Extracts and validates current user from either:
    1. Authorization: Bearer <token> header
    2. 'amendment_token' httpOnly cookie
    """
    token: Optional[str] = None

    if credentials and credentials.credentials:
        token = credentials.credentials
    elif "amendment_token" in request.cookies:
        token = request.cookies.get("amendment_token")

    if not token:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            code="UNAUTHORIZED"
        )

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            code="INVALID_TOKEN"
        )

    user = user_store.get_by_id(user_id)
    if not user:
        user = User(
            id=user_id,
            nickname=payload.get("nickname", "Player"),
            type=payload.get("type", "guest"),
            avatar_url=payload.get("avatar_url")
        )
        user_store.save_user(user)

    return user


def set_auth_cookie(response: Response, token: str) -> None:
    """Attach httpOnly SameSite=Lax cookie to response."""
    response.set_cookie(
        key="amendment_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=JWT_EXPIRATION_SECONDS,
        path="/"
    )


# --- Endpoints ---

@router.post("/guest", response_model=AuthResponse)
def auth_guest(
    request: Request,
    response: Response,
    body: Optional[GuestAuthRequest] = None,
) -> AuthResponse:
    """
    Authenticate as a guest.
    Creates guest user, issues signed JWT, returns user info and sets httpOnly cookie.
    """
    check_auth_rate_limit(request)

    requested_name = body.nickname if body else None
    nickname = sanitize_nickname(requested_name)
    user_id = str(uuid.uuid4())

    user = User(
        id=user_id,
        nickname=nickname,
        type="guest",
    )
    user_store.save_user(user)

    token = create_access_token(user)
    set_auth_cookie(response, token)

    return AuthResponse(
        player_id=user.id,
        nickname=user.nickname,
        type=user.type,
        avatar_url=user.avatar_url,
        token=token
    )


@router.post("/google", response_model=AuthResponse)
def auth_google(
    request: Request,
    response: Response,
    body: GoogleAuthRequest,
) -> AuthResponse:
    """
    Authenticate via Google OAuth ID token.
    Verifies token with Google, upserts user, issues JWT and sets cookie.
    If GOOGLE_CLIENT_ID is not configured, returns 503.
    """
    check_auth_rate_limit(request)

    if not GOOGLE_CLIENT_ID:
        raise APIError(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server. Please use Guest login.",
            code="GOOGLE_AUTH_UNAVAILABLE"
        )

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        id_info = id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
    except Exception as e:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google token verification failed: {e}",
            code="INVALID_GOOGLE_TOKEN"
        )

    google_sub = id_info.get("sub")
    if not google_sub:
        raise APIError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token missing subject identifier.",
            code="INVALID_GOOGLE_TOKEN"
        )

    existing_user = user_store.get_by_google_sub(google_sub)
    name_hint = id_info.get("given_name") or id_info.get("name") or "Player"
    nickname = sanitize_nickname(name_hint)
    avatar_url = id_info.get("picture")

    if existing_user:
        existing_user.nickname = nickname
        existing_user.avatar_url = avatar_url
        user = user_store.save_user(existing_user)
    else:
        user = User(
            id=str(uuid.uuid4()),
            nickname=nickname,
            type="google",
            avatar_url=avatar_url,
            google_sub=google_sub
        )
        user_store.save_user(user)

    token = create_access_token(user)
    if response:
        set_auth_cookie(response, token)

    return AuthResponse(
        player_id=user.id,
        nickname=user.nickname,
        type=user.type,
        avatar_url=user.avatar_url,
        token=token
    )


@router.get("/me", response_model=CurrentUserResponse)
def auth_me(current_user: User = Depends(get_current_user)) -> CurrentUserResponse:
    """Return the currently authenticated user profile."""
    return CurrentUserResponse(
        player_id=current_user.id,
        nickname=current_user.nickname,
        type=current_user.type,
        avatar_url=current_user.avatar_url
    )


@router.post("/logout")
def auth_logout(response: Response) -> Dict[str, str]:
    """Clear session cookie."""
    response.delete_cookie(key="amendment_token", path="/")
    return {"message": "Logged out successfully"}
