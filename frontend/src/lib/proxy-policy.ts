export function allowedApiPath(method: string, parts: string[]) {
  const path = parts.join("/");
  if (method === "GET")
    return path === "me" || /^batteries\/[A-Z0-9-]{1,32}$/.test(path);
  return (
    method === "POST" &&
    (path === "batteries" ||
      /^wallet\/(challenge|verify)$/.test(path) ||
      /^batteries\/[A-Z0-9-]{1,32}\/(returns|reward)$/.test(path) ||
      /^returns\/[0-9a-f]{64}\/(cancel|collection|recycling)$/.test(path))
  );
}
