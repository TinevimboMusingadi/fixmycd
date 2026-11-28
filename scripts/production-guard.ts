/**
 * Demo seed scripts create accounts with a well-known password (and reset it on every run).
 * Refuse to run them against production unless someone opts in explicitly.
 */
export function refuseInProduction(script: string): void {
  const prod = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (prod && process.env.ALLOW_PROD_SEED !== '1') {
    console.error(
      `${script}: refusing to run in production (it creates demo accounts with a known password). ` +
        'Set ALLOW_PROD_SEED=1 if you really mean it.'
    );
    process.exit(1);
  }
}
