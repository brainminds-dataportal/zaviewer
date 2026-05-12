import OpenSeadragon from 'openseadragon';

import CustomFilters from '../CustomFilters';
import type { LayerDisplaySetting, LayerDisplaySettings, ViewerLayerConfig } from '../components/ViewerPanelTypes';
import ZAVConfig from '../ZAVConfig';

type ViewerLayerConfigMap = Record<string, ViewerLayerConfig>;

export type ViewerIIPTileInfos = {
  minLevel: number;
  maxLevel: number;
  levelScale: Record<number, number>;
  tileWidth: number;
  tileHeight: number;
  imageWidth: number;
  imgeHeight: number;
  xTilesNumAtMaxLevel: number;
};

export type ViewerLayerConfigSubset = {
  layers: ViewerLayerConfigMap;
  dataRootPath?: string;
  hasMultiPlanes?: boolean;
  IIPSERVER_PATH?: string;
  TILE_EXTENSION?: string;
  hasBackend?: boolean;
  dzLayerWidth: number;
  dzLayerHeight: number;
  axialFirstIndex: number;
  coronalFirstIndex: number;
  sagittalFirstIndex: number;
};

export type ViewerLayerStatusSubset = {
  activePlane: number;
  layerDisplaySettings: LayerDisplaySettings;
  tileSize: number;
  tileOverlap: number;
  tileFormat: string;
  IIPSVR_PATH?: string;
  iipTileInfos?: ViewerIIPTileInfos;
};

type OSDFilterFactory = {
  MORPHOLOGICAL_OPERATION: (size: number, reducer: (left: number, right: number) => number) => unknown;
  CONTRAST: (contrast: number) => unknown;
  GAMMA: (gamma: number) => unknown;
};

type OSDWithFilters = typeof OpenSeadragon & {
  Filters?: OSDFilterFactory;
};

type ViewerTileCacheEntry = {
  url?: string;
  exists?: boolean;
  loaded?: boolean;
};

function getLayerSetting(status: ViewerLayerStatusSubset, key: string) {
  return status.layerDisplaySettings[key];
}

export function getLayerOpacity(config: ViewerLayerConfigSubset, status: ViewerLayerStatusSubset, key: string) {
  let opacity = 0;
  if (config.layers[key] && getLayerSetting(status, key)?.enabled) {
    opacity = (getLayerSetting(status, key)?.opacity ?? 0) / 100;
  }
  return opacity;
}

export function refreshLayersEffectiveOpacity(
  config: ViewerLayerConfigSubset,
  status: ViewerLayerStatusSubset,
  startLayerKey: string,
) {
  const opacities: string[] = [];
  let hasOpaqueLayerAbove = false;
  let skip = true;

  Object.keys(config.layers)
    .reverse()
    .forEach((currentLayerKey) => {
      const isStartingLayer = currentLayerKey === startLayerKey;
      const currentLayer = getLayerSetting(status, currentLayerKey);
      if (!currentLayer) {
        return;
      }

      skip = skip && !isStartingLayer;
      if (!skip) {
        currentLayer.effectiveOpacity = !hasOpaqueLayerAbove && currentLayer.enabled ? currentLayer.opacity / 100 : 0;
        opacities.push(currentLayerKey);
      }

      if (!hasOpaqueLayerAbove) {
        hasOpaqueLayerAbove = !currentLayer.isTracer && currentLayer.enabled && currentLayer.opacity === 100;
      }
    });

  return opacities;
}

export function getFileTileSourceUrl(
  config: ViewerLayerConfigSubset,
  slideNum: number,
  key: string,
  ext: string,
  plane: number | null,
) {
  const planeName =
    plane == null ? undefined : ZAVConfig.getPlaneName(plane as Parameters<typeof ZAVConfig.getPlaneName>[0]);
  const basePath = [config.dataRootPath, key, planeName].filter(Boolean).join('/');
  return `${basePath}/${slideNum}${ext}`;
}

export function getFileTileUrl(
  config: ViewerLayerConfigSubset,
  status: ViewerLayerStatusSubset,
  slideNum: number,
  key: string,
  level: number,
  x: number,
  y: number,
) {
  switch (status.activePlane) {
    case ZAVConfig.AXIAL:
      slideNum -= config.axialFirstIndex;
      break;
    case ZAVConfig.CORONAL:
      slideNum -= config.coronalFirstIndex;
      break;
    case ZAVConfig.SAGITTAL:
      slideNum -= config.sagittalFirstIndex;
      break;
  }

  const planePath = config.hasMultiPlanes
    ? `/${ZAVConfig.getPlaneName(status.activePlane as Parameters<typeof ZAVConfig.getPlaneName>[0])}`
    : '';

  return `${config.dataRootPath ?? ''}/${key}${planePath}/${slideNum}_files/${level}/${x}_${y}.${status.tileFormat}`;
}

