import type OpenSeadragon from 'openseadragon';

import RegionsManager from '../RegionsManager';
import { applyInitialAtlasFit } from './viewerOverlayLoader';

export function finalizeSvgOverlayLoad(args: {
  regionsGroup: SVGGElement;
  roig: SVGGElement;
  labelsg: SVGGElement;
  pendingInitialAtlasFit: boolean;
  viewer: OpenSeadragon.Viewer | null;
  dzDiff: number;
  rightPanelWidth: number;
  applyROIPresentation: () => void;
  applyLabelPresentation: () => void;
  adjustResizeRegionsOverlay: () => void;
  selectRegions: (regions: string[]) => void;
  hideDelineation: () => void;
  syncCurrentSliceRegionsToRegionTree: () => void;
  trySyncInitialHistoryStep: () => void;
  raiseRegionsCreated: () => void;
  signalStatusChanged: () => void;
  showRegions: boolean;
}) {
  const {
    adjustResizeRegionsOverlay,
    applyLabelPresentation,
    applyROIPresentation,
    dzDiff,
    hideDelineation,
    labelsg,
    pendingInitialAtlasFit,
    raiseRegionsCreated,
    regionsGroup,
    rightPanelWidth,
    roig,
    selectRegions,
    showRegions,
    signalStatusChanged,
    syncCurrentSliceRegionsToRegionTree,
    trySyncInitialHistoryStep,
    viewer,
  } = args;

  regionsGroup.appendChild(roig);
  applyROIPresentation();

  regionsGroup.appendChild(labelsg);
  applyLabelPresentation();

  const atlasFitApplied = applyInitialAtlasFit({
    pendingInitialAtlasFit,
    viewer: viewer ?? undefined,
    regionsGroup,
    dzDiff,
    rightPanelWidth,
  });
  if (atlasFitApplied) {
    trySyncInitialHistoryStep();
  }

  raiseRegionsCreated();
  adjustResizeRegionsOverlay();
  selectRegions(RegionsManager.getSelectedRegions());

  if (!showRegions) {
    hideDelineation();
  }

  syncCurrentSliceRegionsToRegionTree();
  signalStatusChanged();

  return { atlasFitApplied };
}
