from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings


security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    if credentials is None:
        return {"sub": "anonymous"}

    token = credentials.credentials

    if not settings.supabase_jwt_secret:
        return {"sub": "anonymous"}

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as exc:
        if settings.allow_anon_read:
            return {"sub": "anonymous"}
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token") from exc
