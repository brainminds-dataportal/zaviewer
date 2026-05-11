const isDebugBuild = import.meta.env.DEV;
const debugHeader = '[ZAV debug]';

type DebugLogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error';

const buildDebugArgs = (message?: unknown, ...optionalParams: unknown[]) => {
  if (typeof message === 'string') {
    return [`${debugHeader} ${message}`, ...optionalParams];
  }

  return [debugHeader, message, ...optionalParams];
};

const emitDebugLog = (level: DebugLogLevel, message?: unknown, ...optionalParams: unknown[]) => {
  if (!isDebugBuild) {
    return;
  }

  console[level](...buildDebugArgs(message, ...optionalParams));
};

export const debugDebug = (message?: unknown, ...optionalParams: unknown[]) => {
  emitDebugLog('debug', message, ...optionalParams);
};

export const debugLog = (message?: unknown, ...optionalParams: unknown[]) => {
  emitDebugLog('log', message, ...optionalParams);
};

export const debugInfo = (message?: unknown, ...optionalParams: unknown[]) => {
  emitDebugLog('info', message, ...optionalParams);
};

export const debugWarn = (message?: unknown, ...optionalParams: unknown[]) => {
  emitDebugLog('warn', message, ...optionalParams);
};

export const debugError = (message?: unknown, ...optionalParams: unknown[]) => {
  emitDebugLog('error', message, ...optionalParams);
};
