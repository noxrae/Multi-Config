from __future__ import annotations

import zipfile
from pathlib import Path


class ZipHandlerError(Exception):
    """Raised when ZIP validation or extraction fails."""


def _is_within_directory(base: Path, target: Path) -> bool:
    base_resolved = base.resolve()
    target_resolved = target.resolve()
    return target_resolved == base_resolved or base_resolved in target_resolved.parents


def validate_zip_file(zip_path: Path) -> None:
    if not zip_path.exists():
        raise ZipHandlerError(f'ZIP file not found: {zip_path}')
    if not zip_path.is_file():
        raise ZipHandlerError(f'Provided path is not a file: {zip_path}')
    if zip_path.suffix.lower() != '.zip':
        raise ZipHandlerError('Input must be a .zip file')


def extract_zip_safely(zip_path: Path, destination: Path) -> Path:
    validate_zip_file(zip_path)
    destination.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            for member in zf.infolist():
                member_target = destination / member.filename
                if not _is_within_directory(destination, member_target):
                    raise ZipHandlerError('Unsafe ZIP content detected (path traversal attempt)')
                if member.is_dir():
                    member_target.mkdir(parents=True, exist_ok=True)
                    continue
                member_target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member, 'r') as src, member_target.open('wb') as dst:
                    dst.write(src.read())
    except zipfile.BadZipFile as exc:
        raise ZipHandlerError('Corrupted or invalid ZIP file') from exc

    return destination
