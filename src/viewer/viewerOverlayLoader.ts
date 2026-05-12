import OpenSeadragon from 'openseadragon';

import { debugInfo } from '../common/debugLog';
import { RoiInfos } from '../RoiInfo';

export function buildRoiElement(srcChild: Element) {
  const roiElt = srcChild.cloneNode(true) as SVGPathElement;
  let roiID: string | undefined;
  let roiLabel: string | undefined;

  for (const attr of Array.from(srcChild.attributes)) {
    if (attr.name === 'zav:roi-id') {
      roiID = attr.value;
      roiElt.setAttribute('zav-roi-id', roiID);
    } else if (attr.name === 'zav:roi-label') {
      roiLabel = attr.value;
    }
  }

  const roiInfo = roiID ? RoiInfos.getRoiById(roiID) : null;
  if (roiInfo) {
    roiLabel = roiInfo.roiLabel;
    roiElt.setAttribute('fill', roiInfo.fill);
  }
  roiElt.setAttribute('class', 'zav-roi');
  roiElt.setAttribute('vector-effect', 'non-scaling-stroke');

  return { roiElt, roiID, roiLabel };
}

export function createLabelGroup(svgNs: string) {
  const labelsg = document.createElementNS(svgNs, 'g') as SVGGElement;
  labelsg.setAttribute('id', 'region_labels');
  return labelsg;
}

export function describeRegionPath(regionPath: Element, index: number, backgroundPathId: string) {
  const sourceRegionId = regionPath.getAttribute('bma:regionId');
  let regionId = sourceRegionId ? sourceRegionId.trim() : null;
  let pathId: string;
  if (regionId) {
    pathId = regionPath.getAttribute('id')?.trim() ?? `${regionId}-${index}`;
  } else {
    regionId = regionPath.getAttribute('id')?.trim() ?? '';
    pathId = regionId + (regionId === backgroundPathId ? '' : `-${index}`);
    regionPath.setAttribute('id', pathId);
  }
  return {
    regionId,
    pathId,
    isBackgroundElement: regionId === backgroundPathId,
  };
}

export function applyInitialAtlasFit(args: {
  pendingInitialAtlasFit: boolean;
  viewer: OpenSeadragon.Viewer | undefined;
  regionsGroup: SVGGElement;
  dzDiff: number;
  rightPanelWidth: number;
}) {
  const { dzDiff, pendingInitialAtlasFit, regionsGroup, rightPanelWidth, viewer } = args;
  if (!pendingInitialAtlasFit || !viewer) {
    return false;
  }

  const atlasBounds = regionsGroup.getBBox();
  if (!(atlasBounds.width > 0 && atlasBounds.height > 0)) {
    return false;
  }

  const containerSize = viewer.viewport.getContainerSize();
  const coveredPart = containerSize.x > 0 ? rightPanelWidth / containerSize.x : 0;
  const marginRatio = 0.08;
  const extraRightWidth = (atlasBounds.width * coveredPart) / Math.max(1 - coveredPart, 0.1);
  const imageRect = new OpenSeadragon.Rect(
    atlasBounds.x - (atlasBounds.width * marginRatio) / 2,
    dzDiff + atlasBounds.y - (atlasBounds.height * marginRatio) / 2,
    atlasBounds.width * (1 + marginRatio) + extraRightWidth,
    atlasBounds.height * (1 + marginRatio),
  );

  viewer.viewport.fitBounds(viewer.viewport.imageToViewportRectangle(imageRect), true);
  debugInfo('Applied initial atlas fit', {
    atlasBounds,
    imageRect,
    coveredPart,
  });
  return true;
}
