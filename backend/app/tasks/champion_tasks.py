from app.services.champion.processing import process_champion_source
from app.tasks.celery_app import celery_app


@celery_app.task(
    bind=True,
    name="champion.process_source",
    autoretry_for=(ConnectionError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def process_champion_task(self, source_id: str, tenant_id: str, job_id: str) -> dict[str, object]:
    from uuid import UUID

    return process_champion_source(UUID(source_id), UUID(tenant_id), UUID(job_id))
