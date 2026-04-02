/**
 * useRealtimeUpdates
 *
 * Opens a persistent SSE connection to /api/events and dispatches
 * incoming events into a shared React context so every page that
 * subscribes to it re-renders automatically — no manual reload needed.
 *
 * Usage:
 *   const { lastEvent } = useRealtimeUpdates();
 *
 * Or use the typed helpers:
 *   useOrderUpdates(callback)
 *   useNotificationUpdates(callback)
 *   useWalletUpdates(callback)
 *   useAdminStats(callback)
 *   useTicketUpdates(callback)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const BASE_URL = import.meta.env.VITE_API_URL || '';

// ── Singleton SSE connection shared across the whole app ──────────────────
let globalSource = null;
let globalListeners = {};   // { eventType: Set<callback> }
let reconnectTimer  = null;
let currentToken    = null;

function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function subscribe(eventType, cb) {
  if (!globalListeners[eventType]) globalListeners[eventType] = new Set();
  globalListeners[eventType].add(cb);
  return () => globalListeners[eventType]?.delete(cb);
}

function dispatch(eventType, data) {
  globalListeners[eventType]?.forEach(cb => cb(data));
  globalListeners['*']?.forEach(cb => cb({ type: eventType, data }));
}

function connectSSE(token) {
  if (globalSource) { globalSource.close(); globalSource = null; }
  currentToken = token;

  // Pass token as query param because EventSource doesn't support headers
  const url = `${BASE_URL}/api/events?token=${encodeURIComponent(token)}`;
  const source = new EventSource(url);
  globalSource = source;

  source.addEventListener('connected', () => {
    console.debug('[SSE] connected');
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  });

  const eventTypes = [
    'order_update',
    'ticket_update',
    'notification',
    'wallet_update',
    'admin_stats',
    'package_update',
  ];

  eventTypes.forEach(type => {
    source.addEventListener(type, e => {
      try { dispatch(type, JSON.parse(e.data)); } catch (_) { /* ignore bad JSON */ }
    });
  });

  source.onerror = () => {
    source.close();
    globalSource = null;
    // Exponential back-off: retry after 3 s
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        const t = getToken();
        if (t) connectSSE(t);
      }, 3000);
    }
  };
}

function disconnectSSE() {
  if (globalSource) { globalSource.close(); globalSource = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  currentToken = null;
}

// ── Main hook ─────────────────────────────────────────────────────────────
export function useRealtimeUpdates() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) { disconnectSSE(); return; }
    const token = getToken();
    if (!token) return;
    // Only (re)connect if the token changed or the connection dropped
    if (!globalSource || currentToken !== token) connectSSE(token);
    return () => { /* keep the singleton alive across page transitions */ };
  }, [user]);

  const on = useCallback((eventType, cb) => subscribe(eventType, cb), []);

  return { on };
}

// ── Typed helpers ──────────────────────────────────────────────────────────

export function useOrderUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => on('order_update', data => ref.current(data)), [on]);
}

export function useTicketUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => on('ticket_update', data => ref.current(data)), [on]);
}

export function useNotificationUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => on('notification', data => ref.current(data)), [on]);
}

export function useWalletUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => on('wallet_update', data => ref.current(data)), [on]);
}

export function useAdminStats(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => on('admin_stats', data => ref.current(data)), [on]);
}

export function usePackageUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => on('package_update', data => ref.current(data)), [on]);
}
