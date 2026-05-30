import io
import uuid

import boto3
from fastapi import UploadFile
from PIL import Image

from app.core.config import get_settings


def upload_image_to_s3(file: UploadFile, folder: str, object_name: str | None = None) -> tuple[str, str]:
    settings = get_settings()
    if not settings.s3_bucket or not settings.s3_endpoint_url:
        raise RuntimeError("S3 storage is not configured")

    image = Image.open(file.file).convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=88)
    buffer.seek(0)

    key_name = object_name.strip().strip("/") if object_name else f"{uuid.uuid4()}.webp"
    if not key_name.endswith(".webp"):
        key_name = f"{key_name}.webp"
    key = f"{folder}/{key_name}"
    session = boto3.session.Session()
    client = session.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
    )
    client.upload_fileobj(buffer, settings.s3_bucket, key, ExtraArgs={"ContentType": "image/webp"})
    if settings.s3_public_base_url:
        return key, f"{settings.s3_public_base_url.rstrip('/')}/{key}"
    return key, f"{settings.s3_endpoint_url.rstrip('/')}/{settings.s3_bucket}/{key}"
