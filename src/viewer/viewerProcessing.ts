import OpenSeadragon from 'openseadragon';

import { debugDebug, debugError } from '../common/debugLog';
import type { LayerDisplaySettings } from '../components/ViewerPanelTypes';

type ViewerPoint = { x: number; y: number };
type ViewerPointerState = ViewerPoint & { c: number };
type ViewerPosition = [ViewerPointerState, ViewerPoint, ViewerPoint];
export type ViewerClipRegion = [number, number, number, number];

export type ViewerProcessor = {
  name: string;
  inputSize?: {
    constraint?: string;
    width?: number;
    height?: number;
  };
  processImageData: (imageData: ImageData) => Promise<ImageData | HTMLImageElement>;
};

type ZAVProcessingsApi = {
  nbProcessors: () => number;
  getProcessors: () => ViewerProcessor[];
  imageDataToImage: (imageData: ImageData) => HTMLImageElement | Promise<HTMLImageElement>;
};

declare global {
  var ZAVProcessings: ZAVProcessingsApi | undefined;
}

export type ViewerProcessingStatus = {
  clippingModeOn?: boolean;
  constrainedClippedRegion?: ViewerClipRegion | null;
  layerDisplaySettings: LayerDisplaySettings;
  longRunningMessage?: string | null;
  position: ViewerPosition;
  processedImage?: HTMLImageElement | null;
  processedRegion?: ViewerClipRegion | null;
  processedTopleftPx?: [number, number] | null;
  processedZoom?: number | null;
  processingActive?: boolean;
  selectedprocIndex?: number;
};

export function hasProcessingsModule() {
  return typeof globalThis.ZAVProcessings !== 'undefined';
}

export function hasProcessors() {
  return hasProcessingsModule() && (globalThis.ZAVProcessings?.nbProcessors() ?? 0) > 0;
}

export function getProcessors() {
  return hasProcessingsModule() ? (globalThis.ZAVProcessings?.getProcessors() ?? []) : [];
}

export function getProcessor(procIndex: number) {
  const procs = getProcessors();
  return procIndex < procs.length ? procs[procIndex] : null;
}

export function setSelectedProcessorIndex(args: {
  status: ViewerProcessingStatus;
  procIndex: number;
  resetPositionview: () => void;
  displayClipBox: () => void;
}) {
  const { displayClipBox, procIndex, resetPositionview, status } = args;
  const nbProcessors = hasProcessingsModule() ? (globalThis.ZAVProcessings?.nbProcessors() ?? 0) : 0;
  if (procIndex >= nbProcessors || status.selectedprocIndex === procIndex) {
    return;
  }

  status.selectedprocIndex = procIndex;
  if (status.processedImage) {
    resetPositionview();
  }
  displayClipBox();
}

export function getSelectedProcessorIndex(status: ViewerProcessingStatus) {
  if (!hasProcessors()) {
    return -1;
  }
  if (typeof status.selectedprocIndex === 'undefined') {
    status.selectedprocIndex = 0;
  }
  return status.selectedprocIndex;
}

export function getSelectedProcessor(status: ViewerProcessingStatus) {
  const procIndex = getSelectedProcessorIndex(status);
  return procIndex >= 0 ? getProcessor(procIndex) : null;
}

export function imageDataToImage(imageData: ImageData) {
  if (!globalThis.ZAVProcessings) {
    throw new Error('ZAVProcessings is unavailable');
  }
  return globalThis.ZAVProcessings.imageDataToImage(imageData);
}

function createPanMoves(
  bounds: OpenSeadragon.Rect,
  clipBounds: { vlx: number; vrx: number; vty: number; vby: number },
) {
  const panMoves: Array<{
    col: number;
    row: number;
    lastRow: boolean;
    lastCol: boolean;
    point: OpenSeadragon.Point;
  }> = [];
  const halfWidth = bounds.width / 2;
  const halfHeight = bounds.height / 2;
  let row = 0;
  for (let panY = clipBounds.vty; panY < clipBounds.vby; panY += bounds.height, row++) {
    let col = 0;
    for (let panX = clipBounds.vlx; panX < clipBounds.vrx; panX += bounds.width, col++) {
      panMoves.push({
        col,
        row,
        lastRow: panY + bounds.height >= clipBounds.vby,
        lastCol: panX + bounds.width >= clipBounds.vrx,
        point: new OpenSeadragon.Point(panX + halfWidth, panY + halfHeight),
      });
    }
  }
  return panMoves;
}

