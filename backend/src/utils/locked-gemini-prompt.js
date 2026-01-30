const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// SHA-256 of backend/prompts/gemini_system_prompt_LOCKED.md with CRLF normalized to LF.
// Update this intentionally when you intentionally change the locked prompt.
const LOCKED_PROMPT_SHA256 = '88b5c6a76009220682a0c1128737fa4be13b4b92982ee023ea08da7924e41712';

function lockedPromptPath() {
  // backend/src/utils -> backend/prompts
  return path.join(__dirname, '..', '..', 'prompts', 'gemini_system_prompt_LOCKED.md');
}

function normalizeForHash(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function assertLockedGeminiPromptIntegrity() {
  const filePath = lockedPromptPath();

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const e = new Error(`Locked Gemini prompt file is missing/unreadable: ${filePath}`);
    e.code = 'LOCKED_GEMINI_PROMPT_MISSING';
    e.details = { filePath, error: String(err?.message || err) };
    throw e;
  }

  const normalized = normalizeForHash(raw);
  const hash = sha256Hex(normalized);

  if (hash !== LOCKED_PROMPT_SHA256) {
    const e = new Error('Locked Gemini prompt integrity check failed (SHA mismatch)');
    e.code = 'LOCKED_GEMINI_PROMPT_HASH_MISMATCH';
    e.details = { filePath, expected: LOCKED_PROMPT_SHA256, actual: hash };
    throw e;
  }

  return { filePath, sha256: hash };
}

function readLockedGeminiPrompt() {
  // Validate first so we never silently run with a modified prompt.
  assertLockedGeminiPromptIntegrity();
  return fs.readFileSync(lockedPromptPath(), 'utf8');
}

module.exports = {
  assertLockedGeminiPromptIntegrity,
  readLockedGeminiPrompt,
};
