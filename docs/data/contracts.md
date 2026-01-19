# Data Contracts

**Project:** C4-MCP-App  
**Version:** 1.0.0  
**Last Updated:** January 19, 2026

> [← Back to Project Overview](../project_overview.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Schema Definitions](#schemas)
3. [Versioning Strategy](#versioning)
4. [Compatibility Policy](#compatibility)
5. [Validation Rules](#validation)

---

## 1. Overview {#overview}

This document defines all data contracts (schemas) used in the C4-MCP-App system. These contracts govern communication between:

- **PWA Frontend ↔ Backend Service** (HTTP/WebSocket)
- **Backend Service ↔ Cloud APIs** (HTTP)
- **Backend Service ↔ MCP Server** (MCP Protocol)

All schemas use **JSON** format unless otherwise specified.

---

## 2. Schema Definitions {#schemas}

### 2.1 Authentication Schemas

#### Login Request

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["device_id"],
  "properties": {
    "device_id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique device identifier (UUID v4)"
    }
  }
}
```

**Example:**

```json
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Login Response

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["token", "expires_in"],
  "properties": {
    "token": {
      "type": "string",
      "description": "JWT authentication token"
    },
    "expires_in": {
      "type": "integer",
      "description": "Token expiry in seconds",
      "minimum": 1
    }
  }
}
```

**Example:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 2592000
}
```

---

### 2.2 Voice Command Schemas

#### Voice Request

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["audio", "format", "duration_ms", "device_id", "timestamp"],
  "properties": {
    "audio": {
      "type": "string",
      "description": "Base64-encoded audio data",
      "maxLength": 7000000
    },
    "format": {
      "type": "string",
      "enum": ["webm", "wav", "mp3"],
      "description": "Audio file format"
    },
    "duration_ms": {
      "type": "integer",
      "description": "Audio duration in milliseconds",
      "minimum": 100,
      "maximum": 10000
    },
    "device_id": {
      "type": "string",
      "format": "uuid",
      "description": "Device UUID"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp"
    }
  }
}
```

**Example:**

```json
{
  "audio": "GkXfo59ChoEBQveBAULygQRC84EIQoKE...",
  "format": "webm",
  "duration_ms": 3500,
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

#### Voice Response

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["request_id", "status", "message"],
  "properties": {
    "request_id": {
      "type": "string",
      "description": "Unique request identifier"
    },
    "status": {
      "type": "string",
      "enum": ["processing", "success", "error"],
      "description": "Processing status"
    },
    "message": {
      "type": "string",
      "description": "Human-readable status message"
    }
  }
}
```

**Example:**

```json
{
  "request_id": "req-xyz789",
  "status": "processing",
  "message": "Voice command received and processing"
}
```

---

### 2.3 Chat Command Schemas

#### Chat Request

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["message", "device_id", "timestamp"],
  "properties": {
    "message": {
      "type": "string",
      "description": "User's text command",
      "minLength": 1,
      "maxLength": 500
    },
    "device_id": {
      "type": "string",
      "format": "uuid",
      "description": "Device UUID"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp"
    }
  }
}
```

**Example:**

```json
{
  "message": "Turn on the living room lights",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

#### Chat Response

Same as Voice Response (see 2.2).

---

### 2.4 Intent Schema (Internal)

Used internally between LLM service and MCP client.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["action", "device", "confidence"],
  "properties": {
    "action": {
      "type": "string",
      "enum": [
        "turn_on", "turn_off", "set_temperature", 
        "set_brightness", "lock", "unlock", "open", "close"
      ],
      "description": "Action to perform"
    },
    "device": {
      "type": "string",
      "description": "User-friendly device name or ID"
    },
    "parameters": {
      "type": "object",
      "description": "Action-specific parameters",
      "additionalProperties": true
    },
    "confidence": {
      "type": "number",
      "description": "LLM confidence score",
      "minimum": 0,
      "maximum": 1
    }
  }
}
```

**Example:**

```json
{
  "action": "turn_on",
  "device": "living_room_lights",
  "parameters": {
    "brightness": 80,
    "color": "warm_white"
  },
  "confidence": 0.95
}
```

---

### 2.5 WebSocket Message Schemas