export function getIIIFTileSourceUrl(config: ViewerLayerConfigSubset, slideNum: number, key: string, ext: string) {
  return `${config.IIPSERVER_PATH ?? ''}${key}/${slideNum}${ext}${config.TILE_EXTENSION ?? ''}`;
}

export function getIIPTileUrl(
  status: ViewerLayerStatusSubset,
  slideNum: number,
  key: string,
  ext: string,
  level: number,
  x: number,
  y: number,
) {
  const tileInfos = status.iipTileInfos;
  if (!tileInfos) {
    return '';
  }
  const xTilesNum = Math.ceil(tileInfos.xTilesNumAtMaxLevel * (tileInfos.levelScale[level] ?? 1));
  const layerDispSettings = getLayerSetting(status, key);
  return (
    `${status.IIPSVR_PATH ?? ''}${key}/${slideNum}${ext}` +
    (layerDispSettings?.useIIProtocol && layerDispSettings.gammaEnabled ? `&GAM=${layerDispSettings.gamma}` : '') +
    (layerDispSettings?.useIIProtocol && layerDispSettings.contrastEnabled
      ? `&CNT=${layerDispSettings.contrast}`
      : '') +
    `&JTL=${level ? level : '0'},${y * xTilesNum + x}`
  );
}

export function getTileSourceDef(args: {
  config: ViewerLayerConfigSubset;
  status: ViewerLayerStatusSubset;
  key: string;
  ext: string;
  currentPage: number | undefined;
  getCurrentPage: () => number;
}) {
  const { config, currentPage, ext, getCurrentPage, key, status } = args;
  if (config.hasBackend) {
    const layerDispSettings = getLayerSetting(status, key);
    if (layerDispSettings?.useIIProtocol) {
      const tileInfos = status.iipTileInfos;
      if (!tileInfos) {
        return undefined;
      }
      return {
        width: tileInfos.imageWidth,
        height: tileInfos.imgeHeight,
        tileWidth: tileInfos.tileWidth,
        tileHeight: tileInfos.tileHeight,
        overlap: 1,
        maxLevel: tileInfos.maxLevel,
        minLevel: tileInfos.minLevel,
        getTileUrl: (level: number, x: number, y: number) =>
          getIIPTileUrl(status, getCurrentPage(), key, ext, level, x, y),
      };
    }
    return getIIIFTileSourceUrl(config, currentPage ?? 0, key, ext);
  }

  return {
    width: config.dzLayerWidth,
    height: config.dzLayerHeight,
    tileSize: status.tileSize,
    overlap: status.tileOverlap,
    tileFormat: status.tileFormat,
    getTileUrl: (level: number, x: number, y: number) =>
      getFileTileUrl(config, status, currentPage ?? 0, key, level, x, y),
  };
}

export function addLayer(args: {
  viewer: OpenSeadragon.Viewer;
  config: ViewerLayerConfigSubset;
  status: ViewerLayerStatusSubset;
  key: string;
  ext: string;
  getCurrentPage: () => number;
  onTileLoaded: () => void;
}) {
  const { config, ext, getCurrentPage, key, onTileLoaded, status, viewer } = args;
  const tileSource = getTileSourceDef({
    config,
    status,
    key,
    ext,
    currentPage: getCurrentPage(),
    getCurrentPage,
  });
  if (!tileSource) {
    return;
  }

  viewer.addTiledImage({
    tileSource,
    opacity: getLayerOpacity(config, status, key),
    success: () => onTileLoaded(),
    preload: Boolean(getLayerSetting(status, key)?.isLabelMap),
  });
}

export function adjustTracerLayerDilation(status: ViewerLayerStatusSubset, zoom: number) {
  const tracerLayer = Object.values(status.layerDisplaySettings).find((layer) => layer.isTracer);
  if (!tracerLayer) {
    return false;
  }

  const newDilationSize = zoom > 2.5 ? 0 : zoom > 1.5 ? 3 : zoom > 0.3 ? 5 : 7;
  tracerLayer.autoDilation = newDilationSize;
  if (newDilationSize !== tracerLayer.dilation && !tracerLayer.manualEnhancing) {
    tracerLayer.dilation = newDilationSize;
    return Boolean(tracerLayer.enhanceSignal);
  }
  return false;
}

