import type OpenSeadragon from 'openseadragon';
import _ from 'underscore';

import type { LayerDisplaySetting } from '../components/ViewerPanelTypes';

type ViewerPoint = { x: number; y: number };
type ViewerEventLike = {
  originalEvent?: Event;
  target?: EventTarget | null;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  buttons?: number;
  position?: ViewerPoint;
  preventDefaultAction?: boolean;
  stopHandlers?: boolean;
  stopBubbling?: boolean;
};

type ViewerTrackerHandlerName = 'scrollHandler' | 'clickHandler' | 'dragHandler' | 'keyHandler';
type ViewerTrackerEventMap = {
  scrollHandler: Parameters<NonNullable<OpenSeadragon.MouseTracker['scrollHandler']>>[0];
  clickHandler: Parameters<NonNullable<OpenSeadragon.MouseTracker['clickHandler']>>[0];
  dragHandler: Parameters<NonNullable<OpenSeadragon.MouseTracker['dragHandler']>>[0];
  keyHandler: Parameters<NonNullable<OpenSeadragon.MouseTracker['keyHandler']>>[0];
};

type ViewerWithInnerTracker = OpenSeadragon.Viewer & {
  innerTracker: OpenSeadragon.MouseTracker;
};

type RuntimeStatus = {
  hasLabelMap: boolean;
  hoveredRegion?: string | null;
  isAllLoaded?: boolean;
  layerDisplaySettings: Record<string, LayerDisplaySetting>;
  measureModeOn?: boolean;
  processedImage?: HTMLImageElement | null;
  showRegions: boolean;
};

export function bindViewerRuntimeBindings(args: {
  viewer: OpenSeadragon.Viewer;
  eventSource: OpenSeadragon.EventSource;
  status: RuntimeStatus;
  hookViewerTrackerHandler: <TName extends ViewerTrackerHandlerName>(
    viewer: ViewerWithInnerTracker,
    handlerName: TName,
    callback: (event: ViewerTrackerEventMap[TName]) => void,
  ) => void;
  onViewerScroll: (event: ViewerTrackerEventMap['scrollHandler']) => void;
  onViewerClick: (event: ViewerTrackerEventMap['clickHandler']) => void;
  onViewerDrag: (event: ViewerTrackerEventMap['dragHandler']) => void;
  onViewerKey: (event: ViewerTrackerEventMap['keyHandler']) => void;
  makeHistoryStep: () => void;
  adjustFiltersAfterZoom: (zoom: number) => void;
  getZoomFactor: () => number;
  refreshScalebar: () => void;
  resizeCanvas: () => void;
  adjustResizeRegionsOverlay: (set: unknown) => void;
  getRegionSet: () => unknown;
  setMeasureMode: (active: boolean) => void;
  pointerupHandler: (event: MouseEvent) => void;
  pointerdownHandler: (event: MouseEvent) => void;
  signalStatusChanged: (status: RuntimeStatus) => void;
  onExternalRegionSelection: () => void;
}) {
  const {
    adjustFiltersAfterZoom,
    adjustResizeRegionsOverlay,
    eventSource,
    getRegionSet,
    getZoomFactor,
    hookViewerTrackerHandler,
    makeHistoryStep,
    onExternalRegionSelection,
    onViewerClick,
    onViewerDrag,
    onViewerKey,
    onViewerScroll,
    pointerdownHandler,
    pointerupHandler,
    refreshScalebar,
    resizeCanvas,
    setMeasureMode,
    signalStatusChanged,
    status,
    viewer,
  } = args;

  viewer.addHandler('page', () => {
    status.processedImage = null;
    requestAnimationFrame(() => {
      refreshScalebar();
    });
  });

  viewer.addHandler('zoom', (zoomEvent: { zoom: number }) => {
    makeHistoryStep();
    adjustFiltersAfterZoom(zoomEvent.zoom);
    if (status.hasLabelMap) {
      status.hoveredRegion = undefined;
    }
  });

  viewer.addHandler('pan', () => {
    makeHistoryStep();
  });

  let ruleToUpdate: CSSStyleRule | undefined;
  for (const sheet of document.styleSheets) {
    try {
      if (sheet.cssRules.length > 0) {
        const rule = sheet.cssRules[0];
        if (rule instanceof CSSStyleRule && rule.selectorText === '.zav-region-label') {
          ruleToUpdate = rule;
          break;
        }
      }
    } catch (_error) {
      // ignore cross-origin stylesheet access
    }
  }

  const changeLabelSizeDebounced = _.debounce(() => {
    if (!ruleToUpdate) {
      return;
    }
    const pf = 100 / getZoomFactor();
    ruleToUpdate.style.setProperty('font-size', `${pf * 15}px`);
    ruleToUpdate.style.setProperty('stroke-width', `${pf * 2.0}px`);
  }, 150);

  if (ruleToUpdate) {
    viewer.addHandler('zoom', changeLabelSizeDebounced);
    changeLabelSizeDebounced();
  }

  const viewerWithInnerTracker = viewer as ViewerWithInnerTracker;
  hookViewerTrackerHandler(viewerWithInnerTracker, 'scrollHandler', onViewerScroll);
  hookViewerTrackerHandler(viewerWithInnerTracker, 'clickHandler', onViewerClick);
  hookViewerTrackerHandler(viewerWithInnerTracker, 'dragHandler', onViewerDrag);
  hookViewerTrackerHandler(viewerWithInnerTracker, 'keyHandler', onViewerKey);

  viewer.addHandler('resize', () => {
    resizeCanvas();
    adjustResizeRegionsOverlay(getRegionSet());
  });

  viewer.addHandler('animation', () => {
    adjustResizeRegionsOverlay(getRegionSet());
  });

  viewer.canvas.addEventListener('click', pointerupHandler);
  viewer.canvas.addEventListener('pointerdown', pointerdownHandler);
  viewer.canvas.addEventListener('mousedown', pointerdownHandler);

  const cnv = document.createElement('canvas');
  cnv.id = 'poscanvas';
  if (status.showRegions) {
    cnv.style.display = 'none';
  }
  viewer.canvas.appendChild(cnv);
  setMeasureMode(Boolean(status.measureModeOn));
  resizeCanvas();

  eventSource.addHandler('zav-layer-loading', (event: { layer: string }) => {
    status.layerDisplaySettings[event.layer].loading = true;
    if (status.isAllLoaded) {
      eventSource.raiseEvent('zav-alllayers-loading', {});
    }
    status.isAllLoaded = false;
    signalStatusChanged(status);
  });

  eventSource.addHandler('zav-layer-loaded', (event: { layer: string }) => {
    status.layerDisplaySettings[event.layer].loading = false;
    const isAllLoaded = !_.findKey(status.layerDisplaySettings, (val: LayerDisplaySetting) => Boolean(val.loading));
    if (isAllLoaded && !status.isAllLoaded) {
      eventSource.raiseEvent('zav-alllayers-loaded', {});
    }
    status.isAllLoaded = isAllLoaded;
    signalStatusChanged(status);
  });

  eventSource.addHandler('zav-alllayers-loaded', (_event: ViewerEventLike) => {});

  onExternalRegionSelection();
}
