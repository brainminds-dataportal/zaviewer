import { describeRegionPath } from './viewerOverlayLoader';
import type { RaphaelElementLike, RaphaelPaperLike, RaphaelSetLike } from './viewerTypes';

type RegionEventListenerMap = Record<string, unknown>;

export function importSvgRegions(args: {
  root: SVGSVGElement;
  svgElement: SVGSVGElement;
  regionSrcGroup: Element;
  labelSrcGroup: Element | null;
  labelsg: SVGGElement;
  svgNs: string;
  backgroundPathId: string;
  paper: RaphaelPaperLike;
  regionSet: RaphaelSetLike;
  regionEventListeners: RegionEventListenerMap;
  showRegions: boolean;
  connectRegionListeners: (targetElt: unknown, regionListener: unknown, pathElt?: unknown) => void;
  addAndActivateRegion: (pathId: string, regionId: string, newPathElt: RaphaelElementLike) => void;
  applyUnselectedPresentation: (element: unknown) => void;
  createEditSVGBackground: (srcBackNode: Element) => void;
  unselectAllFromBackground: () => void;
}) {
  const {
    addAndActivateRegion,
    applyUnselectedPresentation,
    backgroundPathId,
    connectRegionListeners,
    createEditSVGBackground,
    labelSrcGroup,
    labelsg,
    paper,
    regionEventListeners,
    regionSet,
    regionSrcGroup,
    root,
    showRegions,
    svgElement,
    svgNs,
    unselectAllFromBackground,
  } = args;

  let hasBackground = false;
  const regionPaths = regionSrcGroup.getElementsByTagName('path');
  for (let i = 0; i < regionPaths.length; i++) {
    const regionPath = regionPaths[i];
    const { regionId, pathId, isBackgroundElement } = describeRegionPath(regionPath, i, backgroundPathId);
    const newPathElt = paper.importSVG(regionPath);

    if (isBackgroundElement) {
      newPathElt.id = pathId;
      newPathElt.attr('fill-opacity', 0.0);
      newPathElt.click(() => {
        if (showRegions) {
          unselectAllFromBackground();
        }
      });
      createEditSVGBackground(regionPath);
      hasBackground = true;
    } else {
      newPathElt.id = pathId;
      addAndActivateRegion(pathId, regionId, newPathElt);
      applyUnselectedPresentation(newPathElt);
    }

    regionSet.push(newPathElt);

    if (!isBackgroundElement) {
      const modifiedRegionInDom = svgElement.getElementById(pathId);
      if (modifiedRegionInDom) {
        modifiedRegionInDom.setAttribute('bma:regionId', regionId);
        modifiedRegionInDom.setAttribute('data-zav-pathid', pathId);
        modifiedRegionInDom.setAttribute('vector-effect', 'non-scaling-stroke');
        connectRegionListeners(modifiedRegionInDom, regionEventListeners[pathId], newPathElt);

        if (labelSrcGroup) {
          const labelSrc = root.getElementById(`lbl-${pathId}`);
          if (labelSrc) {
            const labelElt = document.createElementNS(svgNs, 'text');
            labelElt.setAttribute('class', 'zav-region-label');
            labelElt.setAttribute('bma:regionId', regionId);
            labelElt.setAttribute('data-zav-pathid', pathId);
            labelElt.setAttribute(
              'transform',
              `translate(${labelSrc.getAttribute('x')}, ${labelSrc.getAttribute('y')})`,
            );
            labelElt.innerHTML = labelSrc.innerHTML;
            labelsg.appendChild(labelElt);
            connectRegionListeners(labelElt, regionEventListeners[pathId], newPathElt);
          }
        }
      } else {
        connectRegionListeners(newPathElt, regionEventListeners[pathId]);
      }
    }
  }

  return { hasBackground };
}
