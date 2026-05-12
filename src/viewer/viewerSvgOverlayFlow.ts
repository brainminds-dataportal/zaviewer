import type OpenSeadragon from 'openseadragon';

import { getXmlDocument } from '../common/http';
import { buildRoiElement, createLabelGroup } from './viewerOverlayLoader';
import { finalizeSvgOverlayLoad } from './viewerSvgOverlayFinalize';
import { importSvgRegions } from './viewerSvgRegionsImport';
import type { RaphaelElementLike, RaphaelPaperLike, RaphaelSetLike } from './viewerTypes';

type RegionEventListenerMap = Record<string, unknown>;

function importSvgRois(args: {
  root: SVGSVGElement;
  svgElement: SVGSVGElement;
  roig: SVGGElement;
  svgNs: string;
  setHoveredROI: (roiId: string | null, roiLabel: string | null) => void;
  ensureRoiInfosLoaded: () => Promise<void>;
}) {
  const { ensureRoiInfosLoaded, roig, root, setHoveredROI, svgElement, svgNs } = args;
  const roiSrcGroup = root.getElementById('rois');
  const hasROIs = roiSrcGroup != null;
  if (!hasROIs) {
    return { hasROIs };
  }

  void ensureRoiInfosLoaded().catch((error) => {
    console.error(error);
  });

  if (!roiSrcGroup) {
    return { hasROIs };
  }

  const roiPaths = roiSrcGroup.getElementsByTagName('path');
  for (let i = 0; i < roiPaths.length; i++) {
    const roiPath = roiPaths[i];
    const { roiElt, roiID, roiLabel } = buildRoiElement(roiPath);
    roiElt.addEventListener('mouseover', () => setHoveredROI(roiID ?? null, roiLabel ?? null));
    roiElt.addEventListener('mouseout', () => setHoveredROI(null, null));
    roig.appendChild(roiElt);
  }

  const defs = document.createElementNS(svgNs, 'defs');
  svgElement.appendChild(defs);
  return { hasROIs };
}