export function setAllFilters(
  viewer: OpenSeadragon.Viewer,
  status: ViewerLayerStatusSubset,
  logError: (message: string) => void,
) {
  const filters: Array<{ items: OpenSeadragon.TiledImage; processors: unknown[] }> = [];
  const osdFilters = (OpenSeadragon as OSDWithFilters).Filters;
  const canUseOSDFilters =
    typeof osdFilters?.MORPHOLOGICAL_OPERATION === 'function' &&
    typeof osdFilters?.CONTRAST === 'function' &&
    typeof osdFilters?.GAMMA === 'function';

  let tracerNum = 0;
  Object.values(status.layerDisplaySettings).forEach((layer) => {
    const processors: unknown[] = [];

    if (layer.isTracer) {
      if (canUseOSDFilters && layer.enhanceSignal && (layer.dilation ?? 0) > 0) {
        processors.push(osdFilters.MORPHOLOGICAL_OPERATION(layer.dilation ?? 0, Math.max));
      }
      processors.push(CustomFilters.INTENSITYALPHA(tracerNum));
      tracerNum++;
    } else if (canUseOSDFilters && !layer.useIIProtocol) {
      if (layer.contrastEnabled) {
        processors.push(osdFilters.CONTRAST(layer.contrast ?? 1));
      }
      if (layer.gammaEnabled) {
        processors.push(osdFilters.GAMMA(layer.gamma ?? 1));
      }
    }

    if (processors.length) {
      const tiledImage = viewer.world.getItemAt(layer.index as number);
      if (tiledImage) {
        filters.push({ items: tiledImage, processors });
      }
    }
  });

  if (!canUseOSDFilters) {
    const requiresOSDFilters = Object.values(status.layerDisplaySettings).some((layer) =>
      Boolean(
        (layer.isTracer && layer.enhanceSignal && (layer.dilation ?? 0) > 0) ||
          (!layer.useIIProtocol && (layer.contrastEnabled || layer.gammaEnabled)),
      ),
    );
    if (requiresOSDFilters) {
      logError('OpenSeadragon.Filters is unavailable; skipping contrast, gamma, and morphology filters.');
    }
  }

  viewer.setFilterOptions({
    filters: filters as NonNullable<Parameters<OpenSeadragon.Viewer['setFilterOptions']>[0]>['filters'],
  });
}

export function resetTiledImageCache(viewer: OpenSeadragon.Viewer, status: ViewerLayerStatusSubset, layerid: string) {
  const layerIndex = Object.keys(status.layerDisplaySettings).indexOf(layerid);
  const tiledImage = viewer.world.getItemAt(layerIndex) as
    | (OpenSeadragon.TiledImage & {
        source?: { getTileUrl(level: number, x: number, y: number): string | (() => string) };
        tilesMatrix: Record<string, Record<string, Record<string, ViewerTileCacheEntry>>>;
      })
    | undefined;
  if (!tiledImage?.source) {
    return;
  }

  Object.entries(tiledImage.tilesMatrix).forEach(([level, levelTiles]) => {
    Object.entries(levelTiles).forEach(([x, xTiles]) => {
      Object.entries(xTiles).forEach(([y, tile]) => {
        const resolvedTileUrl = tiledImage.source.getTileUrl(parseInt(level, 10), parseInt(x, 10), parseInt(y, 10));
        const newTileUrl = typeof resolvedTileUrl === 'function' ? resolvedTileUrl() : resolvedTileUrl;
        if (tile.url !== newTileUrl) {
          tile.exists = true;
          tile.loaded = false;
          tile.url = newTileUrl;
        }
      });
    });
  });

  tiledImage.reset();
}

export function applyLayerDilationChange(
  layerSettings: LayerDisplaySetting,
  enabled: boolean,
  manualEnhancing: boolean,
  dilation: number,
) {
  if (layerSettings.enhanceSignal !== enabled) {
    if (!enabled) {
      layerSettings.dilation = layerSettings.autoDilation;
      layerSettings.manualEnhancing = false;
    }
    layerSettings.enhanceSignal = enabled;
    return;
  }

  if (layerSettings.manualEnhancing !== manualEnhancing) {
    layerSettings.dilation = manualEnhancing ? layerSettings.manualDilation : layerSettings.autoDilation;
    layerSettings.manualEnhancing = manualEnhancing;
    return;
  }

  if (manualEnhancing) {
    layerSettings.manualDilation = dilation === 0 ? dilation : Math.floor(dilation / 2) * 2 + 1;
    layerSettings.dilation = layerSettings.manualDilation;
  }
}
