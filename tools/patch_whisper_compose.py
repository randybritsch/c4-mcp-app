from __future__ import annotations

from pathlib import Path


def main() -> int:
    compose_path = Path("/volume1/dockerc4-mcp/c4-voice/compose.yaml")
    text = compose_path.read_text(encoding="utf-8")

    if "WHISPER__COMPUTE_TYPE" in text:
        print("already_patched")
        return 0

    lines = text.splitlines(True)
    out: list[str] = []

    in_whisper = False
    inserted = False

    for line in lines:
        out.append(line)

        if line.startswith("  whisper:"):
            in_whisper = True
            continue

        # Insert right after whisper's image line
        if in_whisper and (not inserted) and line.startswith("    image:"):
            out.extend(
                [
                    "    environment:\n",
                    "      - LOG_LEVEL=info\n",
                    "      - ENABLE_UI=false\n",
                    "      - WHISPER__COMPUTE_TYPE=int8\n",
                    "      - WHISPER__CPU_THREADS=0\n",
                    "      - WHISPER__NUM_WORKERS=1\n",
                    "      - WHISPER__TTL=-1\n",
                ]
            )
            inserted = True
            continue

        # Leave whisper block when we hit the next service
        if in_whisper and line.startswith("  ") and not line.startswith("    ") and not line.startswith("  whisper:"):
            in_whisper = False

    if not inserted:
        raise SystemExit("failed_to_patch: did not find whisper image line")

    compose_path.write_text("".join(out), encoding="utf-8")
    print("patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
