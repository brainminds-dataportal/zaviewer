import type OpenSeadragon from 'openseadragon';
import _ from 'underscore';

type ViewerConfigSubset = {
  hasCOSource?: boolean;
  hasDelineation?: boolean;
  svgFolderName?: string;
  layers: Record<string, unknown>;
};

type ViewerStatusSubset = {
  hasCurrentSVG: boolean;
  currentRegionOverlay?: HTMLElement;
  tileSources: unknown[];
};

export function createViewerOptions(args: {
  viewerId: string;
  navigatorId: string;
  tileSources: unknown[];
  initialPage: number | undefined;
  hasCOSource?: boolean;
}) {
  const { hasCOSource, initialPage, navigatorId, tileSources, viewerId } = args;
  return Object.assign(
    {
      id: viewerId,
      tileSources,
      initialPage,
      minZoomLevel: 0,
      minZoomImageRatio: 0.5,
      maxZoomLevel: 16,
      maxImageCacheCount: 2000,
      sequenceMode: true,
      preserveViewport: true,
      showHomeControl: false,
      showZoomControl: false,
      showSequenceControl: false,
      showNavigator: true,
      navigatorId,
      showReferenceStrip: false,
      showFullPageControl: false,
      gestureSettingsMouse: {
        clickToZoom: false,
        scrollToZoom: true,
      },
      preserveImageSizeOnResize: true,
      autoResize: true,
    },
    hasCOSource ? { crossOriginPolicy: 'Anonymous' } : {},
  ) as OpenSeadragon.Options;
}

export function bindViewerStartupEvents(args: {
  viewer: OpenSeadragon.Viewer;
  config: ViewerConfigSubset;
  status: ViewerStatusSubset;
  overridingConf: unknown;
  setupViewerOverlaysAndLayers: (dimensions: OpenSeadragon.Point) => void;
  bindViewerCanvasMousemoveHandler: () => void;
  applyInitialOpenState: (overridingConf: unknown) => void;
  getRegionsSVGUrl: () => string;
  addSVGData: (svgPath: string, overlayElement: HTMLElement) => void;
}) {
  const {
    addSVGData,
    applyInitialOpenState,
    bindViewerCanvasMousemoveHandler,
    config,
    getRegionsSVGUrl,
    overridingConf,
    setupViewerOverlaysAndLayers,
    status,
    viewer,
  } = args;

  viewer.addHandler('add-overlay', (event: { element: HTMLElement }) => {
    if (config.svgFolderName !== '' && event.element.id === 'svgDelineationOverlay' && config.hasDelineation) {
      status.hasCurrentSVG = false;
      status.currentRegionOverlay = event.element;
      addSVGData(getRegionsSVGUrl(), event.element);
    }
  });

  viewer.addHandler('open', () => {
    if (!viewer.source) {
      return;
    }
    setupViewerOverlaysAndLayers(viewer.source.dimensions);
    bindViewerCanvasMousemoveHandler();
  });

  viewer.addOnceHandler('open', () => {
    applyInitialOpenState(overridingConf);
  });

  viewer.addHandler('open', () => {
    const navItemReplaceHnd = (event: OpenSeadragon.AddItemWorldEvent) => {
      const userData = (event.userData ?? {}) as { replaced?: number; removed?: number };
      if (viewer.navigator.world.getItemCount() === 1 && (userData.replaced ?? 0) === 0) {
        const tiledImage = viewer.navigator.world.getItemAt(0);
        viewer.navigator.addTiledImage({
          tileSource: event.item.source,
          originalTiledImage: tiledImage,
          opacity: 1,
          replace: true,
          index: 0,
        } as unknown as Parameters<OpenSeadragon.Viewer['addTiledImage']>[0]);
        userData.replaced = 1;
      } else if (viewer.navigator.world.getItemCount() > 1) {
        userData.removed = (userData.removed ?? 0) + 1;
        viewer.navigator.world.removeItem(viewer.navigator.world.getItemAt(viewer.navigator.world.getItemCount() - 1));
      }

      if (userData.replaced === 1 && userData.removed === _.size(config.layers) - 1) {
        viewer.navigator.world.removeHandler('add-item', navItemReplaceHnd);
      }
    };

    viewer.navigator.world.addHandler('add-item', navItemReplaceHnd, { replaced: 0, removed: 0 });
  });
}
