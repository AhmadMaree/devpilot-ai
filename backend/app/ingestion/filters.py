from pathlib import Path

SUPPORTED_EXTENSIONS = {
    ".py": "python",
    ".ts": "typeScript",
    ".js": "javascript",
    ".tsx": "typeScript",
    ".jsx": "javascript",
    ".md": "markdown",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
}


IGNORED_DIR = {
    ".git",
    ".venv",
    "venv",
    ".gitignore",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
}


IGNORED_FILENAMES = {
    ".env",
    ".env.local",
    ".env.local",
    ".env.production",
    ".env.development",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
}


MAX_FILE_SIZE = 256 * 1024  ## 256 kb


def get_language(path: Path) -> str | None:
    return SUPPORTED_EXTENSIONS.get(path.suffix.lower())


def should_include_file(path: Path, root: Path) -> bool:

    relative = path.relative_to(root)

    if any(part in IGNORED_DIR for part in relative.parts[:-1]):
        return False

    filename = path.name.lower()

    if filename in IGNORED_FILENAMES:
        return False

    if filename.startswith(".env."):
        return False

    if get_language(path) is None:
        return False

    if path.is_symlink():
        return False

    if not path.is_file():
        return False

    return path.stat().st_size <= MAX_FILE_SIZE
