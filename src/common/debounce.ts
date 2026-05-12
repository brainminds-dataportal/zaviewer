export function debounce<TArgs extends unknown[]>(callback: (...args: TArgs) => void, wait: number, immediate = false) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function debounced(this: unknown, ...args: TArgs) {
    const later = () => {
      timeout = null;
      if (!immediate) {
        callback.apply(this, args);
      }
    };

    const callNow = immediate && !timeout;
    clearTimeout(timeout ?? undefined);
    timeout = setTimeout(later, wait);

    if (callNow) {
      callback.apply(this, args);
    }
  };
}