#### Transcript Message

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "content", "request_id", "timestamp"],
  "properties": {
    "type": {
      "type": "string",
      "const": "transcript"
    },
    "content": {
      "type": "string",
      "description": "Transcribed text"
    },
    "confidence": {
      "type": "number",
      "description": "STT confidence score",
      "minimum": 0,
      "maximum": 1
    },
    "request_id": {
      "type": "string",
      "description": "Request identifier"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

#### Intent Message

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "content", "intent", "request_id", "timestamp"],
  "properties": {
    "type": {
      "type": "string",
      "const": "intent"
    },
    "content": {
      "type": "string",
      "description": "Human-readable intent description"
    },
    "intent": {
      "type": "object",
      "description": "Structured intent object (see 2.4)"
    },
    "request_id": {
      "type": "string"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

#### Execution Message

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "content", "status", "request_id", "timestamp"],
  "properties": {
    "type": {
      "type": "string",
      "const": "execution"
    },
    "content": {
      "type": "string",
      "description": "Execution result message"
    },
    "status": {
      "type": "string",
      "enum": ["success", "error"],
      "description": "Execution status"
    },
    "request_id": {
      "type": "string"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

#### Error Message

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "content", "error_code", "request_id", "timestamp"],
  "properties": {
    "type": {
      "type": "string",
      "const": "error"
    },
    "content": {
      "type": "string",
      "description": "Error message"
    },
    "error_code": {
      "type": "string",
      "description": "Application error code"
    },
    "request_id": {
      "type": "string"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

---

### 2.6 Device Schemas

#### Device Object

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name", "type", "room", "capabilities", "state"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique device identifier"
    },
    "name": {
      "type": "string",
      "description": "User-friendly device name"
    },
    "type": {
      "type": "string",
      "enum": [
        "light", "thermostat", "lock", "garage_door", 
        "blinds", "av_receiver", "camera", "sensor"
      ],
      "description": "Device type"
    },
    "room": {
      "type": "string",
      "description": "Room or zone name"
    },
    "capabilities": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Supported actions/features"
    },
    "state": {
      "type": "object",
      "description": "Current device state",
      "additionalProperties": true
    }
  }
}
```

**Example:**

```json
{
  "id": "device_12345",
  "name": "Living Room Lights",
  "type": "light",
  "room": "Living Room",
  "capabilities": ["on_off", "dimming", "color"],
  "state": {
    "power": "on",
    "brightness": 80,
    "color": "warm_white"
  }
}
```

#### Device List Response

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["devices", "total"],
  "properties": {
    "devices": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/Device"
      }
    },
    "total": {
      "type": "integer",
      "description": "Total number of devices"
    }
  }
}
```

---

### 2.7 MCP Protocol Schemas

#### MCP Command

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["type", "target", "action"],
  "properties": {
    "type": {
      "type": "string",
      "const": "command",
      "description": "Message type"
    },
    "target": {
      "type": "string",
      "description": "Device ID in Control4 system"
    },
    "action": {
      "type": "string",
      "description": "Action to perform"
    },
    "params": {
      "type": "object",
      "description": "Action-specific parameters",
      "additionalProperties": true
    }
  }
}
```

**Example:**

```json
{
  "type": "command",
  "target": "device_12345",
  "action": "set_state",
  "params": {
    "state": "on",
    "brightness": 80
  }
}
```

#### MCP Response

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["success", "message"],
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether command succeeded"
    },
    "message": {
      "type": "string",
      "description": "Result message"
    },
    "data": {
      "type": "object",
      "description": "Optional result data",
      "additionalProperties": true
    }
  }
}
```

**Example:**

```json
{
  "success": true,
  "message": "Device state updated",
  "data": {
    "device_id": "device_12345",
    "new_state": {
      "power": "on",
      "brightness": 80
    }
  }
}
```

---

### 2.8 Error Response Schema

