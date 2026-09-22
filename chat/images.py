"""Where generated images go. With IMAGE_BUCKET set (production) the bytes land in a public-read GCS bucket
under an unguessable name and the message stores the URL. Without it (local dev) the image is inlined as a
data URI, which works but bloats the messages table."""
import asyncio
import base64
import os
import uuid

BUCKET = os.environ.get("IMAGE_BUCKET")
EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}


async def store(mime: str, data: bytes) -> str:
    if not BUCKET:
        return f"data:{mime};base64,{base64.b64encode(data).decode()}"
    from google.cloud import storage  # imported here so local runs without the bucket never load it

    name = f"{uuid.uuid4()}.{EXT.get(mime, 'bin')}"

    def upload():
        blob = storage.Client().bucket(BUCKET).blob(name)
        blob.cache_control = "public, max-age=31536000, immutable"
        blob.upload_from_string(data, content_type=mime)

    await asyncio.to_thread(upload)
    return f"https://storage.googleapis.com/{BUCKET}/{name}"
