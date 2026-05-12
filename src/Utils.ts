import type { BrowserHistory, Location } from './common/browserHistory';

type HashLocation = Pick<Location, 'hash'>;
type HistoryStepParams = Record<string, unknown>;
type HistoryUpdateMode = 'push' | 'replace';

function parseHashParams(hash: string) {
  const params = new URLSearchParams(Utils.getCleanHash(hash));
  return Object.fromEntries(params.entries());
}

function stringifyHashParams(params: Record<string, unknown>) {
  const serializedParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value !== 'undefined') {
      serializedParams.set(key, String(value));
    }
  });
  return serializedParams.toString();
}

class Utils {
  private constructor() {}

  //Finds y value of given object
  static findPosY(obj: HTMLElement) {
    let curtop = 0;
    let current: HTMLElement | null = obj;
    if (current.offsetParent) {
      do {
        curtop += current.offsetTop;
        current = current.offsetParent as HTMLElement | null;
      } while (current);
      return [curtop];
    }
    return undefined;
  }

  static findPosX(obj: HTMLElement) {
    let curleft = 0;
    let current: HTMLElement | null = obj;
    if (current.offsetParent) {
      do {
        curleft += current.offsetLeft;
        current = current.offsetParent as HTMLElement | null;
      } while (current);
      return [curleft];
    }
    return undefined;
  }

  static makePath(...args: Array<string | undefined>) {
    return args.reduce<string>((acc, frag) => {
      if (!frag) {
        return acc;
      }
      if (!acc) {
        return frag;
      }
      return acc + (acc.endsWith('/') || frag.startsWith('/') ? '' : '/') + frag;
    }, '');
  }

  static getCleanHash(hash: string) {
    return hash.startsWith('#') ? hash.substring(1) : hash;
  }

  static getConfigFromLocation(location: HashLocation): Record<string, string> {
    return parseHashParams(location.hash);
  }

  static pushHistoryStep(
    history: BrowserHistory,
    newParams: HistoryStepParams,
    omitedParams?: string[],
    mode: HistoryUpdateMode = 'push',
  ) {
    const currentParams = Utils.getConfigFromLocation(history.location);
    const mergedParams = { ...currentParams, ...newParams };
    const paramsWithoutOmissions = Object.fromEntries(
      Object.entries(mergedParams).filter(([key]) => !(omitedParams ?? []).includes(key)),
    );
    const cleanedParams = Object.fromEntries(
      Object.entries(paramsWithoutOmissions).filter(([, value]) => typeof value !== 'undefined'),
    );
    const updStrParams = stringifyHashParams(cleanedParams);
    const updatedPath = `${history.location.pathname}${history.location.search}${updStrParams ? `#${updStrParams}` : ''}`;
    if (updStrParams !== Utils.getCleanHash(history.location.hash)) {
      history[mode](updatedPath);
    }
  }
}

export default Utils;