Standard error response for all HTTP endpoints.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["error"],
  "properties": {
    "error": {
      "type": "object",
      "required": ["code", "message", "timestamp"],
      "properties": {
        "code": {
          "type": "string",
          "description": "Application error code"
        },
        "message": {
          "type": "string",
          "description": "Human-readable error message"
        },
        "details": {
          "type": "string",
          "description": "Additional error details (optional)"
        },
        "request_id": {
          "type": "string",
          "description": "Request identifier for tracing"
        },
        "timestamp": {
          "type": "string",
          "format": "date-time",
          "description": "Error timestamp"
        }
      }
    }
  }
}
```

**Example:**

```json
{
  "error": {
    "code": "INTENT_PARSE_ERROR",
    "message": "Failed to parse intent: ambiguous command",
    "details": "LLM returned unparseable JSON",
    "request_id": "req-xyz789",
    "timestamp": "2026-01-19T10:30:02Z"
  }
}
```

---

## 3. Versioning Strategy {#versioning}

### API Versioning

- **URL-Based:** `/api/v1/`, `/api/v2/`
- **Version Increment:** Major version (v1 → v2) when breaking changes occur
- **Backward Compatibility:** v1 must remain functional until all clients upgrade

### Schema Versioning

- **Additive Changes:** New fields can be added without version bump (backward compatible)
- **Breaking Changes:** Removing fields, changing types, or renaming requires new major version
- **Optional Fields:** Prefer optional fields over required fields when possible

### Version Numbering

- **Format:** `MAJOR.MINOR.PATCH` (Semantic Versioning)
- **MAJOR:** Breaking changes (e.g., removed fields)
- **MINOR:** Additive changes (e.g., new optional fields)
- **PATCH:** Bug fixes, documentation updates

**Current Version:** 1.0.0

---

## 4. Compatibility Policy {#compatibility}

### Backward Compatibility Guarantees

1. **Existing Fields:** Will not be removed or renamed in minor/patch versions
2. **Field Types:** Will not change in minor/patch versions
3. **Enum Values:** New values may be added; existing values will not be removed
4. **Optional Fields:** New optional fields may be added without notice
5. **Required Fields:** Will never become required in minor/patch versions

### Forward Compatibility

- **Unknown Fields:** Clients should ignore unknown fields (forward compatibility)
- **Additional Enum Values:** Clients should handle unknown enum values gracefully

### Deprecation Process

1. **Announce:** Deprecation notice in release notes and API documentation
2. **Grace Period:** Deprecated features remain functional for at least 6 months
3. **Warning:** Deprecated endpoints return `X-Deprecated: true` header
4. **Removal:** After grace period, feature is removed in next major version

**Example:**

```http
HTTP/1.1 200 OK
X-Deprecated: true
X-Deprecation-Message: This endpoint will be removed in v2.0.0. Use /api/v2/devices instead.
```

---

## 5. Validation Rules {#validation}

### Common Validation Rules

| Field Type | Rule | Example |
|------------|------|---------|
| UUID | Must be valid UUID v4 | `550e8400-e29b-41d4-a716-446655440000` |
| Timestamp | Must be ISO 8601 format | `2026-01-19T10:30:00Z` |
| Audio | Base64-encoded, max 5MB | `GkXfo59ChoEBQveBAULygQ...` |
| Text | Max 500 characters, UTF-8 | `"Turn on the lights"` |
| Enum | Must be one of allowed values | `"webm"` (not `"ogg"`) |

### Field-Specific Validation

**device_id:**

- Format: UUID v4
- Example: `550e8400-e29b-41d4-a716-446655440000`
- Validation: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`

**audio:**

- Encoding: Base64
- Max size: 5MB (7MB base64-encoded)
- Validation: Check decoded size before processing

**duration_ms:**

- Type: Integer
- Min: 100 (0.1 seconds)
- Max: 10000 (10 seconds)

**message:**

- Type: String
- Min length: 1
- Max length: 500
- Encoding: UTF-8

**action:**

- Type: String (enum)
- Allowed values: `turn_on`, `turn_off`, `set_temperature`, `set_brightness`, `lock`, `unlock`, `open`, `close`

### Validation Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request format",
    "details": "Field 'duration_ms' must be between 100 and 10000",
    "field": "duration_ms",
    "timestamp": "2026-01-19T10:30:00Z"
  }
}
```

---

## Schema Change Log

| Version | Date | Changes | Breaking |
|---------|------|---------|----------|
| 1.0.0 | 2026-01-19 | Initial schema definitions | N/A |

---

## Related Documents

- [← Project Overview](../project_overview.md)
- [Architecture Details](../architecture.md)
- [API Endpoints](../api/endpoints.md)
- [Backend Service Module](../modules/backend-service.md)

---

**Maintained By:** Randy Britsch  
**Last Updated:** January 19, 2026  
**Schema Version:** 1.0.0
