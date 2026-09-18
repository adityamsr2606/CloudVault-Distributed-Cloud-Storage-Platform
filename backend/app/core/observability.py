from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import FastAPI, Request
from opentelemetry import propagate, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import SpanKind, Status, StatusCode

from app.core.config import Settings

logger = logging.getLogger("cloudvault.request")


def configure_tracing(settings: Settings) -> trace.Tracer:
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": settings.otel_service_name,
                "deployment.environment.name": settings.environment,
            }
        )
    )

    if settings.otel_exporter_otlp_endpoint:
        exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    return trace.get_tracer(settings.otel_service_name)


def install_observability(app: FastAPI, settings: Settings) -> None:
    tracer = configure_tracing(settings)

    @app.middleware("http")
    async def request_observability(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        started = time.perf_counter()
        extracted_context = propagate.extract(request.headers)

        with tracer.start_as_current_span(
            f"{request.method} {request.url.path}",
            context=extracted_context,
            kind=SpanKind.SERVER,
        ) as span:
            span.set_attribute("http.request.method", request.method)
            span.set_attribute("url.path", request.url.path)
            span.set_attribute("cloudvault.request_id", request_id)

            try:
                response = await call_next(request)
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(Status(StatusCode.ERROR, str(exc)))
                raise
            finally:
                duration_ms = round((time.perf_counter() - started) * 1000, 2)

            response.headers["x-request-id"] = request_id
            span.set_attribute("http.response.status_code", response.status_code)

            span_context = span.get_span_context()
            logger.info(
                json.dumps(
                    {
                        "event": "http_request",
                        "request_id": request_id,
                        "trace_id": format(span_context.trace_id, "032x"),
                        "span_id": format(span_context.span_id, "016x"),
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "duration_ms": duration_ms,
                    }
                )
            )

            return response
