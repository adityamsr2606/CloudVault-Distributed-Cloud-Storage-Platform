from fastapi import APIRouter

from app.api import auth, files, search

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(files.router)
api_router.include_router(search.router)
