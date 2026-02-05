from pathlib import Path

PATH = Path("/volume1/dockerc4-mcp/c4-voice/backend/src/services/mcp-client.js")

s = PATH.read_text(encoding="utf-8")

old = (
    "      const source = (typeof args.source_device_name === 'string' ? args.source_device_name : null)\n"
    "        || (typeof args.sourceDeviceName === 'string' ? args.sourceDeviceName : null);\n"
    "      const device = (typeof args.device_name === 'string' ? args.device_name : null)\n"
    "        || (typeof args.deviceName === 'string' ? args.deviceName : null);\n\n"
    "      if ((!source || !String(source).trim()) && device && String(device).trim()) {\n"
    "        args.source_device_name = String(device).trim();\n"
    "      } else if (source && String(source).trim()) {\n"
    "        args.source_device_name = String(source).trim();\n"
    "      }\n\n"
    "      // These tools do not accept device_name; keep only source_device_name.\n"
    "      delete args.device_name;\n"
    "      delete args.deviceName;\n"
    "      delete args.sourceDeviceName;\n"
)

new = (
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
)

if old not in s:
    raise SystemExit("Expected old normalization block not found; aborting to avoid corrupting the file")

s2 = s.replace(old, new)
PATH.write_text(s2, encoding="utf-8")
print("Updated normalization block in", str(PATH))
