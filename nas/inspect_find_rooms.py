import json
import sys
import urllib.request

BASE = "http://127.0.0.1:3334"


def call(name, arguments):
    url = f"{BASE}/mcp/call"
    payload = {"name": name, "arguments": arguments}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main():
    search = sys.argv[1] if len(sys.argv) > 1 else "Master Bedroom"

    for name, args in [
        ("c4_find_rooms", {"search": search, "limit": 10, "include_raw": False}),
        ("c4_resolve_room", {"name": search, "include_candidates": True, "require_unique": False}),
    ]:
        print("\n===", name, "===")
        print(call(name, args)[:12000])


if __name__ == "__main__":
    main()
