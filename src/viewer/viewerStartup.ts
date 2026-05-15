import type OpenSeadragon from 'openseadragon';

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

  // Keep the navigator's world in sync with the main viewer's layered world.
  // The viewer layer logic already resets navigator opacities explicitly, so
  // pruning navigator items here can leave it blank when layer/world timing changes.
}
