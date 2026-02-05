from pathlib import Path

PATH = Path("/volume1/dockerc4-mcp/c4-voice/backend/src/services/mcp-client.js")

s = PATH.read_text(encoding="utf-8")
changed = False

if "_normalizeArgsForTool(toolName" not in s:
    needle = "  }\n\n  getToolAllowlist() {"
    insert = (
        "  }\n\n"
        "  _normalizeArgsForTool(toolName, rawArgs) {\n"
        "    const args = (rawArgs && typeof rawArgs === 'object') ? { ...rawArgs } : {};\n\n"
        "    // Compatibility shims for LLM/planner outputs.\n"
        "    // c4-mcp tool schemas are strict; passing unexpected args can 500.\n"
        "    if (toolName === 'c4_tv_watch_by_name' || toolName === 'c4_room_listen_by_name') {\n"
        "      const source = (typeof args.source_device_name === 'string' ? args.source_device_name : null)\n"
        "        || (typeof args.sourceDeviceName === 'string' ? args.sourceDeviceName : null);\n"
        "      const video = (typeof args.video_device_name === 'string' ? args.video_device_name : null)\n"
        "        || (typeof args.videoDeviceName === 'string' ? args.videoDeviceName : null);\n"
        "      const device = (typeof args.device_name === 'string' ? args.device_name : null)\n"
        "        || (typeof args.deviceName === 'string' ? args.deviceName : null);\n\n"
        "      const pick = (v) => (v && String(v).trim() ? String(v).trim() : null);\n"
        "      const chosen = pick(source) || pick(video) || pick(device);\n"
        "      if (chosen) {\n"
        "        args.source_device_name = chosen;\n"
        "      }\n\n"
        "      // These tools do not accept device_name/video_device_name; keep only source_device_name.\n"
        "      delete args.device_name;\n"
        "      delete args.deviceName;\n"
        "      delete args.video_device_name;\n"
        "      delete args.videoDeviceName;\n"
        "      delete args.sourceDeviceName;\n"
        "    }\n\n"
        "    return args;\n"
        "  }\n\n"
        "  getToolAllowlist() {"
    )

    if needle not in s:
        raise SystemExit(f"Patch failed: constructor needle not found: {needle!r}")

    s = s.replace(needle, insert)
    changed = True

if "const { args } = intent;" in s and "const args = this._normalizeArgsForTool(toolName, intent.args);" not in s:
    s2 = s.replace(
        "const { args } = intent;",
        "const args = this._normalizeArgsForTool(toolName, intent.args);",
    )
    if s2 != s:
        s = s2
        changed = True

if changed:
    PATH.write_text(s, encoding="utf-8")
    print("Patched", str(PATH))
else:
    print("No changes needed", str(PATH))
