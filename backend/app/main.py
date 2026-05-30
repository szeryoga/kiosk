from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.admin import router as admin_router
from app.api.public import router as public_router
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.seed import seed_initial_data

settings = get_settings()
seed_initial_data()

app = FastAPI(title=settings.app_name, debug=settings.debug)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(public_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    finally:
        db.close()
    return {"status": "ok"}
