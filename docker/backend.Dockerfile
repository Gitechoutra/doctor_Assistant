# syntax=docker/dockerfile:1.7
#
# MediAssist AI -- backend (Flask + Socket.IO + MySQL client)
#
# Build context is the project root (doctor_Assistant/), not this folder, so
# the image can copy backend/ unchanged. See compose.yaml:
#
#   docker compose -f docker/compose.yaml build backend
#
# What this image is NOT: a rewrite of how the app starts. `python app.py` is
# the app's own entry point (Socket.IO's runner rather than plain WSGI -- the
# consultation websocket needs it), and that is exactly what the container
# runs. Nothing under backend/ is modified, moved or generated here.

# ---------------------------------------------------------------------------
# Stage 1 -- build the virtualenv
# ---------------------------------------------------------------------------
# python:3.12-slim, not 3.13: the local venv runs 3.13, but 3.12 has the widest
# manylinux wheel coverage for cryptography / reportlab / google-genai, so the
# whole install resolves without a compiler in the image.
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# The application's own dependency file, used as-is. It is copied, never
# edited: the filtering below happens on a throwaway copy inside the image.
COPY backend/requirements.txt ./requirements.txt

# torch and openai-whisper are listed in requirements.txt but imported nowhere
# in backend/ -- the working venv on the development machine does not have
# them installed either, which is the practical proof they are not needed to
# run. Pulling them adds ~1 GB and several minutes to every build for code
# that never executes, so they are dropped from *this image's* install.
#
# Set INSTALL_TRANSCRIBER_EXTRAS=true at build time to put them back; the CPU
# wheel index is the one requirements.txt itself documents for that case.
#
#   docker compose -f docker/compose.yaml build \
#     --build-arg INSTALL_TRANSCRIBER_EXTRAS=true backend
ARG INSTALL_TRANSCRIBER_EXTRAS=false

RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --upgrade pip \
 && if [ "$INSTALL_TRANSCRIBER_EXTRAS" = "true" ]; then \
        /opt/venv/bin/pip install -r requirements.txt \
            --extra-index-url https://download.pytorch.org/whl/cpu ; \
    else \
        grep -viE '^[[:space:]]*(torch|openai-whisper)[[:space:]]*$' requirements.txt \
            > /tmp/requirements.docker.txt \
        && /opt/venv/bin/pip install -r /tmp/requirements.docker.txt ; \
    fi

# ---------------------------------------------------------------------------
# Stage 2 -- runtime
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# ffmpeg: portal/ai/gemini_client.py shells out to the literal command
# "ffmpeg" to turn the browser's webm recording into wav before transcription.
# Debian's build is used rather than the binary bundled with imageio-ffmpeg
# because portal/ai/ffmpeg_setup.py copies that one to the Windows-shaped name
# ".bin/ffmpeg.exe", which Linux will not resolve as `ffmpeg`. Installing the
# real thing keeps that source file untouched and the command resolvable.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

COPY --from=builder /opt/venv /opt/venv

# Unprivileged. A fixed uid/gid so the named volumes below keep working after
# a rebuild.
RUN groupadd --gid 10001 app \
 && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin app

WORKDIR /app/backend

# The backend tree, exactly as it is on disk. .dockerignore beside this file
# keeps venv/, .bin/, uploads/, logs/, .env and config/dev.ini out -- no local
# secret is ever baked into the image, and configuration arrives through the
# environment (config/config.py already prefers real environment variables
# over every other source).
COPY --chown=10001:10001 backend/ /app/backend/

# Written to at runtime, so they must exist and be owned by the runtime user
# before the volumes are mounted over them:
#   uploads/ -- avatars, patient photos, generated PDFs
#   logs/    -- portal/logger.py's rotating handler
#   .bin/    -- portal/ai/ffmpeg_setup.py copies a binary here on import; an
#               unwritable directory would fail that import and take the whole
#               app down at start.
RUN mkdir -p /app/backend/uploads /app/backend/logs /app/backend/.bin \
 && chown -R 10001:10001 /app/backend/uploads /app/backend/logs /app/backend/.bin

COPY --chown=10001:10001 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER 10001:10001

# The port app.py binds (socketio.run(host="0.0.0.0", port=5000)).
EXPOSE 5000

# /api/health is the app's own endpoint (portal/__init__.py:_register_health).
# urllib rather than curl so the image needs no extra package.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/api/health', timeout=4).status == 200 else 1)"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["python", "app.py"]