export function startSvgOverlayFlow(args: {
  svgName: string;
  overlayElement: HTMLElement;
  svgNs: string;
  backgroundPathId: string;
  getPaper: () => RaphaelPaperLike | null;
  getRegionSet: () => RaphaelSetLike | null;
  isRequestCurrent: () => boolean;
  clearCurrentSliceRegions: () => void;
  clearRegionMouseTrackers: () => void;
  setRegionEventListeners: (listeners: RegionEventListenerMap) => void;
  setCurrentRoiGroup: (group: SVGGElement) => void;
  setCurrentLabelGroup: (group: SVGGElement) => void;
  setHasCurrentSvg: (hasSvg: boolean) => void;
  setHasROIs: (hasROIs: boolean) => void;
  setHasRegionLabels: (hasRegionLabels: boolean) => void;
  setHoveredROI: (roiId: string | null, roiLabel: string | null) => void;
  isShowingRegions: () => boolean;
  getPendingInitialAtlasFit: () => boolean;
  markInitialAtlasFitApplied: () => void;
  getViewer: () => OpenSeadragon.Viewer | null;
  getDzDiff: () => number;
  getRightPanelWidth: () => number;
  ensureRoiInfosLoaded: () => Promise<void>;
  connectRegionListeners: (targetElt: unknown, regionListener: unknown, pathElt?: unknown) => void;
  addAndActivateRegion: (pathId: string, regionId: string, newPathElt: RaphaelElementLike) => void;
  applyUnselectedPresentation: (element: unknown) => void;
  createEditSVGBackground: (srcBackNode: Element) => void;
  unselectAllFromBackground: () => void;
  applyROIPresentation: () => void;
  applyLabelPresentation: () => void;
  adjustResizeRegionsOverlay: () => void;
  selectRegions: (regions: string[]) => void;
  hideDelineation: () => void;
  syncCurrentSliceRegionsToRegionTree: () => void;
  trySyncInitialHistoryStep: () => void;
  raiseRegionsCreated: () => void;
  signalStatusChanged: () => void;
}) {
  const { overlayElement, svgName } = args;

  void getXmlDocument(svgName, 'image/svg+xml').then((svgFile) => {
    if (!args.isRequestCurrent()) {
      return;
    }

    const root = svgFile.getElementsByTagName('svg')[0];
    if (!root) {
      args.setHasCurrentSvg(false);
      return;
    }
    args.setHasCurrentSvg(true);

    args.clearCurrentSliceRegions();
    args.clearRegionMouseTrackers();
    const regionEventListeners: RegionEventListenerMap = {};
    args.setRegionEventListeners(regionEventListeners);

    const svgElement = overlayElement.getElementsByTagName('svg')[0];
    if (!svgElement) {
      return;
    }

    const roig = document.createElementNS(args.svgNs, 'g') as SVGGElement;
    roig.setAttribute('id', 'rois');
    args.setCurrentRoiGroup(roig);

    const { hasROIs } = importSvgRois({
      root,
      svgElement,
      roig,
      svgNs: args.svgNs,
      setHoveredROI: args.setHoveredROI,
      ensureRoiInfosLoaded: args.ensureRoiInfosLoaded,
    });
    args.setHasROIs(hasROIs);

    const labelsg = createLabelGroup(args.svgNs);
    args.setCurrentLabelGroup(labelsg);

    const labelSrcGroup = root.getElementById('region-labels');
    args.setHasRegionLabels(labelSrcGroup != null);

    const regionSrcGroup = root.getElementsByTagName('g')[0];
    if (!regionSrcGroup) {
      return;
    }
    const regionPaper = args.getPaper();
    const regionSet = args.getRegionSet();
    if (!regionPaper || !regionSet) {
      return;
    }

    const { hasBackground } = importSvgRegions({
      root,
      svgElement,
      regionSrcGroup,
      labelSrcGroup,
      labelsg,
      svgNs: args.svgNs,
      backgroundPathId: args.backgroundPathId,
      paper: regionPaper,
      regionSet,
      regionEventListeners,
      showRegions: args.isShowingRegions(),
      connectRegionListeners: args.connectRegionListeners,
      addAndActivateRegion: args.addAndActivateRegion,
      applyUnselectedPresentation: args.applyUnselectedPresentation,
      createEditSVGBackground: args.createEditSVGBackground,
      unselectAllFromBackground: args.unselectAllFromBackground,
    });
    if (!hasBackground) {
      console.warn(`SVG without background: Region rendering and edition will likely fail! ${svgName}`);
    }

    const regionsGroup = svgElement.getElementsByTagName('g')[0] as SVGGElement | undefined;
    if (!regionsGroup) {
      return;
    }

    if (
      finalizeSvgOverlayLoad({
        regionsGroup,
        roig,
        labelsg,
        pendingInitialAtlasFit: args.getPendingInitialAtlasFit(),
        viewer: args.getViewer(),
        dzDiff: args.getDzDiff(),
        rightPanelWidth: args.getRightPanelWidth(),
        applyROIPresentation: args.applyROIPresentation,
        applyLabelPresentation: args.applyLabelPresentation,
        adjustResizeRegionsOverlay: args.adjustResizeRegionsOverlay,
        selectRegions: args.selectRegions,
        hideDelineation: args.hideDelineation,
        syncCurrentSliceRegionsToRegionTree: args.syncCurrentSliceRegionsToRegionTree,
        trySyncInitialHistoryStep: args.trySyncInitialHistoryStep,
        raiseRegionsCreated: args.raiseRegionsCreated,
        signalStatusChanged: args.signalStatusChanged,
        showRegions: args.isShowingRegions(),
      }).atlasFitApplied
    ) {
      args.markInitialAtlasFitApplied();
    }
  });
}
