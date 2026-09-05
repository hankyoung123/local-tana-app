/** Prevent the native close synchronously, then close only after persistence. */
export function createCloseGuard({ flush, close, onError, getVersion = () => 0 }: {
  flush: () => Promise<void>;
  getVersion?: () => number;
  close: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  let closing = false;
  return async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    try {
      let version: number;
      do {
        version = getVersion();
        await flush();
      } while (version !== getVersion());
      await close();
    } catch (error) {
      onError(error);
    } finally {
      closing = false;
    }
  };
}
