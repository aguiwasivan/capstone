import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ApiClient, ApiError, normalizeServer } from '../lib/client';
import { buildProperties, canReserve, canReview } from '../lib/properties';
import type { Blueprint, Lot, Notice, Property, Reservation, Snapshot, Tokens, User } from '../lib/types';

const empty: Snapshot = { properties: [], reservations: [], notices: [] };
const defaultServer = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8001/api/';
const Context = createContext<PortalValue | null>(null);
type PortalValue = {
  user: User | null; booting: boolean; server: string; data: Snapshot; refreshing: boolean;
  busy: boolean; lastSync: number; error: string;
  login: (server: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>; restore: () => Promise<void>;
  refresh: () => Promise<Snapshot>; reserve: (property: Property) => Promise<void>;
  review: (id: number, action: 'approve' | 'decline') => Promise<void>;
};

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [server, setServer] = useState(defaultServer);
  const [client, setClient] = useState<ApiClient | null>(null);
  const [data, setData] = useState<Snapshot>(empty);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const [error, setError] = useState('');
  const flight = useRef<Promise<Snapshot> | null>(null);
  const mutation = useRef(false);
  const session = useRef(0);
  const storageQueue = useRef(Promise.resolve());

  const saveTokens = useCallback((tokens: Tokens | null) => {
    const write = () => tokens ? SecureStore.setItemAsync('portal.tokens', JSON.stringify(tokens)) : SecureStore.deleteItemAsync('portal.tokens');
    storageQueue.current = storageQueue.current.catch(() => {}).then(write);
    return storageQueue.current;
  }, []);
  const makeClient = useCallback((url: string) => new ApiClient(url, saveTokens, () => {
    session.current++;
    setUser(null); setData(empty); setLastSync(0);
    setError('Your session expired. Please sign in again.');
  }), [saveTokens]);

  const restore = useCallback(async () => {
    try {
      const [url, saved] = await Promise.all([SecureStore.getItemAsync('portal.server'), SecureStore.getItemAsync('portal.tokens')]);
      setError('');
      const normalized = normalizeServer(url || defaultServer);
      setServer(normalized);
      if (saved) {
        const api = makeClient(normalized);
        const tokens = JSON.parse(saved) as Tokens;
        if (!tokens.access || !tokens.refresh) throw new Error('Please sign in again.');
        api.setTokens(tokens);
        const profile = await api.request<User>('profile/');
        setClient(api); setUser(profile);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to restore your session.'); }
    finally { setBooting(false); }
  }, [makeClient]);
  useEffect(() => {
    const task = setTimeout(() => { void restore(); }, 0);
    return () => clearTimeout(task);
  }, [restore]);

  const login = async (url: string, username: string, password: string) => {
    const normalized = normalizeServer(url);
    const api = makeClient(normalized);
    // Bind saved tokens to their server before storing a successful login.
    await saveTokens(null);
    await SecureStore.setItemAsync('portal.server', normalized);
    const profile = await api.login(username.trim(), password);
    session.current++;
    setServer(normalized); setClient(api); setUser(profile); setError('');
    setData(empty); setLastSync(0);
  };
  const logout = async () => {
    session.current++;
    client?.setTokens(null);
    setUser(null); setClient(null); setData(empty); setLastSync(0); setError('');
    flight.current = null;
    await saveTokens(null);
  };
  const refresh = useCallback((): Promise<Snapshot> => {
    if (!client || !user) return Promise.reject(new ApiError('Please sign in.', 401));
    if (flight.current) return flight.current;
    const version = session.current;
    setRefreshing(true);
    const pending = (async () => {
      try {
        const [lots, blueprints, reservations, notices] = await Promise.all([
          client.request<Lot[]>('lots/'), client.request<Blueprint[]>('blueprints/'),
          client.request<Reservation[]>('reservation-requests/'), client.request<Notice[]>('notifications/'),
        ]);
        if (version !== session.current) throw new ApiError('Session changed.', 401);
        const next = { properties: buildProperties(lots, blueprints), reservations, notices };
        setData(next); setError(''); setLastSync(Date.now());
        return next;
      } catch (caught) {
        if (version === session.current) setError(caught instanceof Error ? caught.message : 'Could not refresh.');
        throw caught;
      } finally {
        if (version === session.current) { setRefreshing(false); flight.current = null; }
      }
    })();
    flight.current = pending;
    return pending;
  }, [client, user]);
  useEffect(() => {
    if (!user) return;
    const update = () => { if (AppState.currentState === 'active') void refresh().catch(() => {}); };
    void refresh().catch(() => {});
    const timer = setInterval(update, 15000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') update(); });
    return () => { clearInterval(timer); subscription.remove(); flight.current = null; };
  }, [user, refresh]);

  const perform = async (operation: (snapshot: Snapshot) => Promise<void>) => {
    if (mutation.current) throw new Error('Please wait for the current request.');
    mutation.current = true; setBusy(true);
    try {
      const snapshot = await refresh();
      await operation(snapshot);
      // The write succeeded even if the subsequent refresh cannot reach the server.
      await refresh().catch(() => {});
    } catch (caught) {
      await refresh().catch(() => {});
      throw caught;
    } finally { mutation.current = false; setBusy(false); }
  };
  const reserve = async (property: Property) => perform(async (snapshot) => {
    const fresh = snapshot.properties.find((item) => item.key === property.key);
    if (!fresh || !user || !canReserve(user.role, fresh)) throw new Error('This lot is no longer available for reservation.');
    await client!.request('reservation-requests/', { method: 'POST', body: JSON.stringify({ lot_id: fresh.reservationId }) });
  });
  const review = async (id: number, action: 'approve' | 'decline') => perform(async (snapshot) => {
    if (!user || !canReview(user.role)) throw new Error('Your role cannot review reservations.');
    const reservation = snapshot.reservations.find((item) => item.id === id);
    if (!reservation || reservation.status !== 'pending') throw new Error('This reservation has already been reviewed.');
    if (action === 'approve' && !['available', 'pending'].includes(reservation.lot.status)) throw new Error('This lot is no longer available for approval.');
    await client!.request(`reservation-requests/${id}/${action}/`, { method: 'POST' });
  });
  return <Context.Provider value={{ user, booting, server, data, refreshing, busy, lastSync, error, login, logout, restore, refresh, reserve, review }}>{children}</Context.Provider>;
}
export function usePortal() {
  const value = useContext(Context);
  if (!value) throw new Error('PortalProvider is missing.');
  return value;
}
