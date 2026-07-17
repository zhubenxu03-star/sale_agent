from fastapi import APIRouter

from app.api.v1 import auth, conversations, customers, knowledge

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(customers.router, prefix="/customers", tags=["客户"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["会话"])
api_router.include_router(knowledge.router, prefix="/knowledge", tags=["企业知识库"])
