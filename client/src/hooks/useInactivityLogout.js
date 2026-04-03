/**
 * useInactivityLogout
 *
 * Automatically calls `onLogout` after `timeoutMs` milliseconds of user
 * inactivity. Activity is detected via mouse moves, clicks, key presses,
 * scroll events, and touch events. The timer resets on every activity event.
 *
 * @param {Function} onLogout   - Callback to invoke when the timeout expires.
 * @param {number}   timeoutMs  - Inactivity duration in milliseconds.
 * @param {boolean}  [enabled=true] - Set to false to disable the hook entirely
 *                                    (e.g. when no user is logged in).
 */
import { useEffect, useRef, useCallback } from 'react';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'click',
  'keydown',
  'keypress',
  'scroll',
  'touchstart',
  'touchmove',
  'wheel',
];

export function useInactivityLogout(onLogout, timeoutMs, enabled = true) {
  const timerRef    = useRef(null);
  const onLogoutRef = useRef(onLogout);

  // Keep the ref in sync so we never capture a stale logout callback.
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      onLogoutRef.current();
    }, timeoutMs);
  }, [clearTimer, timeoutMs]);

  useEffect(() => {
    // Do nothing when the hook is disabled (e.g. no authenticated user).
    if (!enabled) {
      clearTimer();
      return;
    }

    // Start the initial timer and attach activity listeners.
    resetTimer();

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      // Clean up on unmount or when dependencies change.
      clearTimer();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [enabled, resetTimer, clearTimer]);
}

export default useInactivityLogout;
