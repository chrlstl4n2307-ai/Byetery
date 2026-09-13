"""Hash exact file bytes with SHA-256. Does not generate Soroban/XDR commitments."""
import argparse
import hashlib
import hmac
import re
from pathlib import Path


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--expected")
    args = parser.parse_args()
    if args.expected and not re.fullmatch(r"[0-9a-fA-F]{64}", args.expected):
        parser.error("--expected must contain 64 hexadecimal characters")
    try:
        actual = sha256_file(args.file)
    except OSError as error:
        parser.exit(2, f"Cannot read file: {error}\n")
    print(f"SHA-256: {actual}")
    if args.expected:
        valid = hmac.compare_digest(actual, args.expected.lower())
        print("MATCH" if valid else "MISMATCH")
        return 0 if valid else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
