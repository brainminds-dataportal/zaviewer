import { invertCssColor } from '../common/colorUtils';

import type { ViewerRegionInfoLike } from './viewerTypes';

export function buildEditCursorSVG(args: {
  brushRadius: number;
  fillColor: string;
  tool: string;
  imageZoom: number;
  svgNs: string;
}) {
  const { brushRadius, fillColor, imageZoom, svgNs, tool } = args;
  const brushBorder = 8;
  const invcolor = invertCssColor(fillColor);
  const scaledWidth = 2 * brushRadius * imageZoom;
  const eraserOn = tool === 'eraser';
  const strokeDash = eraserOn ? 'stroke-dasharray="1 1"' : '';
  const circleFill = eraserOn ? invcolor : fillColor;
  const strokeColor = eraserOn ? 'silver' : invcolor;

  return `url('data:image/svg+xml;utf8,
<svg
 width="${scaledWidth}" 
 height="${scaledWidth}" 
 viewBox="0 0 ${2 * (brushRadius + brushBorder)} ${2 * (brushRadius + brushBorder)}" 
 xmlns="${svgNs}" 
 style="background-color: transparent;"
 >
  <g>
    <circle 
     cx="${brushRadius + brushBorder}" 
     cy="${brushRadius + brushBorder}" 
     r="${brushRadius}" 
     stroke="${strokeColor}" 
     stroke-width="${brushBorder}" 
     fill="${circleFill}" 
     fill-opacity="0.55"
     ${strokeDash}
    />
  </g>
</svg>
') ${scaledWidth / 2} ${scaledWidth / 2}, crosshair
`.replace(/\n/g, '');
}

export function getSvgEditPosition(x: number, y: number, imageZoom: number) {
  return { x: Math.round(x / imageZoom), y: Math.round(y / imageZoom) };
}

export function renameEditedRegion(args: {
  currentSliceRegions: Map<string, ViewerRegionInfoLike>;
  oldPathId: string;
  newRegionId: string;
  splitRegionId: (regionId: string) => { abbrev: string };
}) {
  const { currentSliceRegions, newRegionId, oldPathId, splitRegionId } = args;
  const regionInfo = currentSliceRegions.get(oldPathId);
  if (!regionInfo) {
    return null;
  }

  currentSliceRegions.delete(oldPathId);
  const sepIndex = oldPathId.lastIndexOf('-');
  const pathIdSuffix = oldPathId.substring(sepIndex);
  const newPathId = `${newRegionId}${pathIdSuffix}`;
  const { abbrev } = splitRegionId(newRegionId);
  regionInfo.pathId = newPathId;
  regionInfo.abbrev = abbrev;
  regionInfo.regionId = newRegionId;
  currentSliceRegions.set(newPathId, regionInfo);
  return newPathId;
}

export function saveSvgRegion(args: { url: string; regionInDom: Element; create: boolean; origPathId?: string }) {
  const { create, origPathId, regionInDom, url } = args;
  const pathId = regionInDom.getAttribute('id');
  const regionId = regionInDom.getAttribute('bma:regionId');

  return fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode: create ? 'cr' : 'up',
      pathId: origPathId ? origPathId : pathId,
      regionId,
      pathSVG: regionInDom.outerHTML,
    }),
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error(`${response.status} - ${response.statusText}`);
    })
    .catch(() => {
      console.error(`Error when saving region path ${pathId}`);
    });
}

export function createSvgForRegions(args: { url: string; width?: number; height?: number; onCreated: () => void }) {
  const { height, onCreated, url, width } = args;
  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ width, height }),
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }
      throw new Error(`${response.status} - ${response.statusText}`);
    })
    .then(() => {
      onCreated();
    })
    .catch((error) => {
      console.error(`Error while creating new SVG:${error}`);
    });
}
