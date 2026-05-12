export type HistoryAction = 'POP' | 'PUSH' | 'REPLACE';

export type Location = {
  hash: string;
  pathname: string;
  search: string;
  state: unknown;
  key: string;
};

export type Update = {
  action: HistoryAction;
  location: Location;
};

type Listener = (update: Update) => void;

export type BrowserHistory = {
  readonly location: Location;
  listen(listener: Listener): () => void;
  push(path: string): void;
  replace(path: string): void;
};

function readLocation(): Location {
  const state = window.history.state;
  const key =
    state && typeof state === 'object' && 'key' in state && typeof state.key === 'string' ? state.key : 'default';

  return {
    hash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
    state,
    key,
  };
}

export function createBrowserHistory(): BrowserHistory {
  const listeners = new Set<Listener>();

  const notify = (action: HistoryAction) => {
    const update = {
      action,
      location: readLocation(),
    };
    listeners.forEach((listener) => {
      listener(update);
    });
  };

  window.addEventListener('popstate', () => {
    notify('POP');
  });

  return {
    get location() {
      return readLocation();
    },
    listen(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    push(path) {
      window.history.pushState(window.history.state, '', path);
      notify('PUSH');
    },
    replace(path) {
      window.history.replaceState(window.history.state, '', path);
      notify('REPLACE');
    },
  };
}
