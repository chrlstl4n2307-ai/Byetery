/** Local runtime boundary. No imports, configuration loading or signer access. */
export function assertLocalRuntime(env: NodeJS.ProcessEnv = process.env): void {
  const hosted = ['VERCEL', 'NOW_', 'AWS_', 'LAMBDA_', 'CF_', 'CLOUDFLARE_',
    'NETLIFY', 'RENDER', 'RAILWAY_', 'FLY_', 'K_SERVICE', 'WEBSITE_', 'FUNCTIONS_'];
  if (Object.keys(env).some(key => hosted.some(prefix => key.startsWith(prefix))))
    throw new Error('HostedExecutionDenied');
  if (env.CI !== undefined || env.NODE_ENV === 'production') throw new Error('HostedExecutionDenied');
}

/** The factory cannot be evaluated before the guard. Also used by startup. */
export function localRuntime<T>(env: NodeJS.ProcessEnv, factory: () => T): T {
  assertLocalRuntime(env);
  return factory();
}
