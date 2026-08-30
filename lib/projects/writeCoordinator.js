// A deliberately small synchronous gate. The caller owns snapshots and decides
// whether a released pending write should be retried after reconciliation.
export function createProjectWriteCoordinator() {
  let inFlight = false;
  let pending = false;

  return {
    start() {
      if (inFlight) {
        pending = true;
        return false;
      }
      inFlight = true;
      return true;
    },
    finish() {
      inFlight = false;
      const wasPending = pending;
      pending = false;
      return wasPending;
    },
    get inFlight() { return inFlight; },
    get pending() { return pending; }
  };
}