function joinCollectedImageData(args: {
  imageDataArray: Array<{ data: ImageData; col: number; row: number }>;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const { canvasHeight, canvasWidth, height, imageDataArray, width } = args;
  const fullImgDataSizeByte = width * height * 4;
  debugDebug(`allocating ${fullImgDataSizeByte} bytes`);
  const joinedImgDataPx = new Uint8ClampedArray(fullImgDataSizeByte);

  imageDataArray.forEach((imageDataInfo) => {
    const partImgData = imageDataInfo.data;
    for (let x = 0; x < partImgData.width; x++) {
      for (let y = 0; y < partImgData.height; y++) {
        for (let c = 0; c < 4; c += 1) {
          const vOffset = imageDataInfo.row * canvasHeight * width;
          const hOffset = imageDataInfo.col * canvasWidth;
          const fullImgLineOffset = y * width;
          const partImgLineOffset = y * partImgData.width;
          joinedImgDataPx[(vOffset + hOffset + fullImgLineOffset + x) * 4 + c] =
            partImgData.data[(partImgLineOffset + x) * 4 + c];
        }
      }
    }
  });

  imageDataArray.length = 0;
  return new ImageData(joinedImgDataPx, width, height);
}

export function performProcessing(args: {
  viewer: OpenSeadragon.Viewer;
  eventSource: OpenSeadragon.EventSource;
  status: ViewerProcessingStatus;
  procIndex: number;
  isClipSelected: () => boolean;
  getZoomFactor: () => number;
  getCurrentImageSize: () => number;
  displayClipBox: () => void;
  signalStatusChanged: (status: ViewerProcessingStatus) => void;
}) {
  const {
    displayClipBox,
    eventSource,
    getCurrentImageSize,
    getZoomFactor,
    isClipSelected,
    procIndex,
    signalStatusChanged,
    status,
    viewer,
  } = args;
  if (!isClipSelected()) {
    return;
  }

  const proc = getProcessor(procIndex);
  if (!proc) {
    return;
  }

  debugDebug(`Computing "${proc.name}"`);
  status.processedZoom = getZoomFactor();
  status.processedRegion = status.constrainedClippedRegion ?? null;
  status.processedImage = null;
  status.processedTopleftPx = null;

  const tilescanvas = viewer.drawer.canvas;
  const ctx = tilescanvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const startProcessor = (imageData: ImageData) => {
    debugDebug(`start processor "${proc.name}" on ${imageData.width} x ${imageData.height} pixels`);
    status.processingActive = true;
    status.longRunningMessage = 'Performing custom processing...';
    signalStatusChanged(status);

    const finishProcessing = () => {
      status.processingActive = false;
      status.longRunningMessage = null;
      signalStatusChanged(status);
    };

    try {
      Promise.resolve(proc.processImageData(imageData))
        .then((processedImageData) => {
          if (processedImageData instanceof Image) {
            return processedImageData;
          }
          return imageDataToImage(processedImageData);
        })
        .then((imageObj) => {
          imageObj.name =
            `${proc.name}-${status.processedTopleftPx?.[0] ?? 0},${status.processedTopleftPx?.[1] ?? 0}@${Math.round((status.processedZoom ?? 0) * 100) / 100.0}-` +
            new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
          status.processedImage = imageObj;
          displayClipBox();
        })
        .catch((error: unknown) => {
          debugError(error);
          alert(`An error occured:\n${error}`);
          signalStatusChanged(status);
        })
        .finally(finishProcessing);
    } catch (error) {
      alert(`An error occured:\n${error}`);
      finishProcessing();
    }
  };

  const bounds = viewer.viewport.getBounds(true);
  const vpCoord1 = viewer.viewport.imageToViewportCoordinates(status.position[1].x, status.position[1].y);
  const vpCoord2 = viewer.viewport.imageToViewportCoordinates(status.position[2].x, status.position[2].y);
  const vlx = Math.min(vpCoord1.x, vpCoord2.x);
  const vrx = Math.max(vpCoord1.x, vpCoord2.x);
  const vty = Math.min(vpCoord1.y, vpCoord2.y);
  const vby = Math.max(vpCoord1.y, vpCoord2.y);

  const [lx, ty, w, h] = status.processedRegion ?? [0, 0, 0, 0];
  status.processedTopleftPx = [Math.round(getCurrentImageSize() * vlx), Math.round(getCurrentImageSize() * vty)];

  if (vlx >= bounds.x && vty >= bounds.y && vrx <= bounds.x + bounds.width && vby <= bounds.y + bounds.height) {
    startProcessor(ctx.getImageData(lx, ty, w, h));
    return;
  }

  const panMoves = createPanMoves(bounds, { vlx, vrx, vty, vby });
  const nbParts = panMoves.length;
  const canvasWidth = tilescanvas.clientWidth;
  const canvasHeight = tilescanvas.clientHeight;

  const getDeferredCollectImageDataPromise = (
    imageDataArray: Array<{ data: ImageData; col: number; row: number }>,
    panMove: { col: number; row: number; lastRow: boolean; lastCol: boolean; point: OpenSeadragon.Point },
  ) => {
    const collectImageData = () => {
      const partWidth = panMove.lastCol ? w - panMove.col * canvasWidth : canvasWidth;
      const partHeight = panMove.lastRow ? h - panMove.row * canvasHeight : canvasHeight;
      imageDataArray.push({
        data: ctx.getImageData(0, 0, partWidth, partHeight),
        col: panMove.col,
        row: panMove.row,
      });
      return imageDataArray;
    };

    return new Promise<Array<{ data: ImageData; col: number; row: number }>>((resolve) =>
      setTimeout(() => resolve(collectImageData()), 200),
    );
  };

  const getNextPanPromise = (imageDataArray: Array<{ data: ImageData; col: number; row: number }>) =>
    new Promise<Array<{ data: ImageData; col: number; row: number }>>((resolve) => {
      if (!panMoves.length) {
        resolve(imageDataArray);
        return;
      }

      const panMove = panMoves.shift();
      if (!panMove) {
        resolve(imageDataArray);
        return;
      }
      status.longRunningMessage = `Collecting data... (${nbParts - panMoves.length}/${nbParts})`;

      viewer.addOnceHandler('pan', () => {
        let resolveDeferred = false;
        for (let i = 0; i < viewer.world.getItemCount() && !resolveDeferred; i++) {
          const tiledImage = viewer.world.getItemAt(i);
          const layer = Object.values(status.layerDisplaySettings).find((candidate) => candidate.index === i);
          if (layer?.enabled && !tiledImage.getFullyLoaded()) {
            eventSource.addOnceHandler('zav-alllayers-loaded', () => {
              void getDeferredCollectImageDataPromise(imageDataArray, panMove).then((imgDataArr) =>
                resolve(getNextPanPromise(imgDataArr)),
              );
            });
            resolveDeferred = true;
          }
        }

        if (!resolveDeferred) {
          void getDeferredCollectImageDataPromise(imageDataArray, panMove).then((imgDataArr) =>
            resolve(getNextPanPromise(imgDataArr)),
          );
        }
      });

      viewer.viewport.panTo(panMove.point, true);
    });

  status.longRunningMessage = 'Collecting data...';
  signalStatusChanged(status);

  getNextPanPromise([])
    .then((imageDataArray) => {
      status.longRunningMessage = 'Aggregating data...';
      return joinCollectedImageData({
        imageDataArray,
        width: w,
        height: h,
        canvasWidth,
        canvasHeight,
      });
    })
    .then((joinedImageData) => {
      viewer.viewport.fitBounds(bounds);
      return joinedImageData;
    })
    .then((joinedImageData) => startProcessor(joinedImageData))
    .catch((error: unknown) => {
      debugError('Error while processing:', error);
      status.longRunningMessage = String(error);
      signalStatusChanged(status);
      setTimeout(() => {
        status.longRunningMessage = String(error);
        signalStatusChanged(status);
      }, 1500);
    });
}
