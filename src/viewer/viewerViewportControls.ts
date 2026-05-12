import type OpenSeadragon from 'openseadragon';

type ViewerPoint = { x: number; y: number };
type ViewerPointerState = ViewerPoint & { c: number };
type ViewerPosition = [ViewerPointerState, ViewerPoint, ViewerPoint];

export type ViewerViewportControlStatus = {
  clippingModeOn?: boolean;
  measureModeOn?: boolean;
  position: ViewerPosition;
  prevZoomPerClick?: number;
  processedImage?: HTMLImageElement | null;
  processedZoom?: number | null;
};

export function drawProcessingResult(args: {
  ctx: CanvasRenderingContext2D | null | undefined;
  processedImage: HTMLImageElement | null | undefined;
  processedZoom: number | null | undefined;
  getZoomFactor: () => number;
  clipOrigX: number;
  clipOrigY: number;
}) {
  const { clipOrigX, clipOrigY, ctx, getZoomFactor, processedImage, processedZoom } = args;
  if (!processedImage || !ctx) {
    return false;
  }

  const sf = getZoomFactor() / (processedZoom ?? 1);
  const deltaSF = 1 - sf;
  const needScaling = Math.abs(deltaSF) > Number.EPSILON;
  if (needScaling) {
    ctx.translate(deltaSF * clipOrigX, deltaSF * clipOrigY);
    ctx.scale(sf, sf);
  }
  ctx.drawImage(processedImage, clipOrigX, clipOrigY);
  if (needScaling) {
    ctx.resetTransform();
  }
  return !needScaling;
}

export function setSelectClip(args: {
  status: ViewerViewportControlStatus;
  active: boolean;
  posCanvas: HTMLCanvasElement | null;
  claerPosition: () => void;
  hideRegions: () => void;
  signalStatusChanged: (status: ViewerViewportControlStatus) => void;
}) {
  const { active, claerPosition, hideRegions, posCanvas, signalStatusChanged, status } = args;
  claerPosition();
  status.processedImage = null;
  if (active) {
    hideRegions();
    status.measureModeOn = false;
  }
  status.clippingModeOn = active;
  if (!posCanvas) {
    return;
  }
  posCanvas.style.display = active ? 'block' : 'none';
  signalStatusChanged(status);
}

export function isSelectClipModeOn(status: ViewerViewportControlStatus | undefined) {
  return status?.clippingModeOn;
}

export function isClipSelected(status: ViewerViewportControlStatus | undefined) {
  return status?.clippingModeOn && status.position[0].c === 2;
}

export function isZoomEnabled(viewer: OpenSeadragon.Viewer) {
  const zoomViewer = viewer as OpenSeadragon.Viewer & {
    zoomPerClick?: number;
    gestureSettingsMouse?: { clickToZoom?: boolean };
  };
  return Boolean(zoomViewer.gestureSettingsMouse?.clickToZoom) && 1.0 !== zoomViewer.zoomPerClick;
}

export function setZoomEnabled(
  viewer: OpenSeadragon.Viewer,
  status: ViewerViewportControlStatus,
  active: boolean,
  signalStatusChanged: (status: ViewerViewportControlStatus) => void,
) {
  const zoomViewer = viewer as OpenSeadragon.Viewer & {
    zoomPerClick?: number;
    gestureSettingsMouse?: { clickToZoom?: boolean; scrollToZoom?: boolean };
  };
  if (active) {
    zoomViewer.zoomPerClick = status.prevZoomPerClick ?? zoomViewer.zoomPerClick ?? 2;
    if (zoomViewer.gestureSettingsMouse) {
      zoomViewer.gestureSettingsMouse.clickToZoom = true;
    }
  } else {
    status.prevZoomPerClick = zoomViewer.zoomPerClick ?? 2;
    zoomViewer.zoomPerClick = 1.0;
    if (zoomViewer.gestureSettingsMouse) {
      zoomViewer.gestureSettingsMouse.clickToZoom = false;
      zoomViewer.gestureSettingsMouse.scrollToZoom = true;
    }
  }
  signalStatusChanged(status);
}

export function getZoomFactor(viewer: OpenSeadragon.Viewer) {
  return viewer?.world.getItemCount()
    ? Number((100 * (viewer.world.getItemAt(0)?.viewportToImageZoom(viewer.viewport.getZoom(true)) ?? 0)).toFixed(3))
    : 0;
}

export function setZoomFactor(viewer: OpenSeadragon.Viewer, zf: number) {
  const zoomViewer = viewer as OpenSeadragon.Viewer & { zoomPerSecond?: number };
  const animDuration = zoomViewer.zoomPerSecond;
  zoomViewer.zoomPerSecond = 0.1;
  const viewportZoom = viewer.viewport.imageToViewportZoom(zf / 100);
  viewer.viewport.zoomTo(viewportZoom, undefined, true);
  zoomViewer.zoomPerSecond = animDuration;
}

export function goHome(viewer: OpenSeadragon.Viewer) {
  viewer.viewport.goHome(false);
}
