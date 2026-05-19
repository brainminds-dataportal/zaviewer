import OpenSeadragon from 'openseadragon';

import ZAVConfig from '../ZAVConfig';

export type ViewerHistoryParams = {
  activePlane?: number;
  sliceNum?: number;
  imageZoom?: number;
  center?: OpenSeadragon.Point;
  editMode?: boolean;
  initPanelExpanded?: boolean;
};

export type ViewerViewportState = Pick<ViewerHistoryParams, 'imageZoom' | 'center'> & {
  viewportZoom?: number;
  viewportCenter?: OpenSeadragon.Point;
};

export type ViewerNavigationState = {
  activePlane: number;
  chosenSlices: Record<number, number>;
  pendingVersion: number;
};

export type ViewerNavigationRequest = {
  plane: number;
  slice: number;
  viewport?: ViewerViewportState | null;
  applyViewport?: boolean;
  force?: boolean;
  syncHistory?: boolean;
  onRegionsCreated?: (() => void) | null;
};

export type ViewerPlaneConfig = {
  axial_size?: number;
  coronal_size?: number;
  sagittal_size?: number;
  imageSize?: number;
  anyImageSize: number;
  baseMinImageZoom: number;
  baseMaxImageZoom: number;
};

export function normalizeViewportState(
  viewportParams?: ViewerHistoryParams | ViewerViewportState | null,
): ViewerViewportState | null {
  const maybeViewportState = viewportParams as ViewerViewportState | undefined | null;
  if (
    !viewportParams?.center &&
    typeof viewportParams?.imageZoom === 'undefined' &&
    typeof maybeViewportState?.viewportZoom === 'undefined' &&
    !maybeViewportState?.viewportCenter
  ) {
    return null;
  }
  const normalizedParams = viewportParams ?? {};
  return {
    imageZoom: normalizedParams.imageZoom,
    center: normalizedParams.center,
    viewportZoom: maybeViewportState?.viewportZoom,
    viewportCenter: maybeViewportState?.viewportCenter,
  };
}

export function getPlaneImageSize(config: ViewerPlaneConfig, plane: number): number {
  switch (plane) {
    case ZAVConfig.AXIAL:
      return config.axial_size ?? config.imageSize ?? config.anyImageSize;
    case ZAVConfig.CORONAL:
      return config.coronal_size ?? config.imageSize ?? config.anyImageSize;
    case ZAVConfig.SAGITTAL:
      return config.sagittal_size ?? config.imageSize ?? config.anyImageSize;
    default:
      return config.imageSize ?? config.anyImageSize;
  }
}

export function getPlaneImageZoomBounds(config: ViewerPlaneConfig, plane: number) {
  const imageSize = Number(getPlaneImageSize(config, plane) || config.anyImageSize);
  return {
    min: (config.baseMinImageZoom / imageSize) * 1000,
    max: (config.baseMaxImageZoom / imageSize) * 1000,
  };
}

export function boundViewportStateToPlane(
  config: ViewerPlaneConfig,
  plane: number,
  viewportParams?: ViewerViewportState | null,
) {
  if (!viewportParams) {
    return null;
  }

  const boundedViewport: ViewerViewportState = {};
  const planeImageSize = getPlaneImageSize(config, plane);
  if (typeof viewportParams.viewportZoom !== 'undefined') {
    boundedViewport.viewportZoom = viewportParams.viewportZoom;
  }
  if (viewportParams.viewportCenter) {
    boundedViewport.viewportCenter = viewportParams.viewportCenter;
  }
  if (typeof viewportParams.imageZoom !== 'undefined') {
    const zoomBounds = getPlaneImageZoomBounds(config, plane);
    boundedViewport.imageZoom = Math.min(Math.max(viewportParams.imageZoom, zoomBounds.min), zoomBounds.max);
  }
  if (viewportParams.center) {
    boundedViewport.center = new OpenSeadragon.Point(
      Math.min(Math.max(viewportParams.center.x, 0), planeImageSize),
      Math.min(Math.max(viewportParams.center.y, 0), planeImageSize),
    );
  }

  return boundedViewport.center ||
    typeof boundedViewport.imageZoom !== 'undefined' ||
    typeof boundedViewport.viewportZoom !== 'undefined' ||
    boundedViewport.viewportCenter
    ? boundedViewport
    : null;
}

export function createCenteredViewportForPlane(
  config: ViewerPlaneConfig,
  plane: number,
  liveViewport?: ViewerViewportState | null,
  viewportCenter?: OpenSeadragon.Point,
) {
  const planeImageSize = getPlaneImageSize(config, plane);
  return boundViewportStateToPlane(config, plane, {
    viewportZoom: liveViewport?.viewportZoom,
    imageZoom: liveViewport?.imageZoom,
    center: new OpenSeadragon.Point(planeImageSize / 2, planeImageSize / 2),
    viewportCenter,
  });
}

export function getHistoryStepParamsFromViewport(viewportParams?: ViewerViewportState | null) {
  const stepParams: Record<string, unknown> = {};
  if (typeof viewportParams?.imageZoom !== 'undefined') {
    stepParams.z = viewportParams.imageZoom.toFixed(3);
  }
  if (viewportParams?.center) {
    stepParams.x = Math.round(viewportParams.center.x);
    stepParams.y = Math.round(viewportParams.center.y);
  }
  return stepParams;
}
