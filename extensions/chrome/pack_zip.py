#!/usr/bin/env python3
"""Create a deterministic Chrome Web Store zip from an unpacked extension folder."""
import os
import sys
import zipfile

# Fixed timestamps and permissions keep repeated packaging byte-identical.
FIXED_TIME = (2020, 1, 1, 0, 0, 0)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: pack_zip.py <source-dir> <output.zip>", file=sys.stderr)
        return 2
    source, output = sys.argv[1], sys.argv[2]
    if not os.path.isdir(source):
        print(f"source directory not found: {source}", file=sys.stderr)
        return 2

    entries = []
    for root, dirs, files in os.walk(source):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, source).replace(os.sep, "/")
            entries.append((full, rel))

    if os.path.exists(output):
        os.remove(output)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full, rel in entries:
            info = zipfile.ZipInfo(rel, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o644 & 0xFFFF) << 16
            with open(full, "rb") as fh:
                zf.writestr(info, fh.read(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    with zipfile.ZipFile(output) as zf:
        bad = zf.testzip()
        if bad is not None:
            print(f"corrupt entry: {bad}", file=sys.stderr)
            return 1
        names = zf.namelist()

    print(f"zipped {len(entries)} files -> {output}")
    roots = sorted({n for n in names if "/" not in n})
    print("root files: " + ", ".join(roots))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
