import { SafeError } from './store.js';

export class Strava {
  constructor(config, store, fetchImpl = fetch) { this.config = config; this.store = store; this.fetch = fetchImpl; }
  async request(url, options = {}) {
    let response;
    try { response = await this.fetch(url, { ...options, signal: AbortSignal.timeout(15_000), redirect: 'error' }); }
    catch { throw new SafeError('strava_unavailable', 502); }
    if (!response.ok) {
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        throw new SafeError('strava_rate_limited', 429, /^\d{1,6}$/.test(retry || '') ? retry : '60');
      }
      throw new SafeError(response.status === 401 ? 'strava_authorization_expired' : 'strava_unavailable', response.status === 401 ? 401 : 502);
    }
    try { return await response.json(); } catch { throw new SafeError('strava_invalid_response', 502); }
  }
  async token(fields) {
    const result = await this.request('https://www.strava.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.config.stravaClientId, client_secret: this.config.stravaClientSecret, ...fields }),
    });
    if (typeof result.access_token !== 'string' || !result.access_token || typeof result.refresh_token !== 'string' || !result.refresh_token ||
        !Number.isSafeInteger(result.expires_at) || result.expires_at <= Date.now() / 1000) throw new SafeError('strava_invalid_response', 502);
    return result;
  }
  async authorize(code) {
    const credentials = await this.token({ grant_type: 'authorization_code', code });
    const athlete = credentials.athlete;
    if (!Number.isSafeInteger(athlete?.id) || athlete.id <= 0) throw new SafeError('strava_identity_mismatch', 502);
    return { athleteId: athlete.id, credentials: { access_token: credentials.access_token, refresh_token: credentials.refresh_token, expires_at: credentials.expires_at } };
  }
  async access(athleteId, force = false) {
    return this.store.credentials(athleteId, async stored => {
      let credentials = stored;
      if (force || credentials.expires_at * 1000 <= Date.now() + 300_000) {
        const refreshed = await this.token({ grant_type: 'refresh_token', refresh_token: credentials.refresh_token });
        credentials = { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, expires_at: refreshed.expires_at };
        return { value: credentials.access_token, credentials };
      }
      return { value: credentials.access_token };
    });
  }
  async get(athleteId, path, params = {}) {
    const url = new URL(`https://www.strava.com/api/v3/${path}`);
    url.search = new URLSearchParams(params).toString();
    let token = await this.access(athleteId);
    try { return await this.request(url, { headers: { Authorization: ['Bearer', token].join(' ') } }); }
    catch (error) {
      if (error.code !== 'strava_authorization_expired') throw error;
      token = await this.access(athleteId, true);
      return this.request(url, { headers: { Authorization: ['Bearer', token].join(' ') } });
    }
  }
}
