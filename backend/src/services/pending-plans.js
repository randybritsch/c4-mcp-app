function buildMoodPlan({ mood, lightsLevel, musicSourceName } = {}) {
  const m = mood ? String(mood).trim() : 'mood';
  const levelNum = Number.isFinite(Number(lightsLevel)) ? Math.round(Number(lightsLevel)) : null;
  const lights = (levelNum !== null)
    ? { level: Math.max(0, Math.min(100, levelNum)) }
    : null;

  const musicName = musicSourceName ? String(musicSourceName).trim() : '';
  const music = musicName ? { source_device_name: musicName } : null;

  return {
    kind: 'mood',
    mood: m || 'mood',
    lights,
    music,
  };
}

function isMoodPlan(plan) {
  return Boolean(plan && typeof plan === 'object' && String(plan.kind || '') === 'mood');
}

function buildPresencePlan({ query } = {}) {
  const q = query ? String(query).trim() : '';
  return {
    kind: 'presence',
    query: q,
  };
}

function isPresencePlan(plan) {
  return Boolean(plan && typeof plan === 'object' && String(plan.kind || '') === 'presence');
}

module.exports = {
  buildMoodPlan,
  isMoodPlan,
  buildPresencePlan,
  isPresencePlan,
};
