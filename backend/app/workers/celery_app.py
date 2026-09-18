from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "cloudvault",
    broker=settings.celery_broker_url,
    backend=settings.redis_url,
)
celery_app.conf.update(
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=300,
    task_soft_time_limit=270,
)
celery_app.autodiscover_tasks(["app.workers"])
