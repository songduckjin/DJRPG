let currentEnv;

export function setRuntimeEnv(env) { currentEnv = env; }
export function runtimeEnv() { return currentEnv ?? (typeof process !== 'undefined' ? process.env : {}); }
export function envValue(key, env = runtimeEnv()) { return env?.[key]; }
