from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.auth import router as auth_router
from app.routers.admin_requests import router as admin_requests_router
from app.routers.admin_services import router as admin_services_router
from app.routers.public_requests import router as public_requests_router
from app.routers.services import router as services_router

app = FastAPI(title="AutoSync API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)
app.include_router(public_requests_router, prefix="/api/v1")
app.include_router(services_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_requests_router, prefix="/api/v1")
app.include_router(admin_services_router, prefix="/api/v1")


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
