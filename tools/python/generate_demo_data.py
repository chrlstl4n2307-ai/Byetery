"""Generate deterministic fictional battery metadata; no state machine or wallet keys."""
import argparse
import json
import random
from pathlib import Path


def generate(count, seed):
    rng = random.Random(seed)
    return {
        "schema_version": 1,
        "fictional": True,
        "seed": seed,
        "batteries": [
            {"battery_id": f"BYE-{i:06d}", "chemistry": rng.choice(["ALKALINE", "NIMH"]),
             "format": rng.choice(["AA", "AAA"]), "demo_batch": f"DEMO-{seed}"}
            for i in range(1, count + 1)
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 1 <= args.count <= 100000:
        parser.error("--count must be between 1 and 100000")
    content = json.dumps(generate(args.count, args.seed), ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content, encoding="utf-8", newline="\n")
        print(f"Generated {args.count} fictional batteries: {args.output}")
    else:
        print(content, end="")


if __name__ == "__main__":
    main()
