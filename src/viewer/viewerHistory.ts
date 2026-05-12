import type OpenSeadragon from 'openseadragon';

import type { ViewerHistoryParams } from './viewerNavigation';

export function buildActualHistoryStepParams(args: {
  activePlane: number;
  sliceNum: number;
  imageZoom: number;
  center: OpenSeadragon.Point;
  planeImageSize?: number;
}) {
  const { activePlane, center, imageZoom, planeImageSize, sliceNum } = args;
  const hasValidCenter =
    !planeImageSize || (center.x >= 0 && center.y >= 0 && center.x <= planeImageSize && center.y <= planeImageSize);

  const stepParams: Record<string, unknown> = {
    s: sliceNum,
    a: activePlane,
  };
  if (hasValidCenter) {
    stepParams.z = imageZoom.toFixed(3);
    stepParams.x = Math.round(center.x);
    stepParams.y = Math.round(center.y);
  }

  return {
    stepParams,
    hasValidCenter,
  };
}

export function hasViewerHistoryParams(params: ViewerHistoryParams) {
  return (
    typeof params.activePlane !== 'undefined' ||
    typeof params.sliceNum !== 'undefined' ||
    typeof params.imageZoom !== 'undefined' ||
    typeof params.center !== 'undefined'
  );
}

export function hasCompleteHistoryStepParams(params: Record<string, unknown>) {
  return ['z', 'x', 'y', 's', 'a'].every((key) => typeof params[key] !== 'undefined');
}
