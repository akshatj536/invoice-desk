"""Thin wrapper around Gemini: structured output, timeout, one retry, call metadata.

The model is only ever asked to *read* or *interpret* (extract fields, pair lines,
suggest a PO, explain a decision). It never decides and never writes.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from . import config

T = TypeVar("T", bound=BaseModel)

_client: genai.Client | None = None


class LLMError(RuntimeError):
    pass


@dataclass
class CallMeta:
    purpose: str
    model: str
    latency_ms: int = 0
    attempts: int = 0
    thinking: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    error: str | None = None

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class LLMResult:
    value: BaseModel
    meta: CallMeta
    raw_text: str = field(default="", repr=False)


def client() -> genai.Client:
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise LLMError("GEMINI_API_KEY is not set")
        _client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=int(config.GEMINI_TIMEOUT_S * 1000)),
        )
    return _client


def pdf_part(pdf_bytes: bytes) -> types.Part:
    return types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")


def generate(
    *,
    purpose: str,
    contents: list,
    schema: type[T],
    system: str,
    model: str | None = None,
    retries: int = 2,
    thinking: str | None = "low",
) -> LLMResult:
    """Call Gemini and return a validated instance of `schema`.

    Raises LLMError after `retries` extra attempts; callers turn that into a
    fail-closed HOLD rather than guessing.
    """
    model = model or config.GEMINI_MODEL
    meta = CallMeta(purpose=purpose, model=model, thinking=thinking or "default")
    base = dict(system_instruction=system, response_mime_type="application/json", response_schema=schema,
                temperature=0)
    cfg = types.GenerateContentConfig(**base, **(
        {"thinking_config": types.ThinkingConfig(thinking_level=thinking)} if thinking else {}))
    last_err: Exception | None = None
    started = time.perf_counter()
    for attempt in range(retries + 1):
        meta.attempts = attempt + 1
        try:
            resp = client().models.generate_content(model=model, contents=contents, config=cfg)
            text = resp.text or ""
            parsed = resp.parsed if isinstance(resp.parsed, schema) else schema.model_validate_json(text)
            usage = getattr(resp, "usage_metadata", None)
            if usage is not None:
                meta.input_tokens = getattr(usage, "prompt_token_count", None)
                meta.output_tokens = getattr(usage, "candidates_token_count", None)
            meta.latency_ms = int((time.perf_counter() - started) * 1000)
            return LLMResult(value=parsed, meta=meta, raw_text=text)
        except Exception as e:  # network, timeout, schema validation, safety block
            last_err = e
            if thinking and "hinking" in str(e):  # model doesn't support this thinking level
                cfg, thinking = types.GenerateContentConfig(**base), None
                meta.thinking = "default"
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    meta.latency_ms = int((time.perf_counter() - started) * 1000)
    meta.error = f"{type(last_err).__name__}: {last_err}"
    raise LLMError(meta.error)
