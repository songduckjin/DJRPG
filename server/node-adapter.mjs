export function toRequest(req) {
  return {
    method: req.method,
    headers: { get: key => req.headers?.[key.toLowerCase()] ?? req.headers?.[key] ?? null },
    json: async () => req.body ?? {}
  };
}

export async function sendNode(res, response) {
  for (const [key, value] of response.headers) res.setHeader?.(key, value);
  let body;
  try { body = await response.json(); }
  catch { body = null; }
  if (typeof res.status === 'function') return res.status(response.status).json(body);
  res.statusCode = response.status;
  res.end(body === null ? '' : JSON.stringify(body));
}
