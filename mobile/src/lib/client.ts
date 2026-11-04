import type { Tokens, User } from './types';

export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export function normalizeServer(value: string): string {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) throw new Error('Use a server URL without credentials, query parameters, or fragments.');
  const host = url.hostname;
  const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Use HTTPS, or a private network HTTP address for local testing.');
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path.endsWith('/api') ? path : `${path}/api`}/`;
}
function errorDetail(data: unknown): string {
  if (typeof data === 'string') return data.startsWith('<') ? 'The server returned an unexpected response.' : data;
  if (Array.isArray(data)) return data.map(errorDetail).join(' ');
  if (data && typeof data === 'object') {
    const object = data as Record<string, unknown>;
    if (object.detail) return errorDetail(object.detail);
    return Object.entries(object).map(([key, value]) => `${key === 'non_field_errors' ? '' : `${key}: `}${errorDetail(value)}`).join(' ');
  }
  return 'The request could not be completed.';
}
export class ApiClient {
  private tokens: Tokens | null = null;
  private generation = 0;
  private refreshing: Promise<void> | null = null;
  constructor(public baseUrl: string, private save: (tokens: Tokens | null) => Promise<void>, private expired: () => void, private transport: typeof fetch = fetch) {}
  setTokens(tokens: Tokens | null) { this.tokens = tokens; this.generation++; }
  private async raw(path: string, options: RequestInit = {}, access?: string) {
    const controller = new AbortController();
    const reading = (options.method || 'GET').toUpperCase() === 'GET';
    const authenticating = path === 'login/' || path === 'token/refresh/';
    const timeout = setTimeout(() => controller.abort(), reading || authenticating ? 60000 : 15000);
    try {
      const response = await this.transport(`${this.baseUrl}${path}`, {
        ...options, signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}), ...options.headers },
      });
      const text = await response.text();
      let data: unknown;
      try { data = text ? JSON.parse(text) : null; } catch { throw new ApiError('The server did not return JSON. Check the server address.', response.status); }
      if (!response.ok) throw new ApiError(errorDetail(data), response.status);
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted && authenticating) throw new ApiError(
        path === 'login/'
          ? 'Sign-in timed out. Check your connection and server address, then try again.'
          : 'Session renewal timed out. Check your connection and try again.');
      if (controller.signal.aborted) throw new ApiError(reading
        ? 'The server took too long to load your data. Please try refreshing again.'
        : 'The request timed out. If you submitted a reservation or approval, check its status before trying again.');
      throw new ApiError('Cannot reach the server. Check your connection and server address.');
    } finally { clearTimeout(timeout); }
  }
  private async refresh() {
    if (!this.refreshing) {
      const generation = this.generation;
      this.refreshing = (async () => {
        if (!this.tokens) throw new ApiError('Please sign in again.', 401);
        try {
          const data = await this.raw('token/refresh/', { method: 'POST', body: JSON.stringify({ refresh: this.tokens.refresh }) }) as Partial<Tokens>;
          if (!data.access) throw new ApiError('Please sign in again.', 401);
          if (generation !== this.generation || !this.tokens) throw new ApiError('Session changed. Please sign in again.', 401);
          this.tokens = { access: data.access, refresh: data.refresh || this.tokens.refresh };
          await this.save(this.tokens);
        } catch (error) {
          if (error instanceof ApiError && [400, 401, 403].includes(error.status) && generation === this.generation) {
            this.tokens = null;
            this.generation++;
            await this.save(null);
            this.expired();
          }
          throw error;
        }
      })().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
  async login(username: string, password: string) {
    const data = await this.raw('login/', { method: 'POST', body: JSON.stringify({ username, password }) }) as { user: User } & Tokens;
    if (!data.access || !data.refresh || !data.user) throw new ApiError('Unexpected login response.');
    this.setTokens({ access: data.access, refresh: data.refresh });
    await this.save(this.tokens);
    return data.user;
  }
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.tokens) throw new ApiError('Please sign in.', 401);
    const generation = this.generation;
    const sentToken = this.tokens.access;
    try { return await this.raw(path, options, sentToken) as T; }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || generation !== this.generation) throw error;
      if (this.tokens?.access === sentToken) await this.refresh();
      if (!this.tokens || generation !== this.generation) throw new ApiError('Please sign in again.', 401);
      try { return await this.raw(path, options, this.tokens.access) as T; }
      catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401 && generation === this.generation) {
          this.setTokens(null);
          await this.save(null);
          this.expired();
        }
        throw retryError;
      }
    }
  }
}
