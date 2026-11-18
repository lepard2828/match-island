"""Build a static website and ZIP without publishing private project files."""
from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED


PUBLIC_FILES = ("index.html", "style.css", "engine.js", "app.js")


def build():
    root = Path(__file__).resolve().parent
    output = root / "dist" / "site"
    if output.is_symlink() or (root / "dist").is_symlink():
        raise RuntimeError("Refusing to write through a symlink.")
    for name in PUBLIC_FILES:
        if not (root / name).is_file():
            raise FileNotFoundError(root / name)
    output.mkdir(parents=True, exist_ok=True)
    unexpected = {p.name for p in output.iterdir()} - set(PUBLIC_FILES)
    if unexpected:
        raise RuntimeError(f"Unexpected release files; review manually before publishing: {unexpected}")
    for name in PUBLIC_FILES:
        destination = output / name
        if destination.is_symlink():
            raise RuntimeError(f"Refusing to overwrite symlink: {destination}")
        copyfile(root / name, destination)
    archive = root / "dist" / "match-island.zip"
    if archive.is_symlink():
        raise RuntimeError("Refusing to overwrite a symlink archive.")
    with ZipFile(archive, "w", ZIP_DEFLATED) as package:
        for name in PUBLIC_FILES:
            package.write(output / name, arcname=name)
    print(f"Website: {output}")
    print(f"Upload package: {archive}")
    print("Public files: " + ", ".join(PUBLIC_FILES))


if __name__ == "__main__":
    build()
