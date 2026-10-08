import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const random = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('base64url');
export function equal(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
export class SafeError extends Error {
  constructor(code, status = 400, retryAfter) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
const now = () => Date.now();
const active = row => row && !row.revoked && new Date(row.expires_at).getTime() > now();

export class PgStore {
  constructor(pool) { this.pool = pool; }
  async transaction(fn) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async createRequest(id, browserHash, data) {
    await this.pool.query('INSERT INTO runcoach_mcp.authorization_requests (id,browser_hash,data,expires_at) VALUES ($1,$2,$3,$4)',
      [hash(id), browserHash, data, new Date(now() + 600_000)]);
  }
  async request(id, browserHash, fn) {
    return this.transaction(async db => {
      const { rows: [row] } = await db.query('SELECT * FROM runcoach_mcp.authorization_requests WHERE id=$1 FOR UPDATE', [hash(id)]);
      if (!active(row) || !equal(row.browser_hash, browserHash)) throw new SafeError('invalid_session');
      return fn(db, row);
    });
  }
  async stravaCallback(id, browserHash, exchange) {
    return this.request(id, browserHash, async (db, row) => {
      if (row.strava_used) throw new SafeError('invalid_state');
      // Commit consumption before the external exchange: a failed callback cannot be replayed.
      await db.query('UPDATE runcoach_mcp.authorization_requests SET strava_used=true WHERE id=$1', [row.id]);
      return row.data;
    }).then(async data => {
      const identity = await this.authorizeCredentials(exchange);
      return this.request(id, browserHash, async (db, row) => {
        await db.query('INSERT INTO runcoach_mcp.connections (athlete_id) VALUES ($1) ON CONFLICT (athlete_id) DO UPDATE SET updated_at=now()', [identity.athleteId]);
        const csrf = random();
        const updated = { ...data, athleteId: identity.athleteId, csrfHash: hash(csrf) };
        await db.query('UPDATE runcoach_mcp.authorization_requests SET data=$2 WHERE id=$1', [row.id, updated]);
        return { ...updated, csrf };
      });
    });
  }
  async authorizeCredentials(exchange) {
    return this.transaction(async db => {
      await db.query("SET LOCAL lock_timeout = '5s'");
      // Identity is unknown until exchange; block row-locked refreshes before it can rotate credentials.
      await db.query('LOCK TABLE public.users IN EXCLUSIVE MODE');
      const identity = await exchange();
      const credentials = identity.credentials;
      await db.query(`INSERT INTO public.users (strava_id,access_token,refresh_token,token_expires_at)
        VALUES ($1,$2,$3,$4) ON CONFLICT (strava_id) DO UPDATE SET
        access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,
        token_expires_at=EXCLUDED.token_expires_at,updated_at=now()`,
      [identity.athleteId, credentials.access_token, credentials.refresh_token, credentials.expires_at]);
      return { athleteId: identity.athleteId };
    });
  }
  async consent(id, browserHash, csrf, allow) {
    return this.request(id, browserHash, async (db, row) => {
      if (!row.strava_used || !row.data.athleteId || !equal(row.data.csrfHash, hash(csrf))) throw new SafeError('invalid_consent');
      await db.query('SELECT athlete_id FROM runcoach_mcp.connections WHERE athlete_id=$1 FOR UPDATE', [row.data.athleteId]);
      await db.query('DELETE FROM runcoach_mcp.authorization_requests WHERE id=$1', [row.id]);
      if (!allow) {
        await this.deleteUnused(db, row.data.athleteId);
        return { data: row.data };
      }
      const grantId = random(), code = random(), management = random();
      await db.query('INSERT INTO runcoach_mcp.grants (id,athlete_id,client_id,scope,expires_at,resource) VALUES ($1,$2,$3,$4,$5,$6)',
        [grantId, row.data.athleteId, row.data.clientId, 'runcoach:read', new Date(now() + 30 * 86400_000), row.data.resource]);
      await this.insertToken(db, code, grantId, 'code', 300_000, row.data);
      await this.insertToken(db, management, grantId, 'management', 1800_000, { csrfHash: hash(management + ':disconnect') });
      return { data: row.data, code, management };
    });
  }
  async insertToken(db, token, grantId, kind, ttl, data = {}) {
    await db.query('INSERT INTO runcoach_mcp.tokens (hash,grant_id,kind,data,expires_at) VALUES ($1,$2,$3,$4,$5)',
      [hash(token), grantId, kind, data, new Date(now() + ttl)]);
  }
  async authenticate(token, kind = 'access') {
    const { rows: [row] } = await this.pool.query(
      `SELECT g.*,t.data,t.expires_at AS token_expires_at FROM runcoach_mcp.tokens t JOIN runcoach_mcp.grants g ON g.id=t.grant_id WHERE t.hash=$1 AND t.kind=$2`, [hash(token), kind]);
    if (!active(row) || new Date(row.token_expires_at).getTime() <= now() || row.scope !== 'runcoach:read') throw new SafeError('invalid_token', 401);
    return row;
  }
  async exchange(token, kind, clientId, validate, resource) {
    return this.transaction(async db => {
      const { rows: [t] } = await db.query('SELECT * FROM runcoach_mcp.tokens WHERE hash=$1 AND kind=$2 FOR UPDATE', [hash(token), kind]);
      if (!active(t)) throw new SafeError('invalid_grant');
      const { rows: [grant] } = await db.query('SELECT * FROM runcoach_mcp.grants WHERE id=$1 FOR UPDATE', [t.grant_id]);
      if (!active(grant) || grant.client_id !== clientId || (resource && grant.resource !== resource) || !validate(t.data)) throw new SafeError('invalid_grant');
      await db.query('DELETE FROM runcoach_mcp.tokens WHERE hash=$1', [t.hash]);
      const access = random(), refresh = random();
      await this.insertToken(db, access, grant.id, 'access', Math.min(3600_000, new Date(grant.expires_at).getTime() - now()));
      await this.insertToken(db, refresh, grant.id, 'refresh', new Date(grant.expires_at).getTime() - now());
      return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: Math.min(3600, Math.floor((new Date(grant.expires_at).getTime() - now()) / 1000)), scope: grant.scope };
    });
  }
  async deleteUnused(db, athleteId) {
    await db.query(`DELETE FROM runcoach_mcp.connections c WHERE athlete_id=$1 AND NOT EXISTS
      (SELECT 1 FROM runcoach_mcp.grants g WHERE g.athlete_id=c.athlete_id AND NOT revoked AND expires_at>now())
      AND NOT EXISTS (SELECT 1 FROM runcoach_mcp.authorization_requests r WHERE r.data->>'athleteId'=$1::text AND r.expires_at>now())`, [String(athleteId)]);
  }
  async revoke(token, clientId, kind) {
    return this.transaction(async db => {
      const { rows: [row] } = await db.query(`SELECT g.* FROM runcoach_mcp.tokens t JOIN runcoach_mcp.grants g ON g.id=t.grant_id WHERE t.hash=$1 AND g.client_id=$2 AND ($3::text IS NULL OR t.kind=$3)`, [hash(token), clientId, kind || null]);
      if (!row) return;
      await db.query('SELECT athlete_id FROM runcoach_mcp.connections WHERE athlete_id=$1 FOR UPDATE', [row.athlete_id]);
      await db.query('UPDATE runcoach_mcp.grants SET revoked=true WHERE id=$1', [row.id]);
      await db.query('DELETE FROM runcoach_mcp.tokens WHERE grant_id=$1', [row.id]);
      await this.deleteUnused(db, row.athlete_id);
    });
  }
  async credentials(athleteId, fn) {
    return this.transaction(async db => {
      const { rows: [row] } = await db.query('SELECT id,access_token,refresh_token,token_expires_at FROM public.users WHERE strava_id=$1 FOR UPDATE', [athleteId]);
      if (!row) throw new SafeError('invalid_grant', 401);
      const result = await fn({ access_token: row.access_token, refresh_token: row.refresh_token, expires_at: Number(row.token_expires_at) });
      if (result.credentials) await db.query('UPDATE public.users SET access_token=$2,refresh_token=$3,token_expires_at=$4,updated_at=now() WHERE id=$1',
        [row.id, result.credentials.access_token, result.credentials.refresh_token, result.credentials.expires_at]);
      return result.value;
    });
  }
  async cleanup() {
    await this.pool.query('DELETE FROM runcoach_mcp.authorization_requests WHERE expires_at<=now()');
    await this.pool.query('DELETE FROM runcoach_mcp.tokens WHERE expires_at<=now()');
    await this.pool.query('DELETE FROM runcoach_mcp.grants WHERE expires_at<=now() OR revoked');
    await this.pool.query(`DELETE FROM runcoach_mcp.connections c WHERE updated_at<now()-interval '10 minutes' AND NOT EXISTS
      (SELECT 1 FROM runcoach_mcp.grants g WHERE g.athlete_id=c.athlete_id)
      AND NOT EXISTS (SELECT 1 FROM runcoach_mcp.authorization_requests r WHERE r.data->>'athleteId'=c.athlete_id::text)`);
  }
}
