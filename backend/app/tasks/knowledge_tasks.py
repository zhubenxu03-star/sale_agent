from uuid import UUID

from app.services.knowledge.processing import process_knowledge_document
from app.tasks.celery_app import celery_app


@celery_app.task(
    bind=True,
    name="knowledge.process_document",
    autoretry_for=(ConnectionError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def process_document_task(self, document_id: str, tenant_id: str, job_id: str) -> dict[str, object]:
    return process_knowledge_document(UUID(document_id), UUID(tenant_id), UUID(job_id))
