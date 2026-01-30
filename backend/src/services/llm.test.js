function loadParseIntentWithEnv(env) {
  const prev = { ...process.env };
  Object.assign(process.env, env || {});
  jest.resetModules();
  // eslint-disable-next-line global-require
  const { parseIntent } = require('./llm');

  const restore = () => {
    process.env = prev;
    jest.resetModules();
  };

  return { parseIntent, restore };
}

describe('llm.parseIntent (Gemini decides)', () => {
  test('parses basic commands when LLM_PROVIDER=heuristic', async () => {
    const { parseIntent, restore } = loadParseIntentWithEnv({
      LLM_PROVIDER: 'heuristic',
    });

    const intent = await parseIntent('Turn off the TV', 'corr-1');
    restore();

    expect(intent).toEqual({ tool: 'c4_tv_off_last', args: {} });
  });

  test('throws when OPENAI_API_KEY is missing (fallback disabled)', async () => {
    const { parseIntent, restore } = loadParseIntentWithEnv({
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: '',
      LLM_ALLOW_HEURISTICS_FALLBACK: '',
    });

    await expect(parseIntent('Turn on the Kitchen lights', 'corr-1'))
      .rejects
      .toMatchObject({ code: 'LLM_ERROR', statusCode: 500 });

    restore();
  });

  test('throws when GOOGLE_GEMINI_API_KEY is missing (fallback disabled)', async () => {
    const { parseIntent, restore } = loadParseIntentWithEnv({
      LLM_PROVIDER: 'google',
      GOOGLE_GEMINI_API_KEY: '',
      LLM_ALLOW_HEURISTICS_FALLBACK: '',
    });

    await expect(parseIntent('Turn on the Kitchen lights', 'corr-1'))
      .rejects
      .toMatchObject({ code: 'LLM_ERROR', statusCode: 500 });

    restore();
  });

  test('propagates Gemini quota/rate-limit errors when fallback is disabled', async () => {
    const prevFetch = global.fetch;

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: 429,
          message: 'RESOURCE_EXHAUSTED: quota exceeded',
          status: 'RESOURCE_EXHAUSTED',
        },
      }),
    }));

    const { parseIntent, restore } = loadParseIntentWithEnv({
      LLM_PROVIDER: 'gemini',
      GOOGLE_GEMINI_API_KEY: 'gemini-test',
      GOOGLE_GEMINI_MODEL: 'gemini-1.5-flash',
      LLM_ALLOW_HEURISTICS_FALLBACK: '',
    });

    await expect(parseIntent('Turn off the TV', 'corr-1'))
      .rejects
      .toMatchObject({ code: 'LLM_ERROR' });

    restore();
    global.fetch = prevFetch;
  });

  test('falls back to heuristics on Gemini quota/rate-limit errors when explicitly enabled', async () => {
    const prevFetch = global.fetch;

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: 429,
          message: 'RESOURCE_EXHAUSTED: quota exceeded',
          status: 'RESOURCE_EXHAUSTED',
        },
      }),
    }));

    const { parseIntent, restore } = loadParseIntentWithEnv({
      LLM_PROVIDER: 'gemini',
      GOOGLE_GEMINI_API_KEY: 'gemini-test',
      GOOGLE_GEMINI_MODEL: 'gemini-1.5-flash',
      LLM_ALLOW_HEURISTICS_FALLBACK: '1',
    });

    const intent = await parseIntent('Turn off the TV', 'corr-1');

    restore();
    global.fetch = prevFetch;

    expect(intent).toEqual({ tool: 'c4_tv_off_last', args: {} });
  });

  test('normalizes GOOGLE_GEMINI_MODEL typos (gemeni -> gemini)', async () => {
    const prevFetch = global.fetch;

    global.fetch = jest.fn(async (url) => {
      // If the code fails to normalize the model name, it will try to call the wrong URL.
      if (String(url).includes('gemeni-')) {
        throw new Error('Model name was not normalized');
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '{"tool":"c4_list_rooms","args":{}}' }],
              },
            },
          ],
        }),
      };
    });

    const { parseIntent, restore } = loadParseIntentWithEnv({
      LLM_PROVIDER: 'google',
      GOOGLE_GEMINI_API_KEY: 'gemini-test',
      GOOGLE_GEMINI_MODEL: 'gemeni-1.5-flash',
    });

    const intent = await parseIntent('List rooms', 'corr-1');

    restore();
    expect(intent).toEqual({ tool: 'c4_list_rooms', args: {} });
    global.fetch = prevFetch;
  });

  test('recovers when configured Google Gemini model is not found (ListModels + retry)', async () => {
    const prevFetch = global.fetch;

    global.fetch = jest.fn(async (url) => {
      const u = String(url);

      // First attempt: configured model (normalized) fails.
      if (u.includes(':generateContent') && u.includes('models/gemini-1.5-flash')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({
            error: {
              code: 404,
              message: 'models/gemeni-1.5-flash is not found for API version v1beta, or is not supported for generateContent.',
              status: 'NOT_FOUND',
            },
          }),
        };
      }

      // Auto-recovery path: ListModels.
      if (u.includes('/v1beta/models?') && u.includes('key=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            models: [
              {
                name: 'models/gemini-2.0-flash',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
        };
      }

      // Retry with fallback model succeeds.
      if (u.includes(':generateContent') && u.includes('models/gemini-2.0-flash')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: '{"tool":"c4_tv_off_last","args":{}}' }],
                },
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected fetch URL: ${u}`);
    });

    const { parseIntent, restore } = loadParseIntentWithEnv({
      LLM_PROVIDER: 'google',
      GOOGLE_GEMINI_API_KEY: 'gemini-test',
      GOOGLE_GEMINI_MODEL: 'gemeni-1.5-flash',
      LLM_ALLOW_HEURISTICS_FALLBACK: '',
    });

    const intent = await parseIntent('Turn off the TV', 'corr-1');

    restore();
    global.fetch = prevFetch;

    expect(intent).toEqual({ tool: 'c4_tv_off_last', args: {} });
  });
});
