import pg from 'pg';
import { ManagedIdentityCredential } from '@azure/identity';

export function databaseOptions(env = process.env, credential) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const mode = env.DATABASE_AUTH_MODE || 'password';
  const options = { connectionString: env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 };
  if (mode === 'password') return options;
  if (mode !== 'managed-identity') throw new Error('Invalid DATABASE_AUTH_MODE');
  const url = new URL(env.DATABASE_URL);
  if (url.protocol !== 'postgresql:' || !url.username || url.password ||
      !url.hostname.endsWith('.postgres.database.azure.com') ||
      url.searchParams.getAll('sslmode').length !== 1 ||
      url.searchParams.get('sslmode') !== 'verify-full' ||
      [...url.searchParams.keys()].some(key => key !== 'sslmode')) {
    throw new Error('Managed identity requires a passwordless Azure PostgreSQL URL with sslmode=verify-full');
  }
  const identity = credential || new ManagedIdentityCredential();
  delete options.connectionString;
  Object.assign(options, {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { rejectUnauthorized: true },
  });
  options.password = async () => {
    const token = await identity.getToken('https://ossrdbms-aad.database.windows.net/.default');
    if (!token?.token) throw new Error('Database managed identity token unavailable');
    return token.token;
  };
  return options;
}

export function createDatabasePool(env = process.env) {
  return new pg.Pool(databaseOptions(env));
}
