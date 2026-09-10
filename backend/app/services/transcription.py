"""
Speech-to-Text Transcription Service.
Uses OpenAI Whisper API when OPENAI_API_KEY is configured.
Falls back gracefully with clear labeling when unavailable.
"""
import io
import logging
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionResult:
    text: str
    language: str | None
    model_name: str
    inference_time_ms: int | None
    is_available: bool
    engine: str    # "openai_whisper" | "browser_fallback" | "unavailable"


def transcribe(audio_bytes: bytes, language: str = "en") -> TranscriptionResult:
    """
    Transcribe audio bytes using OpenAI Whisper API if configured.
    Returns a clearly labeled result indicating which engine was used.
    Never pretends to transcribe when no engine is available.
    """
    from app.config import get_settings
    settings = get_settings()

    api_key = settings.openai_api_key
    if not api_key or not api_key.strip() or api_key.startswith("INSECURE"):
        return TranscriptionResult(
            text="",
            language=language,
            model_name="OpenAI Whisper (not configured)",
            inference_time_ms=None,
            is_available=False,
            engine="unavailable",
        )

    t0 = time.monotonic()
    try:
        import openai
        client = openai.OpenAI(api_key=api_key)

        # Wrap bytes in a file-like object with a filename hint
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "recording.wav"

        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=language if language != "auto" else None,
            response_format="text",
        )

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        text = response.strip() if isinstance(response, str) else str(response).strip()

        return TranscriptionResult(
            text=text,
            language=language,
            model_name="whisper-1",
            inference_time_ms=elapsed_ms,
            is_available=True,
            engine="openai_whisper",
        )

    except ImportError:
        logger.warning("openai package not installed — transcription unavailable")
        return TranscriptionResult(
            text="",
            language=language,
            model_name="OpenAI Whisper (package missing)",
            inference_time_ms=None,
            is_available=False,
            engine="unavailable",
        )
    except Exception as exc:
        logger.warning("OpenAI transcription failed: %s", exc)
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        return TranscriptionResult(
            text="",
            language=language,
            model_name="OpenAI Whisper (error)",
            inference_time_ms=elapsed_ms,
            is_available=False,
            engine="unavailable",
        )


def transcribe_audio(audio_bytes: bytes) -> str | None:
    """
    Convenience wrapper that returns just the text string, or None on failure.
    Used by OpenAITranscriptionService in base_detector.py.
    """
    result = transcribe(audio_bytes)
    return result.text if result.is_available and result.text else None
