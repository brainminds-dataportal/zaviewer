import OpenSeadragon from 'openseadragon';

import RegionsManager from '../RegionsManager';
import type { RaphaelElementLike, RaphaelSetLike, ViewerRegionInfoLike } from './viewerTypes';

export function splitRegionId(regionId: string) {
  const suffix = regionId ? regionId.substring(regionId.length - 2) : '';
  const side = suffix === '_L' ? '(left)' : suffix === '_R' ? '(right)' : '';
  const abbrev = side ? regionId.substring(0, regionId.length - 2) : regionId;
  return { suffix, side, abbrev };
}

export function resolveTreeRegionId(regionInfo?: Pick<ViewerRegionInfoLike, 'abbrev' | 'regionId'> | null) {
  return RegionsManager.resolveRegionId(regionInfo?.abbrev, regionInfo?.regionId);
}

export function getClickedRegionInfo(
  target: EventTarget | null,
  currentSliceRegions: Map<string, ViewerRegionInfoLike>,
) {
  if (!(target instanceof Element)) {
    return null;
  }
  const regionElement = target.closest('[bma\\:regionId]');
  if (!regionElement) {
    return null;
  }
  const regionId = regionElement.getAttribute('bma:regionId')?.trim();
  if (!regionId) {
    return null;
  }
  const pathId =
    regionElement.tagName.toLowerCase() === 'path'
      ? regionElement.getAttribute('id')?.trim()
      : Array.from(currentSliceRegions.entries()).find(([, regionInfo]) => regionInfo.regionId === regionId)?.[0];
  return { regionId, pathId };
}

export function isRaphaelElementLike(item: unknown): item is RaphaelElementLike {
  if (!item || typeof item !== 'object') {
    return false;
  }
  const candidate = item as Partial<RaphaelElementLike>;
  return candidate.node instanceof SVGGraphicsElement && typeof candidate.attr === 'function';
}

export function getRaphaelElements(element: unknown): RaphaelElementLike[] {
  const raphaelElement = element as RaphaelElementLike;
  if (typeof raphaelElement.length === 'number' && raphaelElement.length > 0) {
    const setItems = Array.from(
      { length: raphaelElement.length },
      (_unused, index) => raphaelElement[index] as unknown,
    );
    return setItems.filter(isRaphaelElementLike);
  }
  return raphaelElement.node instanceof SVGGraphicsElement ? [raphaelElement] : [];
}

export type ViewerRegionPresentationState = {
  customBorderColor: string;
  customBorderWidth: number;
  displayAreas: boolean;
  displayBorders: boolean;
  regionsOpacity: number;
  showRegions: boolean;
  useCustomBorders: boolean;
};

export function applyMouseOverPresentation(
  element: unknown,
  state: ViewerRegionPresentationState,
  forcedBorder = false,
) {
  const [el] = getRaphaelElements(element);
  if (!el) {
    return;
  }
  const color = el.node.getAttribute('fill') ?? '#000000';
  const fillOpacity =
    !state.displayAreas || state.regionsOpacity < 0.05
      ? 0
      : state.regionsOpacity + (state.regionsOpacity > 0.6 ? -0.4 : 0.4);
  const strokeOpacity = forcedBorder || state.displayBorders ? 1 : 0;
  (element as RaphaelElementLike).attr({
    'fill-opacity': fillOpacity,
    'stroke-opacity': strokeOpacity,
    'stroke-width': '4px',
    stroke: color,
  });
  getRaphaelElements(element).forEach((item) => {
    item.node.classList.add('delin-high');
    item.node.classList.remove('delin-NOThigh');
  });
}

export function applySelectedPresentation(element: unknown, state: ViewerRegionPresentationState) {
  const fillOpacity =
    !state.displayAreas || state.regionsOpacity < 0.05
      ? 0
      : state.regionsOpacity + (state.regionsOpacity > 0.6 ? -0.4 : 0.4);
  const strokeOpacity = state.showRegions ? 0.7 : 0;
  (element as RaphaelElementLike).attr({
    'fill-opacity': fillOpacity,
    'stroke-opacity': strokeOpacity,
    'stroke-width': '3px',
    stroke: '#0000ff',
  });
  getRaphaelElements(element).forEach((item) => {
    item.node.classList.add('delin-select');
    item.node.classList.remove('delin-NOTselect');
  });
}

export function applyUnselectedPresentation(element: unknown, state: ViewerRegionPresentationState) {
  const [el] = getRaphaelElements(element);
  if (!el) {
    return;
  }
  const color =
    state.displayBorders && state.useCustomBorders
      ? state.customBorderColor
      : (el.node.getAttribute('fill') ?? '#000000');
  const fillOpacity = state.displayAreas ? state.regionsOpacity : 0;
  const strokeOpacity = state.displayBorders ? 0.5 : 0;
  const strokeWidth = `${state.useCustomBorders ? state.customBorderWidth : 2}px`;
  (element as RaphaelElementLike).attr({
    'fill-opacity': fillOpacity,
    'stroke-opacity': strokeOpacity,
    'stroke-width': strokeWidth,
    stroke: color,
  });
  getRaphaelElements(element).forEach((item) => {
    item.node.classList.remove('delin-select');
    item.node.classList.add('delin-NOTselect');
  });
}

export function applyMouseOutPresentation(
  element: unknown,
  isSelected: boolean | undefined,
  state: ViewerRegionPresentationState,
) {
  getRaphaelElements(element).forEach((item) => {
    item.node.classList.remove('delin-high');
    item.node.classList.add('delin-NOThigh');
  });
  if (isSelected) {
    applySelectedPresentation(element, state);
  } else {
    applyUnselectedPresentation(element, state);
  }
}

export function applyHiddenPresentation(element: unknown) {
  (element as RaphaelElementLike).attr({
    'fill-opacity': 0,
    'stroke-opacity': 0,
  });
}

export function getResolvedCurrentSliceTreeRegions(currentSliceRegions: Map<string, ViewerRegionInfoLike>) {
  return Array.from(currentSliceRegions.values())
    .map((regionInfo) => resolveTreeRegionId(regionInfo))
    .filter((regionId): regionId is string => typeof regionId === 'string');
}

export function getRegionCenterPoint(args: {
  regionSet: RaphaelSetLike;
  currentSliceRegions: Map<string, ViewerRegionInfoLike>;
  nameList: Array<string | null | undefined>;
  dzWidth: number;
  dzHeight: number;
  dzDiff: number;
}) {
  const { currentSliceRegions, dzDiff, dzHeight, dzWidth, nameList, regionSet } = args;
  let newX = 0;
  let newY = 0;
  let snCount = 0;

  for (let k = 0; k < nameList.length; k++) {
    regionSet.forEach((el) => {
      const subNode = el[0];
      if (!el.id) {
        return;
      }
      const regionInfo = currentSliceRegions.get(el.id);
      if (subNode && regionInfo && resolveTreeRegionId(regionInfo) === nameList[k]) {
        snCount++;
        const bbox = subNode.getBBox();
        newX += (bbox.x + bbox.width / 2) / dzWidth;
        newY += (dzDiff + bbox.y + bbox.height / 2) / dzHeight;
      }
    });
  }

  if (snCount === 0) {
    return null;
  }
  return new OpenSeadragon.Point(newX / snCount, newY / snCount);
}
