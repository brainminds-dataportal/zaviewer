import OpenSeadragon from 'openseadragon';
import paper from 'paper';

import type { BrowserHistory, Location, Update } from './common/browserHistory';
import { invertCssColor } from './common/colorUtils';
import { debounce } from './common/debounce';
import { debugError, debugInfo, debugWarn } from './common/debugLog';
import { getJson, getOptionalJson, getXmlDocument } from './common/http';
import type { LayerDisplaySettings, ViewerLayerConfig, ZAViewerConfig } from './components/ViewerPanelTypes';
import LabelMapper from './LabelMapper';
import RegionsManager from './RegionsManager';
import { type IROIsPayload, RoiInfos } from './RoiInfo';
import UserSettings from './UserSettings';
import Utils from './Utils';
import { ScalebarLocation, ScalebarType } from './vendor/openseadragon-scalebar';
import Raphael from './vendor/setupRaphael';
import {
  buildActualHistoryStepParams,
  hasCompleteHistoryStepParams,
  hasViewerHistoryParams,
} from './viewer/viewerHistory';
import {
  addLayer as addViewerLayer,
  adjustTracerLayerDilation,
  applyLayerDilationChange,
  setAllFilters as applyViewerFilters,
  getFileTileSourceUrl as buildFileTileSourceUrl,
  getFileTileUrl as buildFileTileUrl,
  getIIIFTileSourceUrl as buildIIIFTileSourceUrl,
  getIIPTileUrl as buildIIPTileUrl,
  getTileSourceDef as buildTileSourceDef,
  getLayerOpacity as getViewerLayerOpacity,
  refreshLayersEffectiveOpacity as refreshViewerLayersEffectiveOpacity,
  resetTiledImageCache as resetViewerTiledImageCache,
} from './viewer/viewerLayers';
import { getPhysicalPoint, getPhysicalPointXY } from './viewer/viewerMeasurement';
import {
  boundViewportStateToPlane,
  createCenteredViewportForPlane,
  getHistoryStepParamsFromViewport,
  getPlaneImageSize,
  getPlaneImageZoomBounds,
  normalizeViewportState,
  type ViewerHistoryParams,
  type ViewerNavigationRequest,
  type ViewerNavigationState,
  type ViewerViewportState,
} from './viewer/viewerNavigation';
import {
  getCandidatePlaneSlices,
  getRegionsSVGUrlForPlaneSlice,
  hasCurrentSliceAtlasRegions,
} from './viewer/viewerOverlay';
import {
  imageDataToImage as convertImageDataToImage,
  getSelectedProcessor as getCurrentSelectedProcessor,
  getProcessor as getViewerProcessor,
  getProcessors as getViewerProcessors,
  getSelectedProcessorIndex as getViewerSelectedProcessorIndex,
  hasProcessingsModule as hasViewerProcessingsModule,
  hasProcessors as hasViewerProcessors,
  performProcessing as runViewerProcessing,
  setSelectedProcessorIndex as setViewerSelectedProcessorIndex,
} from './viewer/viewerProcessing';
import {
  buildEditCursorSVG,
  getSvgEditPosition,
  renameEditedRegion,
  createSvgForRegions as requestCreateSvgForRegions,
  saveSvgRegion,
} from './viewer/viewerRegionEditing';
import {
  clearRegionMouseTrackers as clearViewerRegionMouseTrackers,
  connectRegionListeners as connectViewerRegionListeners,
  destroyRegionMouseTracker as destroyViewerRegionMouseTracker,
  extendRegionListenerForEdit as extendViewerRegionListenerForEdit,
} from './viewer/viewerRegionInteractions';
import {
  applyHiddenPresentation as applyViewerHiddenPresentation,
  applyMouseOutPresentation as applyViewerMouseOutPresentation,
  applyMouseOverPresentation as applyViewerMouseOverPresentation,
  applySelectedPresentation as applyViewerSelectedPresentation,
  applyUnselectedPresentation as applyViewerUnselectedPresentation,
  getClickedRegionInfo,
  getRegionCenterPoint,
  getResolvedCurrentSliceTreeRegions,
  resolveTreeRegionId,
  splitRegionId,
} from './viewer/viewerRegions';
import { bindViewerRuntimeBindings } from './viewer/viewerRuntimeBindings';
import {
  createInitialLayerDisplaySettings,
  createInitialNavigationBootstrap,
  getInitialPlaneAndSlice,
} from './viewer/viewerSession';
import { bindViewerStartupEvents, createViewerOptions } from './viewer/viewerStartup';
import { startSvgOverlayFlow } from './viewer/viewerSvgOverlayFlow';
import {
  drawProcessingResult as drawViewportProcessingResult,
  getZoomFactor as getViewerZoomFactor,
  goHome as goViewerHome,
  isClipSelected as isViewerClipSelected,
  isSelectClipModeOn as isViewerSelectClipModeOn,
  isZoomEnabled as isViewerZoomEnabled,
  setSelectClip as setViewerSelectClip,
  setZoomEnabled as setViewerZoomEnabled,
  setZoomFactor as setViewerZoomFactor,
} from './viewer/viewerViewportControls';
import { bindViewerWorldItemHandlers } from './viewer/viewerWorldBindings';
import ZAVConfig from './ZAVConfig';

export const VIEWER_ID = 'openseadragon1';
export const NAVIGATOR_ID = 'navigatorDiv';

const VIEWER_ACTIONSOURCEID = 'VIEWER';
const BACKGROUND_PATHID = 'background';

const SVGNS = 'http://www.w3.org/2000/svg';

type ViewerPoint = { x: number; y: number };
type ViewerPointerState = ViewerPoint & { c: number };
type ViewerPosition = [ViewerPointerState, ViewerPoint, ViewerPoint];
type ViewerClipRegion = [number, number, number, number];
type UnknownRecord = Record<string, unknown>;
type ViewerEventLike = {
  originalEvent?: Event;
  target?: EventTarget | null;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  buttons?: number;
  position?: ViewerPoint;
  preventDefaultAction?: boolean;
  stopHandlers?: boolean;
  stopBubbling?: boolean;
};
type ViewerTrackerHandlerName = 'scrollHandler' | 'clickHandler' | 'dragHandler' | 'keyHandler';
type ViewerTrackerEventMap = {
  scrollHandler: Parameters<NonNullable<OpenSeadragon.MouseTracker['scrollHandler']>>[0];
  clickHandler: Parameters<NonNullable<OpenSeadragon.MouseTracker['clickHandler']>>[0];
  dragHandler: Parameters<NonNullable<OpenSeadragon.MouseTracker['dragHandler']>>[0];
  keyHandler: Parameters<NonNullable<OpenSeadragon.MouseTracker['keyHandler']>>[0];
};
type ViewerWithInnerTracker = OpenSeadragon.Viewer & {
  innerTracker: OpenSeadragon.MouseTracker;
};
type NumericLookup = Record<number, number>;
type RegionMouseTracker = OpenSeadragon.MouseTracker & {
  __zavDestroyed?: boolean;
};
type RegionTrackedElement = Element & {
  __zavRegionMouseTracker?: RegionMouseTracker;
};
type EditableRegionPath = {
  simplify(): boolean;
  exportSVG(): SVGElement;
  subtract(item: paper.Item, options?: { insert?: boolean }): EditableRegionPath;
  unite(item: paper.Item, options?: { insert?: boolean }): EditableRegionPath;
};
type IIIFTileDefinition = {
  width: number;
  height: number;
  scaleFactors: number[];
};
type IIIFPyramidalImageInfo = {
  width: number;
  height: number;
  tiles: IIIFTileDefinition[];
};
type RaphaelElementLike = {
  id?: string;
  node: SVGGraphicsElement;
  items?: RaphaelElementLike[];
  length?: number;
  [index: number]: SVGGraphicsElement | undefined;
  attr(name: string): string;
  attr(name: string, value: unknown): void;
  attr(attributes: UnknownRecord): void;
  click(handler: (event: ViewerEventLike) => void): void;
  dblclick(handler: (event: ViewerEventLike) => void): void;
  mouseover(handler: (event: ViewerEventLike) => void): void;
  mouseout(handler: (event: ViewerEventLike) => void): void;
};

type RaphaelSetLike = {
  push(element: RaphaelElementLike): void;
  remove(): void;
  exclude(element: Element): void;
  forEach(callback: (element: RaphaelElementLike) => void): void;
};

type RaphaelPaperLike = {
  set(): RaphaelSetLike;
  importSVG(element: Element): RaphaelElementLike;
  setTransform(transform: string): void;
};

type ViewerStatus = {
  layerDisplaySettings: LayerDisplaySettings;
  activePlane: number;
  chosenSlice: number;
  activatedPlanes: Set<number>;
  axialChosenSlice?: number;
  coronalChosenSlice?: number;
  sagittalChosenSlice?: number;
  currentSliceRegions: Map<string, ViewerRegionInfo>;
  regionEventListeners: Record<string, ViewerRegionListener>;
  regionTrackedElements: RegionTrackedElement[];
  hasLabelMap: boolean;
  hasROIs: boolean;
  hasCurrentSVG: boolean;
  hasRegionLabels: boolean;
  currentSVGName?: string;
  currentRegionOverlay?: HTMLElement;
  tileSources: unknown[];
  tileSize: number;
  tileOverlap: number;
  tileFormat: string;
  imageWidth?: number;
  imageHeight?: number;
  imageHegith?: number;
  set?: RaphaelSetLike;
  paper?: RaphaelPaperLike;
  labelsg?: SVGGElement;
  roig?: SVGGElement;
  showRegions: boolean;
  displayAreas: boolean;
  displayBorders: boolean;
  displayLabels: boolean;
  displayROIs: boolean;
  useCustomBorders: boolean;
  customBorderColor: string;
  customBorderWidth: number;
  initRegionsOpacity: number;
  regionsOpacity: number;
  hoveredRegion?: string | null;
  hoveredRegionSide?: string | null;
  hoveredRegionPath?: string | null;
  hoveredROI?: string | null;
  hoveredROILabel?: string | null;
  measureModeOn?: boolean;
  clippingModeOn?: boolean;
  processedImage?: HTMLImageElement | null;
  longRunningMessage?: string | null;
  position: ViewerPosition;
  markedPos?: { x: number; y: number }[];
  markedPosColors: string[];
  lastSelectedPath?: string | null;
  editModeOn?: boolean;
  editingActive?: boolean;
  editPathId?: string | null;
  editPathFillColor?: string | null;
  editingTool?: string;
  editingToolRadius?: number;
  ctx?: CanvasRenderingContext2D | null;
  clippedRegion?: ViewerClipRegion;
  constrainedClippedRegion?: ViewerClipRegion;
  livePosition?: number[];
  pointerdownpos?: ViewerPoint;
  selectedprocIndex?: number;
  processedZoom?: number | null;
  processedRegion?: ViewerClipRegion | null;
  processedTopleftPx?: [number, number] | null;
  processingActive?: boolean;
  IIPSVR_PATH?: string;
  iipTileInfos?: {
    minLevel: number;
    maxLevel: number;
    levelScale: NumericLookup;
    tileWidth: number;
    tileHeight: number;
    imageWidth: number;
    imgeHeight: number;
    xTilesNumAtMaxLevel: number;
    yTilesNumAtMaxLevel: number;
    xTilesNumAtLevel: NumericLookup;
  };
  prevZoomPerScroll?: number;
  prevZoomPerClick?: number;
  editOrigPathId?: string | null;
  editRegion?: Element | null;
  editSVG?: SVGSVGElement | null;
  editPathStrokeColor?: string | null;
  editLivePath?: SVGElement | null;
  editPos?: ViewerPoint | null;
  lastPos?: ViewerPoint | null;
  editRegionPath?: EditableRegionPath;
  editBackgNode?: Node | null;
  acquiringRegionToEdit?: boolean;
  mousemoveHandler?: (event: MouseEvent) => void;
  initExpanded: boolean;
  [key: string]: unknown;
};

type ViewerEditEvent = ViewerEventLike & { position: ViewerPoint };

type LegacyViewerConfig = ZAViewerConfig &
  UnknownRecord & {
    hasPlane: (plane: number | undefined) => boolean;
    firstActivePlane: number;
    showRegions: boolean;
    displayAreas: boolean;
    displayBorders: boolean;
    displayLabels: boolean;
    displayROIs: boolean;
    useCustomBorders: boolean;
    customBorderColor: string;
    customBorderWidth: number;
    axialSlideCount: number;
    coronalSlideCount: number;
    sagittalSlideCount: number;
    axialChosenSlice: number;
    coronalChosenSlice: number;
    sagittalChosenSlice: number;
    axialFirstIndex: number;
    coronalFirstIndex: number;
    sagittalFirstIndex: number;
    axialSliceStep: number;
    coronalSliceStep: number;
    sagittalSliceStep: number;
    minImageZoom: number;
    maxImageZoom: number;
    baseMinImageZoom: number;
    baseMaxImageZoom: number;
    imageSize: number;
    anyImageSize: number;
    dzWidth: number;
    dzHeight: number;
    dzDiff: number;
    dzLayerWidth: number;
    dzLayerHeight: number;
    setSelectedAtlas: (atlasIndex: number) => void;
    setPlaneSizes: (plane: number) => void;
    currentAtlas: number;
    matrix?: number[] | null;
  };
type LegacyLayerConfig = ViewerLayerConfig & UnknownRecord;

type ViewerRegionInfo = {
  pathId: string;
  abbrev?: string;
  regionId?: string;
  fill?: string;
  stroke?: string;
  [key: string]: unknown;
};

type ViewerRegionListener = {
  abbrev?: string;
  regionId?: string;
  side?: string;
  mouseover: (event: ViewerEventLike, target: unknown) => void;
  mouseout: (event: ViewerEventLike, target: unknown) => void;
  click: ((event: ViewerEventLike, target: unknown) => void) | Array<(event: ViewerEventLike, target: unknown) => void>;
  dblclick?: (event: ViewerEventLike, target: unknown) => void;
  [key: string]: unknown;
};

/** Class in charge of managing viewer's main display (OSD) and state of related elements */
class ViewerManager {
  static viewer: OpenSeadragon.Viewer;
  static config: LegacyViewerConfig;
  static history: BrowserHistory;
  static status: ViewerStatus;
  static makeHistoryStep: (explicitParams?: Record<string, unknown>) => void;
  static signalStatusChanged: (status: ViewerStatus) => void;
  static regionActionner: ReturnType<typeof RegionsManager.getActionner>;
  static eventSource: OpenSeadragon.EventSource;
  static pendingInitialAtlasFit: boolean;
  static initialHistorySynced: boolean;
  static roiInfosRequest: Promise<IROIsPayload | null> | undefined;
  static atlasSlicePresenceCache = new Map<string, boolean>();
  static pendingCurrentSliceTreeRegions?: string[];
  static navigationState: ViewerNavigationState;
  static navigatorWheelListener?: (event: WheelEvent) => void;

  private constructor() {}

  private static syncNavigationStateToStatus() {
    if (!ViewerManager.status || !ViewerManager.navigationState) {
      return;
    }
    ViewerManager.status.activePlane = ViewerManager.navigationState.activePlane;
    ViewerManager.status.axialChosenSlice = ViewerManager.navigationState.chosenSlices[ZAVConfig.AXIAL];
    ViewerManager.status.coronalChosenSlice = ViewerManager.navigationState.chosenSlices[ZAVConfig.CORONAL];
    ViewerManager.status.sagittalChosenSlice = ViewerManager.navigationState.chosenSlices[ZAVConfig.SAGITTAL];
    ViewerManager.status.chosenSlice =
      ViewerManager.getPlaneChosenSlice(ViewerManager.navigationState.activePlane) ?? 0;
  }

  static get VIEWER_ID() {
    return VIEWER_ID;
  }

  static get NAVIGATOR_ID() {
    return NAVIGATOR_ID;
  }

  static getElementById<T extends Element>(id: string) {
    return document.getElementById(id) as T | null;
  }

  static destroyRegionMouseTracker(targetElement: RegionTrackedElement | null | undefined) {
    destroyViewerRegionMouseTracker(targetElement);
  }

  static clearRegionMouseTrackers() {
    ViewerManager.status.regionTrackedElements = clearViewerRegionMouseTrackers(
      ViewerManager.status.regionTrackedElements,
    );
  }

  static getCurrentRegionOverlay() {
    return (
      ViewerManager.status.currentRegionOverlay ?? ViewerManager.getElementById<HTMLElement>('svgDelineationOverlay')
    );
  }

  static getPositionCanvas() {
    return ViewerManager.getElementById<HTMLCanvasElement>('poscanvas');
  }

  static getRightPanelWidth() {
    return ViewerManager.getElementById<HTMLElement>('ZAV-rightPanel')?.getBoundingClientRect().width ?? 0;
  }

  private static refreshScalebar() {
    if (!ViewerManager.viewer?.scalebar) {
      return;
    }
    const pixelsPerMeter = ViewerManager.config.matrix?.[0] ? 1000 / ViewerManager.config.matrix[0] : null;
    ViewerManager.viewer.scalebar({
      type: pixelsPerMeter ? ScalebarType.MAP : ScalebarType.NONE,
      pixelsPerMeter,
      minWidth: '150px',
      location: ScalebarLocation.BOTTOM_LEFT,
      xOffset: 5,
      yOffset: 10,
      stayInsideImage: false,
      color: 'rgb(255, 0, 0, 0.65)',
      fontColor: 'rgb(255,255,255)',
      backgroundColor: 'rgba(100,100, 100, 0.25)',
      fontSize: '10px',
      barThickness: 2,
    });
  }

  private static getCurrentTiledImage() {
    return ViewerManager.viewer?.world?.getItemAt(0) ?? null;
  }

  private static getCurrentImageZoom() {
    return ViewerManager.viewer.viewport.viewportToImageZoom(ViewerManager.viewer.viewport.getZoom(true));
  }

  private static getCurrentImageSize() {
    const imageWidth = ViewerManager.getCurrentTiledImage()?.source?.dimensions?.x;
    return typeof imageWidth === 'number' && Number.isFinite(imageWidth) && imageWidth > 0
      ? imageWidth
      : getPlaneImageSize(ViewerManager.config, ViewerManager.getActivePlane());
  }

  private static getCurrentImageCenter() {
    return ViewerManager.viewer.viewport.viewportToImageCoordinates(ViewerManager.viewer.viewport.getCenter(true));
  }

  private static bindNavigatorWheelZoom() {
    const navigatorElement = ViewerManager.viewer?.navigator?.element;
    if (!navigatorElement) {
      return;
    }

    if (ViewerManager.navigatorWheelListener) {
      navigatorElement.removeEventListener('wheel', ViewerManager.navigatorWheelListener);
    }

    ViewerManager.navigatorWheelListener = (event: WheelEvent) => {
      ViewerManager.handleNavigatorWheel(event);
    };
    navigatorElement.addEventListener('wheel', ViewerManager.navigatorWheelListener, { passive: false });
  }

  private static handleNavigatorWheel(event: WheelEvent) {
    const navigatorViewer = ViewerManager.viewer?.navigator;
    if (!ViewerManager.viewer?.viewport || !navigatorViewer?.viewport || event.deltaY === 0) {
      return;
    }
    const zoomViewer = ViewerManager.viewer as OpenSeadragon.Viewer & { zoomPerScroll?: number };

    event.preventDefault();
    event.stopPropagation();

    const navigatorRect = navigatorViewer.element.getBoundingClientRect();
    const navigatorPixel = new OpenSeadragon.Point(
      event.clientX - navigatorRect.left,
      event.clientY - navigatorRect.top,
    );
    const navigatorViewportPoint = navigatorViewer.viewport.pointFromPixel(navigatorPixel, true);
    const imagePoint = navigatorViewer.viewport.viewportToImageCoordinates(navigatorViewportPoint);
    const mainViewportPoint = ViewerManager.viewer.viewport.imageToViewportCoordinates(imagePoint);
    const zoomPerScroll = zoomViewer.zoomPerScroll ?? 1.2;
    const nextViewportZoom =
      ViewerManager.viewer.viewport.getZoom(true) * (event.deltaY < 0 ? zoomPerScroll : 1 / zoomPerScroll);

    ViewerManager.viewer.viewport.zoomTo(nextViewportZoom, mainViewportPoint, true);
  }

  static refreshNavigator() {
    if (!ViewerManager.viewer?.navigator || !ViewerManager.viewer?.viewport) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ViewerManager.viewer.navigator.updateSize();
        ViewerManager.viewer.navigator.update(ViewerManager.viewer.viewport);
        ViewerManager.viewer.forceRedraw();
      });
    });
  }

  static setMouseNavigationEnabled(enabled: boolean) {
    if (!ViewerManager.viewer) {
      return;
    }

    ViewerManager.viewer.setMouseNavEnabled(enabled);
  }

  static hookViewerTrackerHandler<Name extends ViewerTrackerHandlerName>(
    viewer: ViewerWithInnerTracker,
    handlerName: Name,
    hookHandler: (event: ViewerTrackerEventMap[Name] & ViewerEventLike) => unknown,
  ) {
    const tracker = viewer.innerTracker;
    const originalHandler = tracker[handlerName] as ((event: ViewerTrackerEventMap[Name]) => unknown) | null;

    tracker[handlerName] = ((event: ViewerTrackerEventMap[Name]) => {
      const hookedEvent = event as ViewerTrackerEventMap[Name] & ViewerEventLike;
      let result = hookHandler(hookedEvent);
      if (originalHandler && !hookedEvent.stopHandlers) {
        result = originalHandler(hookedEvent);
      }
      return !hookedEvent.stopBubbling && result;
    }) as OpenSeadragon.MouseTracker[Name];
  }

  static refreshViewerCanvas() {
    if (!ViewerManager.viewer) {
      return;
    }

    ViewerManager.viewer.forceRedraw();
    ViewerManager.viewer.world.draw();
    ViewerManager.refreshCanvasContent();
  }

  static ensureRoiInfosLoaded() {
    if (ViewerManager.roiInfosRequest) {
      return ViewerManager.roiInfosRequest;
    }

    if (!ViewerManager.config?.PUBLISH_PATH || !ViewerManager.config?.svgFolderName) {
      return Promise.resolve(null);
    }

    const roiInfoUrl = Utils.makePath(
      ViewerManager.config.PUBLISH_PATH,
      ViewerManager.config.svgFolderName,
      `rois.json${ViewerManager.config.dataVersionTag ? ViewerManager.config.dataVersionTag : ''}`,
    );

    ViewerManager.roiInfosRequest = getOptionalJson<IROIsPayload>(roiInfoUrl)
      .then((roiInfo) => {
        if (roiInfo) {
          RoiInfos.init(roiInfo);
          if (UserSettings.getBoolItem(UserSettings.SettingsKeys.ShowOverlayROI, null) == null) {
            ViewerManager.setROIDisplay(roiInfo.displayRoi);
          }
          ViewerManager.signalStatusChanged(ViewerManager.status);
        }

        return roiInfo;
      })
      .catch((error) => {
        ViewerManager.roiInfosRequest = undefined;
        throw error;
      });

    return ViewerManager.roiInfosRequest;
  }

  /**
   * Create ViewManager from the specified config and setup underlying OpenSeaDragon and related components
   * @param {object} config - configuration used as blueprint to setup the viewer
   * @param {function} callbackWhenReady - function repeatidly invoked whenever viewer's status has changed
   * @param {object} history - browser's history
   */
  static init(
    config: ZAViewerConfig,
    callbackWhenStatusChanged: (status: ViewerStatus) => void,
    history: BrowserHistory,
  ) {
    ViewerManager.config = config as LegacyViewerConfig;
    ViewerManager.roiInfosRequest = undefined;

    ViewerManager.history = history;
    //some continuous operations must not be recorded immediately in history (e.g. zooming, paning)
    ViewerManager.initialHistorySynced = false;
    ViewerManager.makeHistoryStep = debounce((explicitParams?: Record<string, unknown>) => {
      if (typeof explicitParams === 'undefined' && ViewerManager.trySyncInitialHistoryStep()) {
        return;
      }
      ViewerManager.makeActualHistoryStep(explicitParams);
    }, 500);

    ViewerManager.history.listen(({ location, action }: Update) => {
      //reset viewer only when navigating the history with Back and Forth buttons
      if (action === 'POP') {
        const locParams = ViewerManager.getParamsFromLocation(location);
        ViewerManager.applyChangeFromHistory(locParams);
      }
    });

    ViewerManager.signalStatusChanged = callbackWhenStatusChanged;
    ViewerManager.regionActionner = RegionsManager.getActionner(VIEWER_ACTIONSOURCEID);
    /** viewer specific event bus */
    ViewerManager.eventSource = new OpenSeadragon.EventSource();

    const initLayerDisplaySettings = createInitialLayerDisplaySettings(ViewerManager.config, VIEWER_ID);

    //params retrieved from initial location
    const overridingConf = ViewerManager.getParamsFromCurrLocation();
    const { navigationState, pendingInitialAtlasFit } = createInitialNavigationBootstrap(
      ViewerManager.config,
      overridingConf,
    );
    ViewerManager.pendingInitialAtlasFit = pendingInitialAtlasFit;
    ViewerManager.navigationState = navigationState;

    /** dynamic state of the viewer */
    ViewerManager.status = new Proxy(
      {
        //protocol used with image server
        useIIProtocol: overridingConf.protocol && 'IIP' === overridingConf.protocol,

        //
        imageWidth: undefined,
        imageHegith: undefined,

        //tile sources for every slice of first layer
        tileSources: [],

        //default tile infos
        tileSize: 256,
        tileOverlap: 1,
        tileFormat: 'jpg',

        /** Raphael array-like object used to operate on region delineations */
        set: undefined,
        /** Main Raphael object used to handle region delineations */
        paper: undefined,

        /** url of the last requested regions area SVG file */
        currentSVGName: undefined,
        /** currently active region overlay element */
        currentRegionOverlay: undefined,
        /** set to true if the above one correspond to an actual (and loaded) SVG */
        hasCurrentSVG: false,
        /** set to true if region delineation SVG includes labels */
        hasRegionLabels: false,
        /** SVG group for region labels */
        labelsg: undefined,

        /** set to true if current slice region delineation SVG includes miscellanous ROI such as volume of injection */
        hasROIs: false,

        /** 2D context of canvas used to draw measuring tape */
        ctx: null,

        /** set to true when user directly click region delineation on overlay (vs selecting it from region treeview) */
        userClickedRegion: false,

        disableAutoPanZoom: true,

        /** region info indexed by SVG path id for the current slice (retrieved from SVG) */
        currentSliceRegions: new Map(),

        /** info for measuring line feature  */
        position: [
          {
            x: 0,
            y: 0, // last recorded position of mouse pointer in screen coordinates
            c: 0, // number of recorded points
          },
          { x: 0, y: 0 }, // image space coordinates of recorded point #1
          { x: 0, y: 0 }, // image space coordinates of recorded point #2
        ],

        /** couple of recorded pointer positions in physical space coordinates (used by measuring line feature) */
        markedPos: undefined,
        markedPosColors: ['#ff7', '#ff61b3'],

        /** up-to-date 3D position in physical space coordinates (for live display of position) */
        livePosition: undefined,

        /** pointer position when click started (used to prevent position marking when Dragging occurs) */
        pointerdownpos: { x: 0, y: 0 },

        /** layers display values */
        layerDisplaySettings: initLayerDisplaySettings,

        /** set to true when all tiles are loaded for the current view */
        isAllLoaded: false,

        /** open UI with right panel expanded */
        initExpanded: false,

        /** visibility of region areas & delineations  */
        showRegions: ViewerManager.config.showRegions ?? true,
        displayAreas: ViewerManager.config.displayAreas ?? true,
        displayBorders: ViewerManager.config.displayBorders ?? true,
        displayLabels: ViewerManager.config.displayLabels ?? true,
        displayROIs: ViewerManager.config.displayROIs ?? true,
        useCustomBorders: ViewerManager.config.useCustomBorders ?? false,
        customBorderColor: ViewerManager.config.customBorderColor ?? '#000000',
        customBorderWidth: ViewerManager.config.customBorderWidth ?? 2,
        initRegionsOpacity: 0.4,
        regionsOpacity: UserSettings.getNumItem(UserSettings.SettingsKeys.OpacityAtlasRegionArea, 0.4) ?? 0.4,

        /** info about region currently hovered by mouse cursor */
        hoveredRegion: null,
        hoveredRegionSide: null,

        /** info about ROI currently hovered by mouse cursor */
        hoveredROI: null,
        hoveredROILabel: null,

        /** one of the layers is a raster labelMap  */
        hasLabelMap: false,

        /** path id of the last selected region */
        lastSelectedPath: null,

        /** (reusable) mouse event listeners for region contained in the current slice */
        regionEventListeners: {},
        regionTrackedElements: [],

        /** currently displayed plane */
        activePlane: ViewerManager.navigationState.activePlane,

        /** currently displayed slice on active plane */
        chosenSlice: 0,
        activatedPlanes: new Set([ViewerManager.navigationState.activePlane]),

        /** currently selected slice for each plane */
        axialChosenSlice: ViewerManager.navigationState.chosenSlices[ZAVConfig.AXIAL],
        coronalChosenSlice: ViewerManager.navigationState.chosenSlices[ZAVConfig.CORONAL],
        sagittalChosenSlice: ViewerManager.navigationState.chosenSlices[ZAVConfig.SAGITTAL],

        /** set to true when measuring tool is activated  */
        measureModeOn: false,

        /** set to true when clip selection tool is activated  */
        clippingModeOn: false,

        /** [topleft.x, topleft.y, width, height] in pixels */
        clippedRegion: undefined,
        /** top-left corner of the previous respecting selected processor size constraint  */
        constrainedClippedRegion: undefined,

        /** index of currently selected custom processor */
        selectedprocIndex: undefined,

        /** image resulting of last processing */
        processedImage: undefined,
        /** zoom factor at which the processing has been preformed  */
        processedZoom: undefined,
        /** clip definition used for last processing */
        processedRegion: undefined,
        /** processed image clip top-left pixel coords in the full size image */
        processedTopleftPx: undefined,

        /** set to true while processing is being computed */
        processingActive: undefined,
        /** message to display as model */
        longRunningMessage: undefined,

        /** previous values of gesture to zoom factors stored while zoon is locked */
        prevZoomPerScroll: undefined,
        prevZoomPerClick: undefined,

        /** set to true when region editing mode is enabled */
        editModeOn: false,
        /** set to true when a region is being edited */
        editingActive: false,
        /** current editing tool */
        editingTool: 'pen',
        /** current editing tool radius */
        editingToolRadius: 60,

        /** original ID of the region path being edited */
        editOrigPathId: undefined,
        /** current ID of the region path being edited */
        editPathId: undefined,

        /** source path element to be edited (in the region overlay) */
        editRegion: undefined,
        /** root SVG element containing region being edited */
        editSVG: undefined,
        /** color of the edited path */
        editPathFillColor: undefined,
        editPathStrokeColor: undefined,
        /** path element representing the region being edited */
        editLivePath: undefined,
        /** last recorder position of cursor during region editing*/
        editPos: undefined,
      },
      //handler to intercept Set operations and store it as user settings as required
      {
        set: (target: ViewerStatus, property: string | symbol, value: unknown) => {
          if ('displayAreas' === property && typeof value === 'boolean') {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.ShowAtlasRegionArea, value);
            return true;
          } else if ('displayBorders' === property && typeof value === 'boolean') {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.ShowAtlasRegionBorder, value);
            return true;
          } else if ('displayLabels' === property && typeof value === 'boolean') {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.ShowAtlasRegionLabel, value);
            return true;
          } else if ('displayROIs' === property && typeof value === 'boolean') {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.ShowOverlayROI, value);
            return true;
          } else if ('useCustomBorders' === property && typeof value === 'boolean') {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.UseCustomRegionBorder, value);
            return true;
          } else if ('customBorderColor' === property && typeof value === 'string') {
            target[property] = value;
            UserSettings.setStrItem(UserSettings.SettingsKeys.CustomRegionBorderColor, value);
            return true;
          } else if ('customBorderWidth' === property && typeof value === 'number') {
            target[property] = value;
            UserSettings.setNumItem(UserSettings.SettingsKeys.CustomRegionBorderWidth, value);
            return true;
          } else if ('regionsOpacity' === property && typeof value === 'number') {
            target[property] = value;
            UserSettings.setNumItem(UserSettings.SettingsKeys.OpacityAtlasRegionArea, value);
            return true;
          } else {
            return Reflect.set(target, property, value);
          }
        },
      },
    );
    ViewerManager.syncNavigationStateToStatus();

    ViewerManager.setupTileSources(overridingConf);
  }

  static setupTileSources(overridingConf: ViewerHistoryParams) {
    const layerEntries = Object.values(ViewerManager.config.layers as Record<string, LegacyLayerConfig>);
    const firstLayer = layerEntries.length > 0 ? layerEntries[0] : undefined;

    debugInfo('setupTileSources', {
      hasBackend: ViewerManager.config?.hasBackend,
      hasCOSource: ViewerManager.config?.hasCOSource,
      activePlane: ViewerManager.status?.activePlane,
      chosenSlice: ViewerManager.status?.chosenSlice,
      slideCounts: {
        axial: ViewerManager.config?.axialSlideCount,
        coronal: ViewerManager.config?.coronalSlideCount,
        sagittal: ViewerManager.config?.sagittalSlideCount,
      },
      firstLayer: firstLayer
        ? {
            key: firstLayer.key,
            ext: firstLayer.ext,
            protocol: firstLayer.protocol,
          }
        : null,
    });

    if (!firstLayer) {
      debugError('setupTileSources aborted: no first layer found', {
        layers: ViewerManager.config?.layers,
        data: ViewerManager.config?.data,
      });
      return;
    }
    const firstLayerKey = String(firstLayer.key ?? '');
    const firstLayerExt = String(firstLayer.ext ?? '');

    if (ViewerManager.config.hasBackend) {
      if (ViewerManager.config.data) {
        const backendPageCount = ViewerManager.config.getTotalSlidesCount();
        if (firstLayer.protocol === 'IIP') {
          //Internet Imaging Protocol (IIP)

          const that = ViewerManager;
          const iiifInfoUrl = ViewerManager.getIIIFTileSourceUrl(
            ViewerManager.getPageNumForCurrentSlice() ?? 0,
            firstLayerKey,
            firstLayerExt,
          );
          debugInfo('Fetching IIP pyramidal info', {
            url: iiifInfoUrl,
          });

          //Prerequisite: All pages have same image size and tile composition, so pyramidal infos for first image is reused for all
          void getJson(iiifInfoUrl)
            .then((pyramidalImgInfo) => {
              const typedPyramidalImgInfo = pyramidalImgInfo as IIIFPyramidalImageInfo;
              const tileSources: unknown[] = [];

              that.status.IIPSVR_PATH = (that.config.IIPSERVER_PATH ?? '').replace('?IIIF=', '?FIF=');

              const tileDef = typedPyramidalImgInfo.tiles[0];

              const minLevel = 0;
              const maxLevel = tileDef.scaleFactors.length - 1;
              const iipTileInfos: {
                minLevel: number;
                maxLevel: number;
                levelScale: NumericLookup;
                tileWidth: number;
                tileHeight: number;
                imageWidth: number;
                imgeHeight: number;
                xTilesNumAtMaxLevel: number;
                yTilesNumAtMaxLevel: number;
                xTilesNumAtLevel: NumericLookup;
              } = {
                minLevel: minLevel,
                maxLevel: maxLevel,
                levelScale: {},
                tileWidth: tileDef.width,
                tileHeight: tileDef.height,

                imageWidth: typedPyramidalImgInfo.width,
                imgeHeight: typedPyramidalImgInfo.height,

                //number of tiles along both axis
                xTilesNumAtMaxLevel: Math.ceil(typedPyramidalImgInfo.width / tileDef.width),
                yTilesNumAtMaxLevel: Math.ceil(typedPyramidalImgInfo.height / tileDef.height),

                //number of tiles on X axis at each scale level
                xTilesNumAtLevel: {} as Record<number, number>,
              };

              //at maxLevel, image is at full scale
              tileDef.scaleFactors.forEach((scaleFact: number, level: number, factors: number[]) => {
                iipTileInfos.levelScale[level] = scaleFact / factors[maxLevel];
              });

              for (let level = minLevel; level <= maxLevel; level++) {
                iipTileInfos.xTilesNumAtLevel[level] = Math.ceil(
                  iipTileInfos.xTilesNumAtMaxLevel * iipTileInfos.levelScale[level],
                );
              }

              that.status.iipTileInfos = iipTileInfos;

              //tile source for 1rst layer of each slices
              for (let j = 0; j < backendPageCount; j++) {
                tileSources.push(that.getTileSourceDef(firstLayerKey, firstLayerExt));
              }
              that.status.tileSources = tileSources;

              debugInfo('IIP tileSources prepared', {
                count: tileSources.length,
                sample: tileSources[0],
              });

              that.init2ndStage(overridingConf);
            })
            .catch((error) => {
              debugError('Failed to fetch IIP pyramidal info', {
                url: iiifInfoUrl,
                error,
              });
            });
        } else {
          //International Image Interoperability Framework (IIIF) protocol (default)

          const tileSources: unknown[] = [];
          if (ViewerManager.config.data) {
            for (let j = 0; j < backendPageCount; j++) {
              tileSources.push(ViewerManager.getIIIFTileSourceUrl(j, firstLayerKey, firstLayerExt));
            }
            ViewerManager.status.tileSources = tileSources;

            debugInfo('IIIF tileSources prepared', {
              count: tileSources.length,
              firstUrl: tileSources[0],
              lastUrl: tileSources[tileSources.length - 1],
            });

            ViewerManager.init2ndStage(overridingConf);
          }
        }
      }
    } else {
      //no backend image server

      //in case of multiplanes, first layer tiles source for all defined planes are appended in tileSources array
      const tileSources: unknown[] = [];
      if (ViewerManager.config.data) {
        if (ViewerManager.config.hasAxialPlane) {
          for (let j = 0; j < ViewerManager.config.axialSlideCount; j++) {
            tileSources.push(
              ViewerManager.getFileTileSourceUrl(
                j,
                firstLayerKey,
                firstLayerExt,
                ViewerManager.config.hasMultiPlanes ? ZAVConfig.AXIAL : null,
              ),
            );
          }
        }
        if (ViewerManager.config.hasCoronalPlane) {
          for (let j = 0; j < ViewerManager.config.coronalSlideCount; j++) {
            tileSources.push(
              ViewerManager.getFileTileSourceUrl(
                j,
                firstLayerKey,
                firstLayerExt,
                ViewerManager.config.hasMultiPlanes ? ZAVConfig.CORONAL : null,
              ),
            );
          }
        }
        if (ViewerManager.config.hasSagittalPlane) {
          for (let j = 0; j < ViewerManager.config.sagittalSlideCount; j++) {
            tileSources.push(
              ViewerManager.getFileTileSourceUrl(
                j,
                firstLayerKey,
                firstLayerExt,
                ViewerManager.config.hasMultiPlanes ? ZAVConfig.SAGITTAL : null,
              ),
            );
          }
        }

        ViewerManager.status.tileSources = tileSources;

        debugInfo('Local DZI tileSources prepared', {
          count: tileSources.length,
          firstUrl: tileSources[0],
        });

        //prerequisite: all page have same image size and tile composition, so pyramidal infos for first image is reused for all
        const that = ViewerManager;
        const firstTileSourceUrl = typeof tileSources[0] === 'string' ? tileSources[0] : undefined;
        if (!firstTileSourceUrl) {
          return;
        }
        void getXmlDocument(firstTileSourceUrl)
          .then((dziInfo) => {
            const imageNodes = dziInfo.getElementsByTagNameNS('http://schemas.microsoft.com/deepzoom/2008', 'Image');
            if (imageNodes.length) {
              const imageNode = imageNodes.item(0);
              const titleSizeAttr = imageNode?.getAttributeNode('TileSize');
              if (titleSizeAttr) {
                that.status.tileSize = parseInt(titleSizeAttr.value, 10);
              }
              const overlapAttr = imageNode?.getAttributeNode('Overlap');
              if (overlapAttr) {
                that.status.tileOverlap = parseInt(overlapAttr.value, 10);
              }

              const formatAttr = imageNode?.getAttributeNode('Format');
              if (formatAttr) {
                that.status.tileFormat = formatAttr.value;
              }
              if (imageNode?.childElementCount) {
                const sizeNode = imageNode.childNodes.item(0) as Element | null;
                const widthAttr = sizeNode?.getAttributeNode('Width');
                if (widthAttr) {
                  that.status.imageWidth = parseInt(widthAttr.value, 10);
                }
                const heightAttr = sizeNode?.getAttributeNode('Height');
                if (heightAttr) {
                  that.status.imageHeight = parseInt(heightAttr.value, 10);
                }
              }
            }
            debugInfo('DZI metadata parsed', {
              tileSize: that.status.tileSize,
              tileOverlap: that.status.tileOverlap,
              tileFormat: that.status.tileFormat,
              imageWidth: that.status.imageWidth,
              imageHeight: that.status.imageHeight,
            });
            that.init2ndStage(overridingConf);
          })
          .catch((error) => {
            debugError('Failed to load DZI metadata', {
              url: tileSources[0],
              error,
            });
          });
      }
    }
  }

  static init2ndStage(overridingConf: ViewerHistoryParams) {
    const that = ViewerManager;
    const { initialPlane, initialSlice } = getInitialPlaneAndSlice(ViewerManager.config, overridingConf);
    ViewerManager.config.setPlaneSizes(initialPlane);
    const initialPage = ViewerManager.getPageNumForPlaneSlice(initialPlane, initialSlice);

    debugInfo('init2ndStage', {
      viewerId: VIEWER_ID,
      initialPage: initialPage,
      initialPlane,
      initialSlice,
      tileSourceCount: ViewerManager.status?.tileSources?.length,
      firstTileSource: ViewerManager.status?.tileSources?.[0],
      navigatorId: NAVIGATOR_ID,
      overridingConf,
    });

    ViewerManager.viewer = OpenSeadragon(
      createViewerOptions({
        viewerId: VIEWER_ID,
        navigatorId: NAVIGATOR_ID,
        tileSources: ViewerManager.status.tileSources,
        initialPage,
        hasCOSource: ViewerManager.config.hasCOSource,
      }),
    );

    debugInfo('OpenSeadragon viewer created', {
      elementFound: Boolean(document.getElementById(VIEWER_ID)),
      crossOriginPolicy: ViewerManager.config.hasCOSource ? 'Anonymous' : undefined,
    });

    ViewerManager.setZoomEnabled(false);
    ViewerManager.bindNavigatorWheelZoom();

    //Initialize labelMap handler
    ViewerManager.status.hasLabelMap = LabelMapper.initLabelMapper(
      ViewerManager.viewer,
      ViewerManager.status.layerDisplaySettings,
      ViewerManager.config.color2labelMap as Parameters<typeof LabelMapper.initLabelMapper>[2],
      (_color, classLabel) => {
        ViewerManager.status.hoveredRegion = classLabel !== 'Background' ? classLabel : null;
        ViewerManager.signalStatusChanged(ViewerManager.status);
      },
    );

    ViewerManager.refreshScalebar();

    bindViewerStartupEvents({
      viewer: ViewerManager.viewer,
      config: ViewerManager.config,
      status: ViewerManager.status,
      overridingConf,
      setupViewerOverlaysAndLayers: (dimensions) => ViewerManager.setupViewerOverlaysAndLayers(dimensions),
      bindViewerCanvasMousemoveHandler: () => ViewerManager.bindViewerCanvasMousemoveHandler(),
      applyInitialOpenState: (conf) => ViewerManager.applyInitialOpenState(conf as ViewerHistoryParams),
      getRegionsSVGUrl: () => that.getRegionsSVGUrl(),
      addSVGData: (svgPath, overlayElement) => that.addSVGData(svgPath, overlayElement),
    });

    bindViewerWorldItemHandlers({
      viewer: ViewerManager.viewer,
      status: ViewerManager.status,
      eventSource: that.eventSource,
      setAllFilters: () => that.setAllFilters(),
    });

    bindViewerRuntimeBindings({
      viewer: ViewerManager.viewer,
      eventSource: ViewerManager.eventSource,
      status: ViewerManager.status,
      hookViewerTrackerHandler: ViewerManager.hookViewerTrackerHandler.bind(ViewerManager),
      onViewerScroll: (event) => ViewerManager.onViewerScroll(event as unknown as ViewerEventLike),
      onViewerClick: (event) => ViewerManager.onViewerClick(event as unknown as ViewerEventLike),
      onViewerDrag: (event) => ViewerManager.onViewerDrag(event as unknown as ViewerEventLike),
      onViewerKey: (event) => ViewerManager.onViewerKey(event as unknown as ViewerEventLike),
      makeHistoryStep: () => that.makeHistoryStep(),
      adjustFiltersAfterZoom: (zoom) => that.adjustFiltersAfterZoom(zoom),
      getZoomFactor: () => ViewerManager.getZoomFactor(),
      refreshScalebar: () => ViewerManager.refreshScalebar(),
      resizeCanvas: () => that.resizeCanvas(),
      adjustResizeRegionsOverlay: (set) => that.adjustResizeRegionsOverlay(set),
      getRegionSet: () => that.status.set,
      setMeasureMode: (active) => ViewerManager.setMeasureMode(active),
      pointerupHandler: ViewerManager.pointerupHandler.bind(ViewerManager),
      pointerdownHandler: ViewerManager.pointerdownHandler.bind(ViewerManager),
      signalStatusChanged: (status) => ViewerManager.signalStatusChanged(status as ViewerStatus),
      onExternalRegionSelection: () => {
        RegionsManager.addListeners((_regionsStatus) => {
          if (RegionsManager.getLastActionSource() !== VIEWER_ACTIONSOURCEID) {
            ViewerManager.unselectRegions();
            ViewerManager.selectRegions(RegionsManager.getSelectedRegions());
          }
        });
      },
    });
  }
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //create SVG element where all editing related drawing is performed
  static createEditSVGElement() {
    if (ViewerManager.status.editModeOn) {
      const editOverlay = ViewerManager.getElementById<HTMLDivElement>('svgEditOverlay');
      const regionOverlay = ViewerManager.getCurrentRegionOverlay();
      const regionSVG = regionOverlay?.getElementsByTagName('svg')[0];
      if (!editOverlay || !regionSVG) {
        return;
      }

      const svg = document.createElementNS(SVGNS, 'svg');
      //same size a region delineation SVG
      svg.setAttribute('height', regionSVG.getAttribute('height') ?? '0');
      svg.setAttribute('width', regionSVG.getAttribute('width') ?? '0');
      svg.setAttribute('style', 'overflow: hidden; position: relative;');
      const svgNS = svg.namespaceURI;
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('id', 'svgEditGroup');
      svg.appendChild(g);
      editOverlay.appendChild(svg);
      ViewerManager.status.editSVG = svg;

      new OpenSeadragon.MouseTracker({
        element: ViewerManager.status.editSVG,

        dblClickHandler: (event) => {
          //double-clicking outside a region stop the current region being edited
          if (ViewerManager.status.editPathId) {
            ViewerManager.stopEditingRegion(event);
          }
        },
        moveHandler: (event) => {
          //incremental edit after each move while left button pressed
          if (event.buttons === 1) {
            ViewerManager.doEdit(event as unknown as ViewerEditEvent);
          }
        },
        pressHandler: (event) => {
          //start active editing when left button pressed
          if (event.buttons === 1) {
            ViewerManager.startEdit(event as unknown as ViewerEditEvent);
          }
        },
        releaseHandler: (event) => {
          //stop active editing when left button is released
          ViewerManager.suspendEdit(event as unknown as ViewerEditEvent);
        },
      });
    }
  }

  static createEditSVGBackground(srcBackNode: Element) {
    if (ViewerManager.status.editModeOn) {
      srcBackNode.setAttribute('id', 'editBackgroundPath');
      srcBackNode.setAttribute('class', 'editBackground');
      srcBackNode.setAttribute('fill-opacity', '0');
      ViewerManager.status.editBackgNode = srcBackNode.cloneNode();
      const editGroup = ViewerManager.getElementById<SVGGElement>('svgEditGroup');
      if (editGroup) {
        editGroup.appendChild(ViewerManager.status.editBackgNode);
      }

      paper.setup([10, 10]);
    }
  }

  static getEditCursorSVG(tool: string) {
    const zoom = ViewerManager.viewer.world
      .getItemAt(0)
      .viewportToImageZoom(ViewerManager.viewer.viewport.getZoom(true));
    return buildEditCursorSVG({
      brushRadius: ViewerManager.status.editingToolRadius ?? 0,
      fillColor: ViewerManager.status.editPathFillColor ?? '#000000',
      tool,
      imageZoom: zoom,
      svgNs: SVGNS,
    });
  }

  //set up specific mouse cursor for edit
  static updateEditCursor() {
    if (ViewerManager.status.editPathId && ViewerManager.status.editSVG) {
      const inlinedCursor = ViewerManager.getEditCursorSVG(ViewerManager.status.editingTool ?? 'pen');
      ViewerManager.status.editSVG.style.cursor = inlinedCursor;
    }
  }

  static removeEditCursor() {
    if (ViewerManager.status.editSVG) {
      ViewerManager.status.editSVG.style.cursor = 'default';
    }
  }

  static getSVGPos(x: number, y: number) {
    const zoom = ViewerManager.viewer.world
      .getItemAt(0)
      .viewportToImageZoom(ViewerManager.viewer.viewport.getZoom(true));
    return getSvgEditPosition(x, y, zoom);
  }

  static startEditRegionPath(pathId: string) {
    ViewerManager.stopEditingRegion();
    const regionInDom = document.getElementById(pathId);
    if (regionInDom) {
      ViewerManager.selectEditRegion(regionInDom);
    }
  }

  static selectEditRegion(targetElt: Element) {
    //
    if (targetElt.id && !targetElt.id.startsWith(BACKGROUND_PATHID)) {
      ViewerManager.status.editOrigPathId = ViewerManager.status.editPathId = targetElt.id;
      ViewerManager.status.editRegion = targetElt;
      ViewerManager.status.editPathFillColor = targetElt.getAttribute('fill');
      ViewerManager.status.editPathStrokeColor = targetElt.getAttribute('stroke');

      const editGroup = ViewerManager.status.editSVG?.getElementById('svgEditGroup');
      if (!editGroup) {
        return;
      }
      //copy region svg as a base for edit
      const newLivPath = targetElt.cloneNode() as SVGElement;
      newLivPath.id = 'beingEditedRegion';

      //insert in DOM
      editGroup.appendChild(newLivPath);
      newLivPath.setAttribute('stroke', invertCssColor(ViewerManager.status.editPathFillColor ?? '#000000'));
      newLivPath.removeAttribute('style');
      newLivPath.setAttribute('fill-opacity', '0.35');
      newLivPath.setAttribute('stroke-opacity', '0.2');
      newLivPath.setAttribute('stroke-width', '20');
      newLivPath.setAttribute('vector-effect', 'non-scaling-stroke');

      ViewerManager.status.editLivePath = newLivPath;
      //import as Paper object for edit transformations
      ViewerManager.status.editRegionPath = paper.project.importSVG(newLivPath, {
        insert: false,
      }) as unknown as EditableRegionPath;

      //hide source region while its copy is being edited
      (targetElt as HTMLElement).style.display = 'none';

      //place the editing overlay on top of region overlay while editing is being done
      const editOverlay = ViewerManager.getElementById<HTMLDivElement>('svgEditOverlay');
      if (editOverlay) {
        editOverlay.style.zIndex = '1';
      }

      ViewerManager.updateEditCursor();

      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static startEdit(e: ViewerEditEvent) {
    ViewerManager.status.editingActive = true;
    ViewerManager.status.editPos = ViewerManager.status.lastPos;
    ViewerManager.doEdit(e, true);
  }

  static changeEditedRegionName(newRegionId: string) {
    const oldPathId = ViewerManager.status.editPathId;
    if (!oldPathId) {
      return;
    }
    const newPathId = renameEditedRegion({
      currentSliceRegions: ViewerManager.status.currentSliceRegions,
      oldPathId,
      newRegionId,
      splitRegionId: (regionId) => ViewerManager._splitRegionId(regionId),
    });
    if (!newPathId) {
      return;
    }
    ViewerManager.status.editPathId = newPathId;

    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static changeEditedRegionFill(newFill: string) {
    const editPathId = ViewerManager.status.editPathId;
    if (!editPathId) {
      return;
    }
    const regionInfo = ViewerManager.status.currentSliceRegions.get(editPathId);
    if (!regionInfo || !ViewerManager.status.editLivePath) {
      return;
    }
    regionInfo.fill = newFill;
    ViewerManager.status.editPathFillColor = newFill;
    ViewerManager.status.editLivePath.setAttribute('fill', newFill);
    ViewerManager.status.editLivePath.setAttribute('stroke', invertCssColor(newFill));

    //stop/start edit to save change
    ViewerManager.startEditRegionPath(editPathId);

    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static suspendEdit(_e: ViewerEditEvent) {
    ViewerManager.status.editingActive = false;
  }

  static doEdit(e: ViewerEditEvent, forcedEdit = false) {
    if (ViewerManager.status.editingActive) {
      const prevPos = ViewerManager.status.editPos;
      //const newPos = this.getSVGPos(e.layerX, e.layerY);
      const newPos = ViewerManager.getSVGPos(e.position.x, e.position.y);
      ViewerManager.status.editPos = newPos;
      if (forcedEdit || (prevPos && (Math.abs(prevPos.x - newPos.x) > 1 || Math.abs(prevPos.y - newPos.y) > 1))) {
        const editRegionPath = ViewerManager.status.editRegionPath;
        if (!editRegionPath) {
          return;
        }
        const outlined = new paper.Path.Circle(
          new paper.Point(newPos.x, newPos.y),
          ViewerManager.status.editingToolRadius ?? 0,
        );

        const united =
          ViewerManager.status.editingTool === 'eraser'
            ? editRegionPath.subtract(outlined, { insert: false })
            : editRegionPath.unite(outlined, { insert: false });

        const newLivPath = united.exportSVG() as SVGElement;
        ViewerManager.status.editRegionPath = united;

        ViewerManager.status.editLivePath?.replaceWith(newLivPath);
        ViewerManager.status.editLivePath = newLivPath;
      }
    } else {
      //store first position of editing segment
      ViewerManager.status.lastPos = ViewerManager.getSVGPos(e.position.x, e.position.y);
    }
  }

  static stopEditingRegion(_event?: unknown) {
    ViewerManager.status.editingActive = false;
    if (ViewerManager.status.editPathId) {
      if (
        !ViewerManager.status.editRegion ||
        !ViewerManager.status.editRegionPath ||
        !ViewerManager.status.editLivePath
      ) {
        return;
      }
      //restore region overlay above edition
      const editOverlay = ViewerManager.getElementById<HTMLDivElement>('svgEditOverlay');
      if (editOverlay) {
        editOverlay.style.zIndex = '0';
      }

      ViewerManager.removeEditCursor();
      const newPathId = ViewerManager.status.editPathId;
      ViewerManager.status.editPathId = null;
      const regionSet = ViewerManager.status.set;
      const regionPaper = ViewerManager.status.paper;
      if (!regionSet || !regionPaper) {
        return;
      }

      //replace exisiting region by edited one

      //remove un-edited source region from Raphaël set
      regionSet.exclude(ViewerManager.status.editRegion);
      const regionId = ViewerManager.status.editRegion.getAttribute('bma:regionId');

      const origPathId = ViewerManager.status.editRegion.id;

      //remove from DOM
      ViewerManager.status.editRegion.remove();

      //import edited region in Raphaël
      const modifiedRegion = ViewerManager.status.editRegionPath.exportSVG() as SVGElement;
      modifiedRegion.setAttribute('id', newPathId);

      //FIXME region order is not conserved, Raphaël will place the newly imported region at the end
      const newRaphElt = regionPaper.importSVG(modifiedRegion);
      newRaphElt.attr('fill', ViewerManager.status.editPathFillColor ?? '#000000');
      newRaphElt.attr('stroke', ViewerManager.status.editPathStrokeColor ?? '#000000');
      regionSet.push(newRaphElt);

      //once modified path is added to DOM, restore lost attributes
      const modifiedRegionInDom = ViewerManager.getElementById<SVGElement>(newPathId);
      if (!modifiedRegionInDom) {
        return;
      }
      //restore non-scaling strocke attribute
      modifiedRegionInDom.setAttribute('vector-effect', 'non-scaling-stroke');

      //in case region id was modified
      const regionInfo = ViewerManager.status.currentSliceRegions.get(newPathId);
      const newRegionId = regionInfo?.regionId ? regionInfo.regionId : regionId;

      //restore region Id
      if (newRegionId) {
        modifiedRegionInDom.setAttribute('bma:regionId', newRegionId);
      }

      if (newRegionId === regionId) {
        //reuse region event listener
        ViewerManager.connectRegionListeners(newRaphElt, ViewerManager.status.regionEventListeners[origPathId]);
      } else {
        //change listener since id has been modified
        delete ViewerManager.status.regionEventListeners[origPathId];
        ViewerManager._addNActivateRegion(newPathId, newRegionId ?? regionId ?? newPathId, newRaphElt);
      }

      ViewerManager.applyUnselectedPresentation(newRaphElt);

      ViewerManager.status.editLivePath.remove();

      ViewerManager.status.editLivePath = null;
      ViewerManager.status.editPos = null;
      ViewerManager.status.editRegion = null;

      //call WS to remotely save
      ViewerManager.updateSVGRegion(modifiedRegionInDom, ViewerManager.status.editOrigPathId ?? undefined);
      ViewerManager.status.editOrigPathId = null;

      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static createOrUpdateSVGRegion(regionInDom: Element, create: boolean, origPathId?: string) {
    const pathId = regionInDom.getAttribute('id');
    const url = ViewerManager.getRegionsSVGEditUrl({ region: pathId ?? undefined });
    void saveSvgRegion({ url, regionInDom, create, origPathId });
  }

  static updateSVGRegion(regionInDom: Element, origPathId?: string) {
    ViewerManager.createOrUpdateSVGRegion(regionInDom, false, origPathId);
  }

  static createSVGRegion(regionInDom: Element) {
    ViewerManager.createOrUpdateSVGRegion(regionInDom, true);
  }

  static createPathForRegion(regionId: string, fill: string, stroke: string) {
    const currentSliceRegions = ViewerManager.getCurrentSliceRegions();
    if (!currentSliceRegions) {
      return;
    }
    const maxPathIndex = Array.from(currentSliceRegions.keys()).reduce((_maxIndex, pathId) => {
      const sepPos = pathId.lastIndexOf('-');
      return Math.max(0, sepPos > 0 ? parseInt(pathId.substr(sepPos + 1), 10) : -1);
    }, 0);
    const pathId = `${regionId}-${maxPathIndex + 1}`;
    const newPath = document.createElementNS(SVGNS, 'path');
    newPath.id = pathId;
    newPath.setAttribute('fill', fill);
    newPath.setAttribute('stroke', stroke);

    //import in Raphael
    const regionPaper = ViewerManager.status.paper;
    const regionSet = ViewerManager.status.set;
    if (!regionPaper || !regionSet) {
      return;
    }
    const newRaphElt = regionPaper.importSVG(newPath);
    regionSet.push(newRaphElt);
    //locate DOM element created by Raphael
    const regionInDom = ViewerManager.getElementById<SVGElement>(pathId);
    if (!regionInDom) {
      return;
    }

    //restore attributes stripped by Raphael import
    regionInDom.setAttribute('vector-effect', 'non-scaling-stroke');
    regionInDom.setAttribute('bma:regionId', regionId);

    ViewerManager._addNActivateRegion(pathId, regionId, newRaphElt);

    //call WS to remotely save
    ViewerManager.createOrUpdateSVGRegion(regionInDom, true);

    //start editing the new region
    ViewerManager.selectEditRegion(regionInDom);

    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static createSVGForRegions() {
    const url = ViewerManager.getRegionsSVGEditUrl();
    void requestCreateSvgForRegions({
      url,
      width: ViewerManager.status.imageWidth,
      height: ViewerManager.status.imageHeight,
      onCreated: () => ViewerManager.shiftToSlice(0, true),
    });
  }

  static startEditingClickedRegion() {
    if (ViewerManager.status.lastSelectedPath) {
      ViewerManager.startEditRegionPath(ViewerManager.status.lastSelectedPath);
    } else {
      ViewerManager.status.acquiringRegionToEdit = true;
    }
  }

  static simplifyEditedRegion() {
    if (ViewerManager.status.editPathId && ViewerManager.status.editLivePath && ViewerManager.status.editRegionPath) {
      if (ViewerManager.status.editRegionPath.simplify()) {
        const newLivPath = ViewerManager.status.editRegionPath.exportSVG() as SVGElement;

        ViewerManager.status.editLivePath.replaceWith(newLivPath);
        ViewerManager.status.editLivePath = newLivPath;
      }
    }
  }

  static extendRegionListenerForEdit(listener: ViewerRegionListener) {
    return extendViewerRegionListenerForEdit(listener, {
      isEditingRegion: () => Boolean(ViewerManager.status.editPathId),
      stopEditingRegion: (event) => ViewerManager.stopEditingRegion(event),
      selectEditRegion: (target) => ViewerManager.selectEditRegion(target),
      isAcquiringRegionToEdit: () => Boolean(ViewerManager.status.acquiringRegionToEdit),
      setAcquiringRegionToEdit: (active) => {
        ViewerManager.status.acquiringRegionToEdit = active;
      },
    });
  }

  static connectRegionListeners(targetElt: unknown, regionListener: ViewerRegionListener, pathElt?: unknown) {
    connectViewerRegionListeners({
      targetElt,
      regionListener,
      pathElt,
      regionTrackedElements: ViewerManager.status.regionTrackedElements,
    });
  }

  static changeEditingTool(newTool: string) {
    ViewerManager.status.editingTool = newTool;
    ViewerManager.updateEditCursor();
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static changeEditingRadius(newradius: number) {
    ViewerManager.status.editingToolRadius = newradius;
    ViewerManager.updateEditCursor();
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  static setSelectedAtlasIndex(atlasIndex: number) {
    if (ViewerManager.config.currentAtlas !== atlasIndex) {
      ViewerManager.config.setSelectedAtlas(atlasIndex);
      ViewerManager.signalStatusChanged(ViewerManager.status);
      ViewerManager.goToSlice(ViewerManager.getCurrentPlaneChosenSlice(), undefined, true);
    }
  }

  /** Add region delineations to specified overlay
   *
   *  @param {string} svgName - url to the SVG containing regions
   *  @param {element} overlayElement - overlay element where to load the regions
   *  @private
   *
   */
  static addSVGData(svgName: string, overlayElement: HTMLElement) {
    const createRaphaelPaper = Raphael as unknown as (element: HTMLElement) => RaphaelPaperLike;
    const paper = createRaphaelPaper(overlayElement);
    ViewerManager.status.paper = paper;
    ViewerManager.status.set = paper.set();
    //clear the set if necessary
    ViewerManager.status.set.remove();

    ViewerManager.status.currentSVGName = svgName;

    //Create SVG element dedicated to edition
    ViewerManager.createEditSVGElement();

    const that = ViewerManager;
    startSvgOverlayFlow({
      svgName,
      overlayElement,
      svgNs: SVGNS,
      backgroundPathId: BACKGROUND_PATHID,
      getPaper: () => that.status.paper ?? null,
      getRegionSet: () => that.status.set ?? null,
      isRequestCurrent: () =>
        svgName === that.status.currentSVGName &&
        overlayElement === that.status.currentRegionOverlay &&
        overlayElement.isConnected,
      clearCurrentSliceRegions: () => that.status.currentSliceRegions.clear(),
      clearRegionMouseTrackers: () => that.clearRegionMouseTrackers(),
      setRegionEventListeners: (listeners) => {
        that.status.regionEventListeners = listeners as Record<string, ViewerRegionListener>;
      },
      setCurrentRoiGroup: (group) => {
        that.status.roig = group;
      },
      setCurrentLabelGroup: (group) => {
        that.status.labelsg = group;
      },
      setHasCurrentSvg: (hasSvg) => {
        that.status.hasCurrentSVG = hasSvg;
      },
      setHasROIs: (hasROIs) => {
        that.status.hasROIs = hasROIs;
      },
      setHasRegionLabels: (hasRegionLabels) => {
        that.status.hasRegionLabels = hasRegionLabels;
      },
      setHoveredROI: (roiId, roiLabel) => {
        that.status.hoveredROI = roiId;
        that.status.hoveredROILabel = roiLabel;
        that.signalStatusChanged(that.status);
      },
      isShowingRegions: () => that.status.showRegions,
      getPendingInitialAtlasFit: () => that.pendingInitialAtlasFit,
      markInitialAtlasFitApplied: () => {
        that.pendingInitialAtlasFit = false;
      },
      getViewer: () => that.viewer,
      getDzDiff: () => ViewerManager.config.dzDiff,
      getRightPanelWidth: () => ViewerManager.getRightPanelWidth(),
      ensureRoiInfosLoaded: async () => {
        await ViewerManager.ensureRoiInfosLoaded();
      },
      connectRegionListeners: (targetElt, regionListener, pathElt) =>
        that.connectRegionListeners(targetElt, regionListener as ViewerRegionListener, pathElt),
      addAndActivateRegion: (pathId, regionId, newPathElt) =>
        that._addNActivateRegion(pathId, regionId, newPathElt as unknown as RaphaelElementLike),
      applyUnselectedPresentation: (element) => that.applyUnselectedPresentation(element),
      createEditSVGBackground: (srcBackNode) => that.createEditSVGBackground(srcBackNode),
      unselectAllFromBackground: () => {
        that.unselectRegions();
        that.regionActionner.unSelectAll();
        that.status.lastSelectedPath = null;
      },
      applyROIPresentation: () => that.applyROIPresentation(),
      applyLabelPresentation: () => that.applyLabelPresentation(),
      adjustResizeRegionsOverlay: () => that.adjustResizeRegionsOverlay(that.status.set),
      selectRegions: (regions) => that.selectRegions(regions),
      hideDelineation: () => that.hideDelineation(),
      syncCurrentSliceRegionsToRegionTree: () => that.syncCurrentSliceRegionsToRegionTree(),
      trySyncInitialHistoryStep: () => that.trySyncInitialHistoryStep(),
      raiseRegionsCreated: () => that.eventSource.raiseEvent('zav-regions-created', { svgUrl: svgName }),
      signalStatusChanged: () => that.signalStatusChanged(that.status),
    });
  }

  static _splitRegionId(regionId: string) {
    return splitRegionId(regionId);
  }

  static _resolveTreeRegionId(regionInfo?: Pick<ViewerRegionInfo, 'abbrev' | 'regionId'> | null) {
    return resolveTreeRegionId(regionInfo);
  }

  static _applyViewerRegionSelection(regionId: string, pathId?: string | null, ctrlKey: boolean = false) {
    const selectedRegionId = RegionsManager.resolveRegionId(regionId);
    if (!selectedRegionId) {
      return;
    }

    if (!ViewerManager.status.showRegions) {
      return;
    }

    ViewerManager.unselectRegions();
    const wasSelected = RegionsManager.isSelected(selectedRegionId);

    if (ctrlKey) {
      if (wasSelected) {
        ViewerManager.regionActionner.unSelect(selectedRegionId, false);
      } else {
        ViewerManager.regionActionner.addToSelection(selectedRegionId, false);
      }
    } else {
      ViewerManager.regionActionner.replaceSelected(selectedRegionId, false);
    }

    const resolvedPathId =
      pathId ??
      Array.from(ViewerManager.status.currentSliceRegions.entries()).find(
        ([, info]) => ViewerManager._resolveTreeRegionId(info) === selectedRegionId,
      )?.[0] ??
      null;

    if (ctrlKey && wasSelected && ViewerManager.status.lastSelectedPath === resolvedPathId) {
      ViewerManager.status.lastSelectedPath = null;
    } else {
      ViewerManager.status.lastSelectedPath = resolvedPathId;
    }

    ViewerManager.status.userClickedRegion = true;
    ViewerManager.selectRegions(RegionsManager.getSelectedRegions());
  }

  static _getClickedRegionInfo(target: EventTarget | null) {
    return getClickedRegionInfo(target, ViewerManager.status.currentSliceRegions);
  }

  static _addNActivateRegion(pathId: string, regionId: string, newPathElt: RaphaelElementLike) {
    const that = ViewerManager;
    const { side, abbrev } = ViewerManager._splitRegionId(regionId);

    const pathElt = newPathElt.items?.[0];
    if (!pathElt) {
      return;
    }
    that.status.currentSliceRegions.set(pathId, {
      abbrev: abbrev,
      regionId: regionId,
      pathId: pathId,
      fill: pathElt.attr('fill'),
      stroke: pathElt.attr('stroke'),
    });

    //grouped listeners so they can be easily reused
    const regionListener = {
      abbrev: abbrev,
      regionId: regionId,
      side: side,

      mouseover: (_e: ViewerEventLike, raphElt: unknown) => {
        //highlight border and display info about hovered region
        if (raphElt && that.status.showRegions) {
          that.applyMouseOverPresentation(raphElt);
        }
        that.status.hoveredRegion = ViewerManager._resolveTreeRegionId({ abbrev, regionId }) ?? abbrev;
        that.status.hoveredRegionSide = side;
        that.status.hoveredRegionPath = pathId;
        that.signalStatusChanged(that.status);
      },

      mouseout: (_e: ViewerEventLike, raphElt: unknown) => {
        //remove highlighted border and info when cursor move out of region
        if (raphElt && that.status.showRegions) {
          that.applyMouseOutPresentation(
            raphElt,
            RegionsManager.isSelected(ViewerManager._resolveTreeRegionId({ abbrev, regionId })),
          );
        }
        that.status.hoveredRegion = null;
        that.status.hoveredRegionSide = null;
        that.status.hoveredRegionPath = null;
        that.signalStatusChanged(that.status);
      },

      click: (e: ViewerEventLike, raphElt: unknown) => {
        if (raphElt && e.shiftKey && !that.status.showRegions) {
          that.applyMouseOverPresentation(raphElt, true);
          setTimeout(() => that.applyMouseOutPresentation(raphElt), 2500);
        } else {
          ViewerManager._applyViewerRegionSelection(regionId, pathId, Boolean(e.ctrlKey));
        }
      },
    };

    that.status.regionEventListeners[pathId] = regionListener;

    //Add event listener related to edit mode
    if (that.status.editModeOn) {
      that.status.regionEventListeners[pathId] = that.extendRegionListenerForEdit(regionListener);
    }
  }

  /**
   * @private
   */
  static adjustResizeRegionsOverlay(_el: unknown) {
    if (ViewerManager.viewer.world.getItemCount()) {
      const zoom = ViewerManager.viewer.world
        .getItemAt(0)
        .viewportToImageZoom(ViewerManager.viewer.viewport.getZoom(true));
      //offset based on (8000-5420)/2
      //original method (slow)
      // el.transform('s' + zoom + ',' + zoom + ',0,0t0,1290');
      //fast method
      //https://www.circuitlab.com/blog/2012/07/25/tuning-raphaeljs-for-high-performance-svg-interfaces/
      /*
            One caveat here is that the changes we applied only operate within the SVG module of Raphael. Since CircuitLab doesn't currently support Internet Explorer, this isn't a concern for us, however if you rely on Raphael for IE support you will also have to implement the setTransform() method appropriately in the VML module. Here is a link to the change set that shows the changes discussed in this post.*/
      //NOTE: we should set translate appropriately to the size of the SVG
      if (ViewerManager.status.paper) {
        ViewerManager.status.paper.setTransform(` scale(${zoom},${zoom}) translate(0,${ViewerManager.config.dzDiff})`);
      }

      ViewerManager.refreshCanvasContent();

      if (ViewerManager.status.editModeOn) {
        //scale edition overlay
        const editGroup = document.getElementById('svgEditGroup');
        if (editGroup) {
          editGroup.setAttribute('transform', ` scale(${zoom},${zoom}) translate(0,${ViewerManager.config.dzDiff})`);
          ViewerManager.updateEditCursor();
        } else {
          console.error('#svgEditGroup not found!');
        }
      }
    }
  }

  /**
   * @private
   */
  static updateRegionsVisibility() {
    if (ViewerManager.status.set) {
      if (!ViewerManager.status.showRegions) {
        ViewerManager.status.set.forEach((el) => {
          ViewerManager.applyHiddenPresentation(el);
        });
      } else {
        ViewerManager.status.set.forEach((el) => {
          if (el.id !== BACKGROUND_PATHID) {
            ViewerManager.applyUnselectedPresentation(el);
          }
        });
      }
    }
  }

  /**
   * Hide all region delineations
   * @private
   */
  static hideDelineation() {
    const regionSet = ViewerManager.status.set;
    if (!regionSet) {
      return;
    }
    regionSet.forEach((el) => {
      ViewerManager.applyHiddenPresentation(el);
    });
  }

  static updateRegionAreasPresentation() {
    if (ViewerManager.status.set) {
      const selectedRegions = RegionsManager.getSelectedRegions();
      const that = ViewerManager;
      ViewerManager.status.set.forEach((el) => {
        if (el.id && el.id !== BACKGROUND_PATHID) {
          const regionInfo = that.status.currentSliceRegions.get(el.id);
          const abbrev = regionInfo ? ViewerManager._resolveTreeRegionId(regionInfo) : null;
          if (abbrev && selectedRegions.includes(abbrev)) {
            that.applySelectedPresentation(el);
          } else {
            that.applyUnselectedPresentation(el);
          }
        }
      });
    }
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static changeRegionsOpacity(opacity: number) {
    ViewerManager.status.regionsOpacity = opacity;
    ViewerManager.updateRegionAreasPresentation();
  }

  static isShowingRegions() {
    return ViewerManager.status.showRegions;
  }

  static hideRegions() {
    ViewerManager.status.displayAreas = false;
    ViewerManager.status.displayBorders = false;
    ViewerManager.status.showRegions = false;
    ViewerManager.setLabelDisplay(false);
    ViewerManager.updateRegionsVisibility();
    ViewerManager.updateRegionAreasPresentation();
  }

  static toggleAreaDisplay() {
    ViewerManager.status.displayAreas = !ViewerManager.status.displayAreas;
    ViewerManager.status.showRegions = ViewerManager.status.displayBorders || ViewerManager.status.displayAreas;
    if (ViewerManager.status.showRegions) {
      ViewerManager.setMeasureMode(false);
    }
    ViewerManager.updateRegionsVisibility();
    ViewerManager.updateRegionAreasPresentation();
  }

  static setBorderDisplay(active: boolean) {
    ViewerManager.status.displayBorders = active;
    ViewerManager.status.showRegions = ViewerManager.status.displayBorders || ViewerManager.status.displayAreas;
    if (ViewerManager.status.showRegions) {
      ViewerManager.setMeasureMode(false);
    }
    ViewerManager.updateRegionsVisibility();
    ViewerManager.updateRegionAreasPresentation();
  }

  static toggleBorderDisplay() {
    ViewerManager.setBorderDisplay(!ViewerManager.status.displayBorders);
  }

  static toggleUseCustomBorders() {
    ViewerManager.status.useCustomBorders = !ViewerManager.status.useCustomBorders;
    ViewerManager.updateRegionsVisibility();
    ViewerManager.updateRegionAreasPresentation();
  }

  static changeCustomBorderColor(color: string) {
    ViewerManager.status.customBorderColor = color;
    ViewerManager.updateRegionsVisibility();
    ViewerManager.updateRegionAreasPresentation();
  }

  static changeCustomBorderWidth(width: number) {
    ViewerManager.status.customBorderWidth = width;
    ViewerManager.updateRegionsVisibility();
    ViewerManager.updateRegionAreasPresentation();
  }

  static setLabelDisplay(active: boolean) {
    ViewerManager.status.displayLabels = active;
    ViewerManager.applyLabelPresentation();
  }

  static toggleLabelDisplay() {
    ViewerManager.setLabelDisplay(!ViewerManager.status.displayLabels);
  }

  static applyLabelPresentation() {
    if (ViewerManager.status.labelsg) {
      ViewerManager.status.labelsg.style.opacity = ViewerManager.status.displayLabels ? '1' : '0';
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static setROIDisplay(active: boolean) {
    ViewerManager.status.displayROIs = active;
    ViewerManager.applyROIPresentation();
  }

  static toggleROIDisplay() {
    ViewerManager.setROIDisplay(!ViewerManager.status.displayROIs);
  }

  static applyROIPresentation() {
    if (ViewerManager.status.roig) {
      ViewerManager.status.roig.style.opacity = ViewerManager.status.displayROIs ? '1' : '0';
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static centerOnROI(roiId: string) {
    const el = document.querySelector<SVGGraphicsElement>(
      `div#svgDelineationOverlay g#rois path.zav-roi[zav-roi-id='${roiId}']`,
    );
    if (el) {
      const bbox = el.getBBox();
      const newX = (bbox.x - bbox.width / 2) / ViewerManager.config.dzWidth;
      const newY = (ViewerManager.config.dzDiff + bbox.y - bbox.height / 2) / ViewerManager.config.dzHeight;
      debugInfo('Centering on ROI', { x: newX, y: newY });
      const windowPoint = new OpenSeadragon.Point(newX, newY);
      ViewerManager.viewer.viewport.panTo(windowPoint);
      ViewerManager.viewer.viewport.zoomTo(1.1);
    }
  }

  static applyMouseOverPresentation(element: unknown, forcedBorder = false) {
    applyViewerMouseOverPresentation(element, ViewerManager.status, forcedBorder);
  }

  static applyMouseOutPresentation(element: unknown, isSelected?: boolean) {
    applyViewerMouseOutPresentation(element, isSelected, ViewerManager.status);
  }

  static applySelectedPresentation(element: unknown) {
    applyViewerSelectedPresentation(element, ViewerManager.status);
  }

  static applyUnselectedPresentation(element: unknown) {
    applyViewerUnselectedPresentation(element, ViewerManager.status);
  }

  static applyHiddenPresentation(element: unknown) {
    applyViewerHiddenPresentation(element);
  }

  /**
   * Reset all regions visual presentation to unselected state
   * @private
   */
  static unselectRegions() {
    if (ViewerManager.status.set) {
      const that = ViewerManager;
      ViewerManager.status.set.forEach((el) => {
        if (el.id !== BACKGROUND_PATHID) {
          that.applyUnselectedPresentation(el);
        }
      });
    }
  }

  /**
   * Set specified regions visual presentation to selected state
   * @private
   */
  static selectRegions(nameList: Array<string | null | undefined>) {
    if (ViewerManager.status.set) {
      const that = ViewerManager;

      // apply presentation for selected regions
      ViewerManager.status.set.forEach((el) => {
        if (!el.id) {
          return;
        }
        const regionInfo = that.status.currentSliceRegions.get(el.id);
        const abbrev = regionInfo ? ViewerManager._resolveTreeRegionId(regionInfo) : null;
        if (nameList.includes(abbrev)) {
          that.applySelectedPresentation(el);
        }
      });

      // perform pan & zoom
      if (!ViewerManager.status.disableAutoPanZoom && !ViewerManager.status.userClickedRegion) {
        ViewerManager.centerOnRegions(nameList);
      }
      ViewerManager.status.userClickedRegion = false;
    }
  }

  static centerOnRegions(nameList: Array<string | null | undefined>) {
    const regionSet = ViewerManager.status.set;
    if (!regionSet) {
      return;
    }
    const windowPoint = getRegionCenterPoint({
      regionSet,
      currentSliceRegions: ViewerManager.status.currentSliceRegions,
      nameList,
      dzWidth: ViewerManager.config.dzWidth,
      dzHeight: ViewerManager.config.dzHeight,
      dzDiff: ViewerManager.config.dzDiff,
    });
    if (windowPoint) {
      ViewerManager.viewer.viewport.panTo(windowPoint);
      ViewerManager.viewer.viewport.zoomTo(1.1);
    }
  }

  static centerOnSelectedRegions() {
    ViewerManager.centerOnRegions(RegionsManager.getSelectedRegions());
  }

  static getLastSelectedPath() {
    return ViewerManager.status ? ViewerManager.status.lastSelectedPath : null;
  }

  static setLastSelectedPath(pathId: string | null) {
    ViewerManager.status.lastSelectedPath = pathId;
  }

  static getCurrentSliceRegions() {
    return ViewerManager.status ? ViewerManager.status.currentSliceRegions : null;
  }

  private static getResolvedCurrentSliceTreeRegions() {
    return getResolvedCurrentSliceTreeRegions(ViewerManager.status.currentSliceRegions);
  }

  private static syncCurrentSliceRegionsToRegionTree(regions = ViewerManager.getResolvedCurrentSliceTreeRegions()) {
    ViewerManager.pendingCurrentSliceTreeRegions = regions;
    if (!RegionsManager.isReady()) {
      return;
    }
    ViewerManager.regionActionner.setCurrentSliceRegions(regions);
    ViewerManager.pendingCurrentSliceTreeRegions = undefined;
  }

  static notifyRegionsTreeReady() {
    if (!RegionsManager.isReady()) {
      return;
    }

    ViewerManager.syncCurrentSliceRegionsToRegionTree(
      ViewerManager.pendingCurrentSliceTreeRegions ?? ViewerManager.getResolvedCurrentSliceTreeRegions(),
    );

    if (ViewerManager.status?.hasCurrentSVG) {
      ViewerManager.selectRegions(RegionsManager.getSelectedRegions());
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  private static getLiveViewportState(): ViewerViewportState | null {
    if (!ViewerManager.viewer?.viewport) {
      return null;
    }

    const liveViewport: ViewerViewportState = {
      viewportZoom: ViewerManager.viewer.viewport.getZoom(true),
      imageZoom: ViewerManager.getCurrentImageZoom(),
      center: ViewerManager.getCurrentImageCenter(),
    };

    return liveViewport.center || typeof liveViewport.imageZoom !== 'undefined' ? liveViewport : null;
  }

  private static getViewportHistoryParamsForSync(preferredParams?: ViewerHistoryParams | null) {
    if (preferredParams?.center || typeof preferredParams?.imageZoom !== 'undefined') {
      return normalizeViewportState(preferredParams);
    }

    const liveViewportParams = ViewerManager.getLiveViewportState();
    if (liveViewportParams) {
      return liveViewportParams;
    }

    const locationParams = ViewerManager.getParamsFromCurrLocation();
    if (locationParams.center || typeof locationParams.imageZoom !== 'undefined') {
      return normalizeViewportState(locationParams);
    }

    return null;
  }

  private static applyViewportHistoryParams(viewportParams?: ViewerViewportState | null) {
    if (typeof viewportParams?.viewportZoom !== 'undefined') {
      ViewerManager.viewer.viewport.zoomTo(viewportParams.viewportZoom, undefined, true);
    } else if (typeof viewportParams?.imageZoom !== 'undefined') {
      const viewportZoom = ViewerManager.viewer.viewport.imageToViewportZoom(viewportParams.imageZoom);
      ViewerManager.viewer.viewport.zoomTo(viewportZoom, undefined, true);
    }
    if (viewportParams?.viewportCenter) {
      ViewerManager.viewer.viewport.panTo(viewportParams.viewportCenter, true);
    } else if (viewportParams?.center) {
      const refPoint = ViewerManager.viewer.viewport.imageToViewportCoordinates(viewportParams.center);
      ViewerManager.viewer.viewport.panTo(refPoint, true);
    }
  }

  private static scheduleViewportHistorySync(navigationVersion: number, viewportParams?: ViewerViewportState | null) {
    if (!viewportParams?.center && typeof viewportParams?.imageZoom === 'undefined') {
      return;
    }

    let applied = false;
    const applyIfCurrent = () => {
      if (applied) {
        return;
      }
      applied = true;
      setTimeout(() => {
        if (navigationVersion !== ViewerManager.navigationState.pendingVersion) {
          return;
        }
        ViewerManager.applyViewportHistoryParams(viewportParams);
        ViewerManager.refreshScalebar();
      }, 50);
    };

    ViewerManager.viewer.addOnceHandler('open', () => {
      applyIfCurrent();
    });
    ViewerManager.viewer.addOnceHandler('page', () => {
      applyIfCurrent();
    });
  }

  private static applyNavigationState(request: ViewerNavigationRequest) {
    const normalizedViewport = normalizeViewportState(request.viewport);
    const currentSlice = ViewerManager.getPlaneChosenSlice(request.plane) ?? 0;
    const requestedSlice = ViewerManager.checkNSetChosenSlice(request.plane, request.slice);
    const planeChanged = request.plane !== ViewerManager.getActivePlane();
    const sliceChanged = requestedSlice !== currentSlice;
    const shouldNavigate = Boolean(request.force) || planeChanged || sliceChanged;
    const shouldApplyViewport = request.applyViewport !== false;
    const boundedViewport = boundViewportStateToPlane(ViewerManager.config, request.plane, normalizedViewport);
    const navigationVersion = shouldNavigate
      ? ViewerManager.navigationState.pendingVersion + 1
      : ViewerManager.navigationState.pendingVersion;

    if (!shouldNavigate) {
      if (request.onRegionsCreated) {
        request.onRegionsCreated();
      }
      if (shouldApplyViewport) {
        ViewerManager.applyViewportHistoryParams(boundedViewport);
      }
      if (request.syncHistory) {
        ViewerManager.makeActualHistoryStep({
          s: requestedSlice,
          a: request.plane,
          ...getHistoryStepParamsFromViewport(boundedViewport),
        });
      }
      ViewerManager.signalStatusChanged(ViewerManager.status);
      return;
    }

    ViewerManager.navigationState.activePlane = request.plane;
    ViewerManager.status.activatedPlanes.add(request.plane);
    ViewerManager.config.setPlaneSizes(request.plane);
    ViewerManager.refreshScalebar();
    ViewerManager.navigationState.pendingVersion = navigationVersion;
    ViewerManager.syncNavigationStateToStatus();

    if (request.onRegionsCreated) {
      ViewerManager.eventSource.addOnceHandler('zav-regions-created', () => {
        request.onRegionsCreated?.();
      });
    }

    if (shouldApplyViewport) {
      ViewerManager.scheduleViewportHistorySync(navigationVersion, boundedViewport);
    }
    ViewerManager.viewer.goToPage(ViewerManager.getPageNumForCurrentSlice());
    ViewerManager.claerPosition();

    if (request.syncHistory) {
      ViewerManager.makeActualHistoryStep({
        s: requestedSlice,
        a: request.plane,
        ...getHistoryStepParamsFromViewport(boundedViewport),
      });
    }
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  private static bindViewerCanvasMousemoveHandler() {
    if (ViewerManager.status.mousemoveHandler) {
      ViewerManager.viewer.canvas.removeEventListener('mousemove', ViewerManager.status.mousemoveHandler);
    }
    ViewerManager.status.mousemoveHandler = ViewerManager.mousemoveHandler.bind(ViewerManager);
    ViewerManager.viewer.canvas.addEventListener('mousemove', ViewerManager.status.mousemoveHandler);
  }

  private static setupViewerOverlaysAndLayers(dimensions: OpenSeadragon.Point) {
    if (ViewerManager.status.editModeOn) {
      const editOverlay = document.createElement('div');
      editOverlay.className = 'overlay';
      editOverlay.id = 'svgEditOverlay';
      editOverlay.style.zIndex = '0';

      ViewerManager.viewer.addOverlay({
        element: editOverlay,
        location: ViewerManager.viewer.viewport.imageToViewportRectangle(
          new OpenSeadragon.Rect(0, 0, dimensions.x, dimensions.y),
        ),
      });
    }

    const regionOverlay = document.createElement('div');
    regionOverlay.className = 'overlay';
    regionOverlay.id = 'svgDelineationOverlay';

    ViewerManager.viewer.addOverlay({
      element: regionOverlay,
      location: ViewerManager.viewer.viewport.imageToViewportRectangle(
        new OpenSeadragon.Rect(0, 0, dimensions.x, dimensions.y),
      ),
    });

    const layers = Object.entries(ViewerManager.config.layers as Record<string, LegacyLayerConfig>);
    layers.forEach(([key, value]) => {
      if (value.index !== 0) {
        ViewerManager.addLayer(key, String(value.name ?? key), String(value.ext ?? ''));
      } else {
        ViewerManager.setLayerOpacity(key);
        if (layers.length === 1) {
          ViewerManager.setAllFilters();
        }
      }
    });
  }

  private static applyInitialOpenState(overridingConf: ViewerHistoryParams) {
    const containerSize = ViewerManager.viewer.viewport.getContainerSize();
    const rightPanelWidth = ViewerManager.getRightPanelWidth();
    const coveredPart = rightPanelWidth / containerSize.x;
    const uncoveredBounds = new OpenSeadragon.Rect(0, 0, 1 + coveredPart + 0.05, 1);
    ViewerManager.viewer.viewport.fitBounds(uncoveredBounds);

    const initHistoryParams = { ...overridingConf };
    if (!initHistoryParams.center && initHistoryParams.imageZoom) {
      debugInfo('Ignoring initial zoom without valid center', {
        imageZoom: initHistoryParams.imageZoom,
        overridingConf,
      });
      delete initHistoryParams.imageZoom;
    }
    const initialPlane = initHistoryParams.activePlane ?? ViewerManager.getActivePlane();
    const initialSlice =
      typeof initHistoryParams.sliceNum !== 'undefined'
        ? initHistoryParams.sliceNum
        : (ViewerManager.getPlaneChosenSlice(initialPlane) ?? 0);
    ViewerManager.scheduleInitialPlaneAtlasSliceAdjustment(initialPlane, initialSlice);
    setTimeout(() => {
      ViewerManager.applyChangeFromHistory(initHistoryParams);
      ViewerManager.trySyncInitialHistoryStep();
    }, 50);
  }

  static getActivePlane() {
    return (
      ViewerManager.navigationState?.activePlane ??
      ViewerManager.status?.activePlane ??
      ViewerManager.config?.firstActivePlane ??
      ZAVConfig.AXIAL
    );
  }

  static activatePlane(newPlane: number) {
    if (newPlane !== ViewerManager.getActivePlane()) {
      const shouldAdjustInitialSlice = !ViewerManager.status.activatedPlanes.has(newPlane);
      const initialSlice = ViewerManager.getPlaneChosenSlice(newPlane) ?? 0;
      const viewportParams = createCenteredViewportForPlane(
        ViewerManager.config,
        newPlane,
        ViewerManager.getLiveViewportState(),
        ViewerManager.viewer.viewport.getHomeBounds().getCenter(),
      );
      if (shouldAdjustInitialSlice) {
        ViewerManager.scheduleInitialPlaneAtlasSliceAdjustment(newPlane, initialSlice);
      }
      ViewerManager.applyNavigationState({
        plane: newPlane,
        slice: initialSlice,
        viewport: viewportParams,
        syncHistory: true,
      });
    }
  }

  static getPlaneSlideCount(plane: number) {
    if (!ViewerManager.config) {
      return 0;
    }
    switch (plane) {
      case ZAVConfig.AXIAL:
        return ViewerManager.config.axialSlideCount;
      case ZAVConfig.CORONAL:
        return ViewerManager.config.coronalSlideCount;
      case ZAVConfig.SAGITTAL:
        return ViewerManager.config.sagittalSlideCount;
    }
    return 0;
  }

  static getPlaneSliceStep(plane: number) {
    if (!ViewerManager.config) {
      return 1;
    }
    switch (plane) {
      case ZAVConfig.AXIAL:
        return ViewerManager.config.axialSliceStep ?? 1;
      case ZAVConfig.CORONAL:
        return ViewerManager.config.coronalSliceStep ?? 1;
      case ZAVConfig.SAGITTAL:
        return ViewerManager.config.sagittalSliceStep ?? 1;
    }
    return 1;
  }

  static getCurrentPlaneChosenSlice() {
    const chosenSlice = ViewerManager.getPlaneChosenSlice(ViewerManager.getActivePlane());
    return chosenSlice ?? 0;
  }

  static getPlaneChosenSlice(plane: number) {
    if (ViewerManager.navigationState) {
      return ViewerManager.navigationState.chosenSlices[plane] ?? 0;
    }
    if (!ViewerManager.status) {
      return 0;
    }
    switch (plane) {
      case ZAVConfig.AXIAL:
        return ViewerManager.status.axialChosenSlice;
      case ZAVConfig.CORONAL:
        return ViewerManager.status.coronalChosenSlice;
      case ZAVConfig.SAGITTAL:
        return ViewerManager.status.sagittalChosenSlice;
    }
    return 0;
  }

  static getPageNumForCurrentPlaneSlice(sliceNum: number) {
    return ViewerManager.getPageNumForPlaneSlice(ViewerManager.getActivePlane(), sliceNum);
  }

  static getPageNumForPlaneSlice(plane: number, sliceNum: number) {
    switch (plane) {
      case ZAVConfig.AXIAL:
        return ViewerManager.config.axialFirstIndex + sliceNum;
      case ZAVConfig.CORONAL:
        return ViewerManager.config.coronalFirstIndex + sliceNum;
      case ZAVConfig.SAGITTAL:
        return ViewerManager.config.sagittalFirstIndex + sliceNum;
    }
    return sliceNum;
  }

  static getPageNumForCurrentSlice() {
    return ViewerManager.getPageNumForCurrentPlaneSlice(ViewerManager.getCurrentPlaneChosenSlice() ?? 0);
  }

  static checkNSetChosenSlice(plane: number, chosenSlice: number) {
    switch (plane) {
      case ZAVConfig.AXIAL:
        if (chosenSlice > ViewerManager.config.axialSlideCount - 1) {
          chosenSlice = ViewerManager.config.axialSlideCount - 1;
        } else if (chosenSlice < 0) {
          chosenSlice = 0;
        }
        ViewerManager.navigationState.chosenSlices[ZAVConfig.AXIAL] = chosenSlice;
        ViewerManager.syncNavigationStateToStatus();
        return chosenSlice;

      case ZAVConfig.CORONAL:
        if (chosenSlice > ViewerManager.config.coronalSlideCount - 1) {
          chosenSlice = ViewerManager.config.coronalSlideCount - 1;
        } else if (chosenSlice < 0) {
          chosenSlice = 0;
        }
        ViewerManager.navigationState.chosenSlices[ZAVConfig.CORONAL] = chosenSlice;
        ViewerManager.syncNavigationStateToStatus();
        return chosenSlice;

      case ZAVConfig.SAGITTAL:
        if (chosenSlice > ViewerManager.config.sagittalSlideCount - 1) {
          chosenSlice = ViewerManager.config.sagittalSlideCount - 1;
        } else if (chosenSlice < 0) {
          chosenSlice = 0;
        }
        ViewerManager.navigationState.chosenSlices[ZAVConfig.SAGITTAL] = chosenSlice;
        ViewerManager.syncNavigationStateToStatus();
        return chosenSlice;
    }
    return chosenSlice;
  }

  /**
   * @public
   */
  static goToPlaneSlice(plane: number, chosenSlice: number, regionsToCenterOn?: string[] | null, force = false) {
    const focusRoi = false;
    const onRegionsCreated = regionsToCenterOn
      ? () => {
          if (focusRoi) {
            ViewerManager.centerOnROI(focusRoi);
          } else {
            ViewerManager.centerOnRegions(regionsToCenterOn);
          }
        }
      : null;
    ViewerManager.applyNavigationState({
      plane,
      slice: chosenSlice,
      viewport: regionsToCenterOn ? null : ViewerManager.getViewportHistoryParamsForSync(),
      applyViewport: plane !== ViewerManager.getActivePlane(),
      force,
      syncHistory: true,
      onRegionsCreated,
    });
  }

  static goToSlice(chosenSlice: number, regionsToCenterOn: string[] | null = null, force = false) {
    ViewerManager.goToPlaneSlice(ViewerManager.getActivePlane(), chosenSlice, regionsToCenterOn, force);
  }

  static shiftToSlice(increment: number, force = false) {
    const activePlane = ViewerManager.getActivePlane();
    ViewerManager.goToPlaneSlice(
      activePlane,
      (ViewerManager.getPlaneChosenSlice(activePlane) ?? 0) + increment,
      null,
      force,
    );
  }

  static changeSlices(slicesByPlane: Record<string, number>) {
    const activePlane = ViewerManager.getActivePlane();
    //for all planes but the active one
    for (const [p, slice] of Object.entries(slicesByPlane)) {
      const plane = parseInt(p, 10);
      if (plane !== activePlane) {
        ViewerManager.checkNSetChosenSlice(plane, slice);
      }
    }

    //eventually change active plane's slice
    if (String(activePlane) in slicesByPlane) {
      ViewerManager.goToPlaneSlice(activePlane, slicesByPlane[String(activePlane)] ?? 0);
    } else {
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  //get point in physical space coordinates from specified image coordinates
  static getPoint(x: number, y: number) {
    const activePlane = ViewerManager.getActivePlane();
    const planeSlice = ViewerManager.getPlaneChosenSlice(activePlane) ?? 0;
    return getPhysicalPoint(ViewerManager.config, planeSlice, ViewerManager.getPlaneSliceStep(activePlane), x, y);
  }

  static getPointXY(x: number, y: number) {
    const activePlane = ViewerManager.getActivePlane();
    const planeSlice = ViewerManager.getPlaneChosenSlice(activePlane) ?? 0;
    return getPhysicalPointXY(ViewerManager.config, planeSlice, ViewerManager.getPlaneSliceStep(activePlane), x, y);
  }

  static mousemoveHandler(event: MouseEvent) {
    const viewerWithOverlays = ViewerManager.viewer as OpenSeadragon.Viewer & {
      currentOverlays?: unknown[];
    };
    if (viewerWithOverlays.currentOverlays?.[0] == null) {
      return;
    }
    var rect = ViewerManager.viewer.canvas.getBoundingClientRect();
    var zoom = ViewerManager.getCurrentImageZoom();
    // update current position of pointer in local (DOM content) coordinates
    ViewerManager.status.position[0].x = event.clientX;
    ViewerManager.status.position[0].y = event.clientY;
    var orig = ViewerManager.viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
    // convert to coordinates in image space
    var x = (ViewerManager.status.position[0].x - orig.x - rect.left) / zoom;
    var y = (ViewerManager.status.position[0].y - orig.y - rect.top) / zoom;

    //update clipping box when clip selection has started
    if (ViewerManager.status.clippingModeOn && ViewerManager.status.position[0].c === 1) {
      ViewerManager.status.position[2].x = x;
      ViewerManager.status.position[2].y = y;
      ViewerManager.displayClipBox();
    }

    //update position in physical space
    if (ViewerManager.config.matrix) {
      ViewerManager.status.livePosition = ViewerManager.getPoint(x, y);
    }

    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static onViewerScroll(_event: ViewerEventLike) {
    // Disable mousewheel zoom on the viewer and let the original mousewheel events bubble
    // if (!event.isTouchEvent) {
    //     event.preventDefaultAction = true;
    //     return true;
    // }
  }

  static onViewerClick(event: ViewerEventLike) {
    // Disable click zoom on the viewer using event.preventDefaultAction
    event.preventDefaultAction = true;
    event.stopBubbling = true;
  }

  static onViewerDrag(event: ViewerEventLike) {
    // Disable panning on the viewer when a region is selected for edition
    if (ViewerManager.status.editModeOn && ViewerManager.status.editPathId) {
      event.preventDefaultAction = true;
    }
  }

  static onViewerKey(event: ViewerEventLike) {
    // Disable keyboard shortcuts on the viewer using event.preventDefaultAction
    event.preventDefaultAction = true;
    event.stopBubbling = true;
  }

  static getLayerOpacity(key: string) {
    return getViewerLayerOpacity(ViewerManager.config, ViewerManager.status, key);
  }

  /**
   * Refresh effective opacity of the layer stack including and below the specified one,
   * and returns the id of refreshed layers
   *
   *   Effective opacity of a layer is zero (to prevent it from being loaded by OSD),
   *   when any fully opaque layer above it renders it invisible.
   *   (Assuming that there's no transparent color in the layer images, except for tracer layer)
   */
  static refreshLayersEffectiveOpacity(startLayerKey: string) {
    return refreshViewerLayersEffectiveOpacity(ViewerManager.config, ViewerManager.status, startLayerKey);
  }

  static setLayerOpacity(key: string) {
    if (ViewerManager.config.layers[key]) {
      //Update the effective opacity of the specified layer and the ones below
      ViewerManager.refreshLayersEffectiveOpacity(key).forEach((layerKey) => {
        const layerInfo = ViewerManager.status.layerDisplaySettings[layerKey];
        const layerIndex = ViewerManager.config.layers[layerKey].index as number;

        const viewerLayer = ViewerManager.viewer.world.getItemAt(layerIndex);
        if (viewerLayer) {
          const effectiveOpacity = Number(layerInfo.effectiveOpacity ?? 0);
          viewerLayer.setOpacity(effectiveOpacity);

          if (effectiveOpacity === 0) {
            //if effective opacity is zero, loading won't occur or be canceled
            //hence finished loading status needs to be forced to stop active progress bar
            ViewerManager.status.layerDisplaySettings[layerKey].loading = false;
          }

          //since changing opacity on the viewer automatically spreads to the navigator, explicit reset to 100% opacity in the navigator is required
          const navigatorLayer = ViewerManager.viewer.navigator.world.getItemAt(layerIndex);
          if (navigatorLayer) {
            navigatorLayer.setOpacity(1);
          }
        }
      });
    }
  }

  static getRegionsSVGEditUrl(extraParams?: Record<string, string | number | undefined>) {
    const _sliceNum = ViewerManager.getCurrentPlaneChosenSlice();
    const url = new URL(
      Utils.makePath(ViewerManager.config.ADMIN_PATH as string | undefined, 'SVG.php'),
      window.location.href,
    );
    const params: Record<string, string> = ViewerManager.config.viewerId
      ? {
          dataset: ViewerManager.config.viewerId,
          plane: String(ViewerManager.status.activePlane),
        }
      : {};
    params.slice = String(ViewerManager.getCurrentPlaneChosenSlice());
    if (extraParams) {
      Object.entries(extraParams).forEach(([key, value]) => {
        if (typeof value !== 'undefined') {
          params[key] = String(value);
        }
      });
    }
    url.search = new URLSearchParams(params).toString();
    return url.toString();
  }

  static getRegionsSVGUrl(extraParams?: Record<string, string | number | undefined>) {
    if (ViewerManager.status.editModeOn) {
      return ViewerManager.getRegionsSVGEditUrl(extraParams);
    } else {
      return ViewerManager.getRegionsSVGUrlForPlaneSlice(
        ViewerManager.status.activePlane,
        ViewerManager.getCurrentPlaneChosenSlice() ?? 0,
      );
    }
  }

  static getRegionsSVGUrlForPlaneSlice(plane: number, sliceNum: number) {
    return getRegionsSVGUrlForPlaneSlice(ViewerManager.config, plane, sliceNum);
  }

  static hasCurrentSliceAtlasRegions(svgFile: XMLDocument) {
    return hasCurrentSliceAtlasRegions(svgFile, BACKGROUND_PATHID);
  }

  static async planeSliceHasAtlasRegions(plane: number, sliceNum: number) {
    const cacheKey = `${plane}:${sliceNum}`;
    const cached = ViewerManager.atlasSlicePresenceCache.get(cacheKey);
    if (typeof cached === 'boolean') {
      return cached;
    }

    const svgFile = await getXmlDocument(ViewerManager.getRegionsSVGUrlForPlaneSlice(plane, sliceNum), 'image/svg+xml');
    const hasRegions = ViewerManager.hasCurrentSliceAtlasRegions(svgFile);
    ViewerManager.atlasSlicePresenceCache.set(cacheKey, hasRegions);
    return hasRegions;
  }

  static async findNearestPlaneSliceWithAtlasRegions(plane: number, sliceNum: number) {
    const planeSlideCount = ViewerManager.getPlaneSlideCount(plane) ?? 0;
    const maxDistance = Math.max(sliceNum, planeSlideCount - sliceNum - 1);

    for (let distance = 1; distance <= maxDistance; distance++) {
      const candidateSlices = getCandidatePlaneSlices(planeSlideCount, sliceNum, distance);
      if (candidateSlices.length === 0) {
        continue;
      }

      const candidates = await Promise.all(
        candidateSlices.map(async (candidateSlice) => ({
          sliceNum: candidateSlice,
          hasRegions: await ViewerManager.planeSliceHasAtlasRegions(plane, candidateSlice),
        })),
      );
      const matchedCandidate = candidates.find((candidate) => candidate.hasRegions);
      if (matchedCandidate) {
        return matchedCandidate.sliceNum;
      }
    }

    return undefined;
  }

  static scheduleInitialPlaneAtlasSliceAdjustment(plane: number, initialSlice: number) {
    if (
      ViewerManager.status.editModeOn ||
      !ViewerManager.config.hasDelineation ||
      !ViewerManager.config.svgFolderName
    ) {
      return;
    }

    ViewerManager.eventSource.addOnceHandler('zav-regions-created', () => {
      if (ViewerManager.status.activePlane !== plane || ViewerManager.getPlaneChosenSlice(plane) !== initialSlice) {
        return;
      }
      if (ViewerManager.status.currentSliceRegions.size > 0) {
        return;
      }

      void ViewerManager.findNearestPlaneSliceWithAtlasRegions(plane, initialSlice)
        .then((replacementSlice) => {
          if (
            typeof replacementSlice === 'number' &&
            ViewerManager.status.activePlane === plane &&
            ViewerManager.getPlaneChosenSlice(plane) === initialSlice
          ) {
            ViewerManager.goToPlaneSlice(plane, replacementSlice, null, true);
          }
        })
        .catch((error) => {
          debugWarn('Failed to adjust initial plane slice to a non-empty atlas slice', {
            plane,
            initialSlice,
            error,
          });
        });
    });
  }

  static getFileTileSourceUrl(slideNum: number, key: string, ext: string, plane: number | null) {
    return buildFileTileSourceUrl(ViewerManager.config, slideNum, key, ext, plane);
  }

  /**
   * compute url to retrieve a specific tile stored in file folders (no backend image server)
   */
  static getFileTileUrl(slideNum: number, key: string, _ext: string, level: number, x: number, y: number) {
    return buildFileTileUrl(ViewerManager.config, ViewerManager.status, slideNum, key, level, x, y);
  }

  static getIIIFTileSourceUrl(slideNum: number, key: string, ext: string) {
    return buildIIIFTileSourceUrl(ViewerManager.config, slideNum, key, ext);
  }

  /**
   * compute url to retrieve a specific tile following IIP protocol format
   * @param {*} slideNum : slide number
   * @param {*} key : layer id
   * @param {*} ext : image file extension
   * @param {*} level : scale level
   * @param {*} x : x index of the tile
   * @param {*} y : y index of the tile
   */
  static getIIPTileUrl(slideNum: number, key: string, ext: string, level: number, x: number, y: number) {
    return buildIIPTileUrl(ViewerManager.status, slideNum, key, ext, level, x, y);
  }

  static getTileSourceDef(key: string, ext: string) {
    return buildTileSourceDef({
      config: ViewerManager.config,
      status: ViewerManager.status,
      key,
      ext,
      currentPage: ViewerManager.getPageNumForCurrentSlice(),
      getCurrentPage: () => ViewerManager.getPageNumForCurrentSlice() ?? 0,
    });
  }

  /**
   * Called once 1rst layer is opened to add other layers
   */
  static addLayer(key: string, _name: string, ext: string) {
    addViewerLayer({
      viewer: ViewerManager.viewer,
      config: ViewerManager.config,
      status: ViewerManager.status,
      key,
      ext,
      getCurrentPage: () => ViewerManager.getPageNumForCurrentSlice() ?? 0,
      onTileLoaded: () => {
        ViewerManager.setLayerOpacity(key);
        ViewerManager.setAllFilters();
      },
    });
  }

  static changeLayerOpacity(layerid: string, enabled: boolean, opacity: number) {
    if (ViewerManager.config.layers[layerid]) {
      ViewerManager.status.layerDisplaySettings[layerid].enabled = enabled;
      ViewerManager.status.layerDisplaySettings[layerid].opacity = opacity;
      ViewerManager.setLayerOpacity(layerid);
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  /** adjust filters to the new zoom factor */
  static adjustFiltersAfterZoom(zoom: number) {
    if (adjustTracerLayerDilation(ViewerManager.status, zoom)) {
      ViewerManager.setAllFilters();
    }
  }

  /** reset filters : the plugin API allows only to set all processors for all tiled images at once  */
  static setAllFilters() {
    applyViewerFilters(ViewerManager.viewer, ViewerManager.status, (message) => console.error(message));
  }

  static resetTiledImageCache(layerid: string) {
    resetViewerTiledImageCache(ViewerManager.viewer, ViewerManager.status, layerid);
  }

  static changeLayerContrast(layerid: string, enabled: boolean, contrast: number) {
    if (ViewerManager.config.layers[layerid]) {
      const layerSettings = ViewerManager.status.layerDisplaySettings[layerid];
      layerSettings.contrastEnabled = enabled;
      layerSettings.contrast = contrast;
      if (layerSettings.useIIProtocol) {
        ViewerManager.resetTiledImageCache(layerid);
      } else {
        ViewerManager.setAllFilters();
      }
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static changeLayerGamma(layerid: string, enabled: boolean, gamma: number) {
    if (ViewerManager.config.layers[layerid]) {
      const layerSettings = ViewerManager.status.layerDisplaySettings[layerid];
      layerSettings.gammaEnabled = enabled;
      layerSettings.gamma = gamma;
      if (layerSettings.useIIProtocol) {
        ViewerManager.resetTiledImageCache(layerid);
      } else {
        ViewerManager.setAllFilters();
      }
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static changeLayerDilation(layerid: string, enabled: boolean, manualEnhancing: boolean, dilation: number) {
    if (ViewerManager.config.layers[layerid]) {
      const layerSettings = ViewerManager.status.layerDisplaySettings[layerid];
      applyLayerDilationChange(layerSettings, enabled, manualEnhancing, dilation);
      ViewerManager.setAllFilters();
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  //--------------------------------------------------
  // position
  static resizeCanvas() {
    const posCanvas = ViewerManager.getPositionCanvas();
    if (!posCanvas) {
      return;
    }
    posCanvas.setAttribute('width', String(ViewerManager.viewer.canvas.clientWidth));
    posCanvas.setAttribute('height', String(ViewerManager.viewer.canvas.clientHeight));
    ViewerManager.refreshCanvasContent();

    if (ViewerManager.viewer.referenceStrip) {
      //FIXME resetReferenceStrip();
    }
  }

  static pointerdownHandler(event: MouseEvent) {
    ViewerManager.status.pointerdownpos = ViewerManager.status.pointerdownpos ?? { x: 0, y: 0 };
    ViewerManager.status.pointerdownpos.x = event.clientX;
    ViewerManager.status.pointerdownpos.y = event.clientY;
  }

  static pointerupHandler(event: MouseEvent) {
    //
    const posCanvas = ViewerManager.getPositionCanvas();
    if (!posCanvas) {
      return;
    }

    if (!ViewerManager.status.measureModeOn && !ViewerManager.status.clippingModeOn) {
      const clickedRegion = ViewerManager._getClickedRegionInfo(event.target);
      if (clickedRegion) {
        ViewerManager._applyViewerRegionSelection(clickedRegion.regionId, clickedRegion.pathId, event.ctrlKey);
        return;
      }
    }

    if (posCanvas.style.display === 'none') {
      if (ViewerManager.status.hoveredRegion) {
        ViewerManager._applyViewerRegionSelection(
          ViewerManager.status.hoveredRegion,
          ViewerManager.status.hoveredRegionPath,
          event.ctrlKey,
        );
      }
      return;
    }

    //prevent recording another point if a dragging gesture is occuring
    const pointerdownpos = ViewerManager.status.pointerdownpos ?? { x: event.clientX, y: event.clientY };
    if (
      pointerdownpos.x > event.clientX + 5 ||
      pointerdownpos.x < event.clientX - 5 ||
      pointerdownpos.y > event.clientY + 5 ||
      pointerdownpos.y < event.clientY - 5
    ) {
      return;
    }

    if (ViewerManager.status.measureModeOn || ViewerManager.status.clippingModeOn) {
      //already 2 points recorded, reset measuring line
      if (ViewerManager.status.position[0].c === 2) {
        ViewerManager.resetPositionview();
        ViewerManager.refreshViewerCanvas();
        return;
      }

      const orig = ViewerManager.viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
      const rect = ViewerManager.viewer.canvas.getBoundingClientRect();
      const zoom = ViewerManager.getCurrentImageZoom();

      //record next point for measuring line feature
      const x = (event.clientX - orig.x - rect.left) / zoom;
      const y = (event.clientY - orig.y - rect.top) / zoom;
      ViewerManager.status.position[0].c += 1;
      const nextPositionIndex = ViewerManager.status.position[0].c as 1 | 2;
      ViewerManager.status.position[nextPositionIndex].x = x;
      ViewerManager.status.position[nextPositionIndex].y = y;

      //init second position with first one in order to draw initial clipbox
      if (1 === ViewerManager.status.position[0].c) {
        ViewerManager.status.position[2].x = x;
        ViewerManager.status.position[2].y = y;
      }
    }

    ViewerManager.setPosition();

    // show canvas
    ViewerManager.refreshCanvasContent();

    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static refreshCanvasContent() {
    ViewerManager.displayMeasureLine();
    ViewerManager.displayClipBox();
  }

  /** Draw the measure line widgets on the position canvas */
  static displayMeasureLine() {
    const viewerWithOverlays = ViewerManager.viewer as OpenSeadragon.Viewer & { currentOverlays?: unknown[] };
    if (viewerWithOverlays.currentOverlays?.[0] == null) {
      return;
    }
    if (!ViewerManager.config.matrix) {
      return;
    }
    const posCanvas = ViewerManager.getPositionCanvas();
    if (ViewerManager.status.ctx == null && posCanvas) {
      ViewerManager.status.ctx = posCanvas.getContext('2d');
    }
    if (!posCanvas || !ViewerManager.status.ctx) {
      return;
    }

    const orig = ViewerManager.viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
    const rect = ViewerManager.viewer.canvas.getBoundingClientRect();

    const zoom = ViewerManager.getCurrentImageZoom();
    const x = (ViewerManager.status.position[0].x - orig.x - rect.left) / zoom;
    const y = (ViewerManager.status.position[0].y - orig.y - rect.top) / zoom;

    ViewerManager.status.livePosition = ViewerManager.getPoint(x, y);
    ViewerManager.signalStatusChanged(ViewerManager.status);
    if (!ViewerManager.status.measureModeOn) {
      return;
    }

    ViewerManager.status.ctx.clearRect(0, 0, posCanvas.width, posCanvas.height);

    // distance line
    if (ViewerManager.status.position[0].c === 2) {
      const px1 = Math.round(ViewerManager.status.position[1].x * zoom + orig.x + 0.5) - 0.5;
      const py1 = Math.round(ViewerManager.status.position[1].y * zoom + orig.y + 0.5) - 0.5;
      const px2 = Math.round(ViewerManager.status.position[2].x * zoom + orig.x + 0.5) - 0.5;
      const py2 = Math.round(ViewerManager.status.position[2].y * zoom + orig.y + 0.5) - 0.5;
      ViewerManager.status.ctx.beginPath();
      ViewerManager.status.ctx.setLineDash([]);
      ViewerManager.status.ctx.lineWidth = 2;
      ViewerManager.status.ctx.lineCap = 'butt';
      ViewerManager.status.ctx.strokeStyle = '#888';
      ViewerManager.status.ctx.moveTo(px1, py1);
      ViewerManager.status.ctx.lineTo(px2, py2);
      ViewerManager.status.ctx.stroke();
    }
    // cross
    if (ViewerManager.status.position[0].c !== 0) {
      ViewerManager.status.ctx.beginPath();
      ViewerManager.status.ctx.setLineDash([]);
      ViewerManager.status.ctx.lineWidth = 1;
      ViewerManager.status.ctx.lineCap = 'butt';
      ViewerManager.status.ctx.strokeStyle = '#000';
      for (let i = 1; i <= ViewerManager.status.position[0].c; i++) {
        const px = Math.round(ViewerManager.status.position[i].x * zoom + orig.x + 0.5) + 0.5;
        const py = Math.round(ViewerManager.status.position[i].y * zoom + orig.y + 0.5) + 0.5;
        ViewerManager.status.ctx.moveTo(px, py - 10);
        ViewerManager.status.ctx.lineTo(px, py + 10);
        ViewerManager.status.ctx.moveTo(px - 10, py);
        ViewerManager.status.ctx.lineTo(px + 10, py);
      }
      ViewerManager.status.ctx.stroke();

      for (let i = 1; i <= ViewerManager.status.position[0].c; i++) {
        ViewerManager.status.ctx.beginPath();
        ViewerManager.status.ctx.strokeStyle = ViewerManager.status.markedPosColors[i - 1];
        const px = Math.round(ViewerManager.status.position[i].x * zoom + orig.x + 0.5) - 0.5;
        const py = Math.round(ViewerManager.status.position[i].y * zoom + orig.y + 0.5) - 0.5;
        ViewerManager.status.ctx.moveTo(px, py - 10);
        ViewerManager.status.ctx.lineTo(px, py + 10);
        ViewerManager.status.ctx.moveTo(px - 10, py);
        ViewerManager.status.ctx.lineTo(px + 10, py);
        ViewerManager.status.ctx.stroke();
      }
    }
  }

  static resetPositionview() {
    ViewerManager.status.position[0].c = 0;
    ViewerManager.status.processedImage = null;
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static claerPosition() {
    ViewerManager.status.position[0].c = 2;
    ViewerManager.resetPositionview();
    ViewerManager.refreshViewerCanvas();
    return;
  }

  static setPosition() {
    if (ViewerManager.config.matrix) {
      ViewerManager.status.markedPos = [
        ViewerManager.getPointXY(ViewerManager.status.position[1].x, ViewerManager.status.position[1].y),
        ViewerManager.getPointXY(ViewerManager.status.position[2].x, ViewerManager.status.position[2].y),
      ];
    }
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static setMeasureMode(active: boolean) {
    ViewerManager.claerPosition();
    if (active) {
      //measurement mode and display of regions are mutually exclusive
      ViewerManager.hideRegions();
      ViewerManager.status.clippingModeOn = false;
    }
    ViewerManager.status.measureModeOn = active;
    const posCanvas = ViewerManager.getPositionCanvas();
    if (!posCanvas) {
      return;
    }
    if (ViewerManager.status.measureModeOn) {
      posCanvas.style.display = 'block';
    } else {
      posCanvas.style.display = 'none';
    }
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static isMeasureModeOn() {
    return ViewerManager.status?.measureModeOn;
  }

  static displayClipBox() {
    const viewerWithOverlays = ViewerManager.viewer as OpenSeadragon.Viewer & { currentOverlays?: unknown[] };
    if (viewerWithOverlays.currentOverlays?.[0] == null) {
      return;
    }
    if (!ViewerManager.status.clippingModeOn) {
      return;
    }
    const posCanvas = ViewerManager.getPositionCanvas();
    if (ViewerManager.status.ctx == null) {
      ViewerManager.status.ctx = posCanvas?.getContext('2d') ?? null;
    }
    if (!posCanvas || !ViewerManager.status.ctx) {
      return;
    }

    ViewerManager.status.ctx.clearRect(0, 0, posCanvas.width, posCanvas.height);

    //clip box
    if (ViewerManager.status.position[0].c !== 0) {
      const orig = ViewerManager.viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
      const zoom = ViewerManager.getCurrentImageZoom();

      const px1 = Math.round(ViewerManager.status.position[1].x * zoom + orig.x + 0.5) - 0.5;
      const py1 = Math.round(ViewerManager.status.position[1].y * zoom + orig.y + 0.5) - 0.5;

      const px2 = Math.round(ViewerManager.status.position[2].x * zoom + orig.x + 0.5) - 0.5;
      const py2 = Math.round(ViewerManager.status.position[2].y * zoom + orig.y + 0.5) - 0.5;

      const lx = Math.min(px1, px2);
      const rx = Math.max(px1, px2);
      const ty = Math.min(py1, py2);
      const by = Math.max(py1, py2);

      const vlx = Math.max(0, lx);
      const vrx = Math.min(rx, ViewerManager.viewer.canvas.clientWidth);
      const vty = Math.max(0, ty);
      const vby = Math.min(by, ViewerManager.viewer.canvas.clientHeight);

      let clipWidth = rx - lx;
      let clipHeight = by - ty;

      ViewerManager.status.ctx.beginPath();
      ViewerManager.status.ctx.strokeStyle = '#00ffff';
      ViewerManager.status.ctx.lineCap = 'butt';
      if (ViewerManager.status.position[0].c === 2) {
        ViewerManager.status.ctx.setLineDash([]);
        ViewerManager.status.ctx.lineWidth = 1;

        if (!ViewerManager.status.processedImage) {
          ViewerManager.status.ctx.strokeStyle = '#0000ff';
        } else {
          //override clip dimension by actually computed result (scaled to current zoom factor)
          const sf = ViewerManager.getZoomFactor() / (ViewerManager.status.processedZoom ?? 1);
          clipWidth = Math.round(ViewerManager.status.processedImage.width * sf);
          clipHeight = Math.round(ViewerManager.status.processedImage.height * sf);

          if (ViewerManager.drawProcessingResult(lx, ty, clipWidth, clipHeight)) {
            //image computed at that zoom factor: green border
            ViewerManager.status.ctx.strokeStyle = '#00ff00';
          } else {
            //magenta border to warn user that it was computed at different zoom
            ViewerManager.status.ctx.strokeStyle = '#ff00ef';
          }
        }

        ViewerManager.status.clippedRegion = [lx, ty, clipWidth, clipHeight];
      } else {
        ViewerManager.status.ctx.setLineDash([1, 5]);
        ViewerManager.status.ctx.lineWidth = 3;
      }

      const selectedProc = ViewerManager.getSelectedProcessor();
      const clipSizeConstraints = selectedProc?.inputSize ?? null;
      const constraintType = clipSizeConstraints?.constraint ?? (clipSizeConstraints ? 'none' : null);

      //extra right-bottom space of the clipped area that won't be used for actual processing
      let extraWidth = 0;
      let extraHeight = 0;

      //take into account size constraints, unless processings already done
      if (constraintType && clipSizeConstraints && !ViewerManager.status.processedImage) {
        if (constraintType === 'fixed') {
          extraWidth = clipSizeConstraints.width
            ? clipWidth - clipSizeConstraints.width >= 0
              ? clipWidth - clipSizeConstraints.width
              : clipWidth
            : 0;
          extraHeight = clipSizeConstraints.height
            ? clipHeight - clipSizeConstraints.height >= 0
              ? clipHeight - clipSizeConstraints.height
              : clipHeight
            : 0;
        } else if (constraintType === 'ratio') {
          // keep constant width/height ratio
          const multW = clipSizeConstraints.width ? Math.floor(clipWidth / clipSizeConstraints.width) : Infinity;
          const multH = clipSizeConstraints.height ? Math.floor(clipHeight / clipSizeConstraints.height) : Infinity;
          const mult = Math.min(multW, multH);
          if (mult === Infinity) {
            extraWidth = clipWidth;
            extraHeight = clipHeight;
          } else {
            extraWidth = clipWidth - (clipSizeConstraints.width ?? 0) * mult;
            extraHeight = clipHeight - (clipSizeConstraints.height ?? 0) * mult;
          }
        } else {
          // no constraint other than using multiple of specified width & height
          extraWidth = clipSizeConstraints.width ? clipWidth % clipSizeConstraints.width : 0;
          extraHeight = clipSizeConstraints.height ? clipHeight % clipSizeConstraints.height : 0;
        }
      }

      //constrained clip is the one who will be processed
      const constrainedClipWidth = clipWidth - extraWidth;
      const constrainedClipHeight = clipHeight - extraHeight;
      ViewerManager.status.constrainedClippedRegion = [lx, ty, constrainedClipWidth, constrainedClipHeight];

      //constrained clip border
      ViewerManager.status.ctx.moveTo(lx, ty);
      ViewerManager.status.ctx.lineTo(lx, ty + constrainedClipHeight);
      ViewerManager.status.ctx.lineTo(lx + constrainedClipWidth, ty + constrainedClipHeight);
      ViewerManager.status.ctx.lineTo(lx + constrainedClipWidth, ty);
      ViewerManager.status.ctx.lineTo(lx, ty);
      ViewerManager.status.ctx.stroke();

      //border of the extra space
      ViewerManager.status.ctx.beginPath();
      ViewerManager.status.ctx.strokeStyle = '#ffff0066';
      ViewerManager.status.ctx.lineWidth = 3;
      ViewerManager.status.ctx.setLineDash([1, 2]);
      if (extraHeight) {
        //part at the bottom of constrained clip
        ViewerManager.status.ctx.moveTo(lx, ty + constrainedClipHeight);
        ViewerManager.status.ctx.lineTo(lx, by);
        ViewerManager.status.ctx.lineTo(lx + constrainedClipWidth, by);
      } else {
        ViewerManager.status.ctx.moveTo(lx + constrainedClipWidth, by);
      }
      if (extraHeight || extraWidth) {
        //bottom-right corner
        ViewerManager.status.ctx.lineTo(rx, by);
        ViewerManager.status.ctx.lineTo(rx, ty + constrainedClipHeight);
      }
      if (extraWidth) {
        //part at the right of constrained clip
        ViewerManager.status.ctx.lineTo(rx, ty);
        ViewerManager.status.ctx.lineTo(lx + constrainedClipWidth, ty);
      }
      ViewerManager.status.ctx.stroke();

      //inner grid
      if (!ViewerManager.status.processedImage) {
        const blockSize = 64;
        ViewerManager.status.ctx.beginPath();
        ViewerManager.status.ctx.strokeStyle = '#ffffff66';
        ViewerManager.status.ctx.setLineDash([1, 7]);
        ViewerManager.status.ctx.lineWidth = 3;
        ViewerManager.status.ctx.lineCap = 'round';
        for (let offX = blockSize; offX < constrainedClipWidth; offX += blockSize) {
          ViewerManager.status.ctx.moveTo(lx + offX, ty);
          ViewerManager.status.ctx.lineTo(lx + offX, ty + constrainedClipHeight);
        }
        for (let offY = blockSize; offY < constrainedClipHeight; offY += blockSize) {
          ViewerManager.status.ctx.moveTo(lx, ty + offY);
          ViewerManager.status.ctx.lineTo(lx + constrainedClipWidth, ty + offY);
        }
        ViewerManager.status.ctx.stroke();
      }

      //if clipbox spans outside the viewport, display some warning red lines to show where it is cropped
      ViewerManager.status.ctx.beginPath();
      ViewerManager.status.ctx.strokeStyle = '#ff0000';
      ViewerManager.status.ctx.setLineDash([1, 2]);
      ViewerManager.status.ctx.lineWidth = 5;
      ViewerManager.status.ctx.lineCap = 'butt';

      if (vty !== ty) {
        //top border
        ViewerManager.status.ctx.moveTo(vlx, vty);
        ViewerManager.status.ctx.lineTo(vrx, vty);
        ViewerManager.status.ctx.stroke();
      }
      if (vlx !== lx) {
        //left border
        ViewerManager.status.ctx.moveTo(vlx, vty);
        ViewerManager.status.ctx.lineTo(vlx, vby);
        ViewerManager.status.ctx.stroke();
      }
      if (vby !== by) {
        //bottom border
        ViewerManager.status.ctx.moveTo(vlx, vby);
        ViewerManager.status.ctx.lineTo(vrx, vby);
        ViewerManager.status.ctx.stroke();
      }
      if (vrx !== rx) {
        //right border

        //right panel might be covering OSD canvas, so warning line should be drawn at the panel limit
        const rightPanelWidth = ViewerManager.getRightPanelWidth();
        ViewerManager.status.ctx.moveTo(vrx - rightPanelWidth, vty);
        ViewerManager.status.ctx.lineTo(vrx - rightPanelWidth, vby);
        ViewerManager.status.ctx.stroke();
      }

      ViewerManager.status.ctx.setLineDash([]);
    }
  }

  static drawProcessingResult(clipOrigX: number, clipOrigY: number, _clipWidth: number, _clipHeight: number) {
    return drawViewportProcessingResult({
      ctx: ViewerManager.status.ctx,
      processedImage: ViewerManager.status.processedImage,
      processedZoom: ViewerManager.status.processedZoom,
      getZoomFactor: () => ViewerManager.getZoomFactor(),
      clipOrigX,
      clipOrigY,
    });
  }

  static setSelectClip(active: boolean) {
    setViewerSelectClip({
      status: ViewerManager.status,
      active,
      posCanvas: ViewerManager.getPositionCanvas(),
      claerPosition: () => ViewerManager.claerPosition(),
      hideRegions: () => ViewerManager.hideRegions(),
      signalStatusChanged: (status) => ViewerManager.signalStatusChanged(status as ViewerStatus),
    });
  }

  static isSelectClipModeOn() {
    return isViewerSelectClipModeOn(ViewerManager.status);
  }

  static isClipSelected() {
    return isViewerClipSelected(ViewerManager.status);
  }

  static isZoomEnabled() {
    return isViewerZoomEnabled(ViewerManager.viewer);
  }

  static setZoomEnabled(active: boolean) {
    setViewerZoomEnabled(ViewerManager.viewer, ViewerManager.status, active, (status) =>
      ViewerManager.signalStatusChanged(status as ViewerStatus),
    );
  }

  static getZoomFactor() {
    return getViewerZoomFactor(ViewerManager.viewer);
  }

  static setZoomFactor(zf: number) {
    if (ViewerManager.viewer) {
      setViewerZoomFactor(ViewerManager.viewer, zf);
    }
  }

  static goHome() {
    if (ViewerManager.viewer) {
      goViewerHome(ViewerManager.viewer);
    }
  }

  static hasProcessingsModule() {
    return hasViewerProcessingsModule();
  }

  static hasProcessors() {
    return hasViewerProcessors();
  }

  static getProcessors() {
    return getViewerProcessors();
  }

  static getProcessor(procIndex: number) {
    return getViewerProcessor(procIndex);
  }

  static setSelectedProcessorIndex(procIndex: number) {
    setViewerSelectedProcessorIndex({
      status: ViewerManager.status,
      procIndex,
      resetPositionview: () => ViewerManager.resetPositionview(),
      displayClipBox: () => ViewerManager.displayClipBox(),
    });
  }

  static getSelectedProcessorIndex() {
    return ViewerManager.status ? getViewerSelectedProcessorIndex(ViewerManager.status) : -1;
  }

  static getSelectedProcessor() {
    return getCurrentSelectedProcessor(ViewerManager.status);
  }

  static getProcessedImage() {
    return ViewerManager.status?.processedImage;
  }

  static isProcessingActive() {
    return ViewerManager.status?.processingActive;
  }

  static performProcessing(procIndex: number) {
    runViewerProcessing({
      viewer: ViewerManager.viewer,
      eventSource: ViewerManager.eventSource,
      status: ViewerManager.status,
      procIndex,
      isClipSelected: () => Boolean(ViewerManager.isClipSelected()),
      getZoomFactor: () => ViewerManager.getZoomFactor(),
      getCurrentImageSize: () => ViewerManager.getCurrentImageSize(),
      displayClipBox: () => ViewerManager.displayClipBox(),
      signalStatusChanged: (status) => ViewerManager.signalStatusChanged(status as ViewerStatus),
    });
  }

  static imageDataToImage(imageData: ImageData) {
    return convertImageDataToImage(imageData);
  }

  //record current viewer state in browser history
  static getActualHistoryStepParams(explicitParams?: Record<string, unknown>) {
    let stepParams: Record<string, unknown>;
    //explicitely specified params override live values
    if (explicitParams) {
      stepParams = explicitParams;
    } else {
      //get live values (Beware, OSD must not be transitioning)
      const liveViewport = ViewerManager.getLiveViewportState();
      const imageZoom = liveViewport?.imageZoom ?? 0;
      const center = liveViewport?.center ?? new OpenSeadragon.Point(0, 0);
      const sliceNum = ViewerManager.getCurrentPlaneChosenSlice();
      const planeImageSize =
        ViewerManager.status.activePlane === ZAVConfig.AXIAL
          ? ViewerManager.config?.axial_size
          : ViewerManager.status.activePlane === ZAVConfig.CORONAL
            ? ViewerManager.config?.coronal_size
            : ViewerManager.status.activePlane === ZAVConfig.SAGITTAL
              ? ViewerManager.config?.sagittal_size
              : ViewerManager.config?.imageSize;
      const { hasValidCenter, stepParams: builtStepParams } = buildActualHistoryStepParams({
        activePlane: ViewerManager.status.activePlane,
        sliceNum,
        imageZoom,
        center,
        planeImageSize,
      });
      stepParams = builtStepParams;

      if (!hasValidCenter) {
        debugInfo('Omitting out-of-bounds history viewport', {
          center,
          planeImageSize,
          activePlane: ViewerManager.status.activePlane,
        });
      }
    }
    return stepParams;
  }

  static trySyncInitialHistoryStep() {
    if (ViewerManager.initialHistorySynced) {
      return false;
    }

    const currentLocationParams = ViewerManager.getParamsFromCurrLocation();
    if (hasViewerHistoryParams(currentLocationParams)) {
      ViewerManager.initialHistorySynced = true;
      return false;
    }

    if (ViewerManager.pendingInitialAtlasFit) {
      return false;
    }

    const stepParams = ViewerManager.getActualHistoryStepParams();
    if (!hasCompleteHistoryStepParams(stepParams)) {
      return false;
    }

    Utils.pushHistoryStep(ViewerManager.history, stepParams, ['px', 'rs'], 'replace');
    ViewerManager.initialHistorySynced = true;
    return true;
  }

  static makeActualHistoryStep(explicitParams?: Record<string, unknown>, mode: 'push' | 'replace' = 'push') {
    const stepParams = ViewerManager.getActualHistoryStepParams(explicitParams);
    //omitted param: expanded right panel, region selection
    Utils.pushHistoryStep(ViewerManager.history, stepParams, ['px', 'rs'], mode);
  }

  static getParamsFromCurrLocation(): ViewerHistoryParams {
    return ViewerManager.getParamsFromLocation(ViewerManager.history.location);
  }

  /** get params from location and check that they are well-formed  */
  static getParamsFromLocation(location: Location | string | Record<string, unknown>): ViewerHistoryParams {
    const confParams: ViewerHistoryParams = {};
    const hashLocation =
      typeof location === 'string'
        ? { hash: location }
        : 'hash' in location
          ? (location as { hash: string })
          : { hash: '' };
    const rawConfFromPath = Utils.getConfigFromLocation(hashLocation);
    const confFromPath: Record<string, string | undefined> = {};
    Object.entries(rawConfFromPath).forEach(([key, value]) => {
      confFromPath[key] = typeof value === 'string' ? value : undefined;
    });
    if (typeof confFromPath.a !== 'undefined') {
      const plane = parseInt(confFromPath.a, 10);
      if (plane === ZAVConfig.AXIAL || plane === ZAVConfig.CORONAL || plane === ZAVConfig.SAGITTAL) {
        confParams.activePlane = plane;
      }
    }
    if (typeof confFromPath.s !== 'undefined') {
      const sliceNum = parseInt(confFromPath.s, 10);
      if (!Number.isNaN(sliceNum) && Number.isFinite(sliceNum)) {
        const plane = confParams.activePlane || ViewerManager.status.activePlane;
        if (sliceNum >= 0 && sliceNum <= ViewerManager.getPlaneSlideCount(plane) - 1) {
          confParams.sliceNum = sliceNum;
        }
      }
    }
    if (typeof confFromPath.z !== 'undefined') {
      const imageZoom = Number(confFromPath.z);
      if (!Number.isNaN(imageZoom) && Number.isFinite(imageZoom)) {
        const zoomPlane =
          confParams.activePlane || ViewerManager.status?.activePlane || ViewerManager.config?.firstActivePlane;
        const { min, max } = getPlaneImageZoomBounds(ViewerManager.config, zoomPlane ?? ZAVConfig.AXIAL);
        if (imageZoom >= min && imageZoom <= max) {
          confParams.imageZoom = imageZoom;
        }
      }
    }
    if (typeof confFromPath.x !== 'undefined' && typeof confFromPath.y !== 'undefined') {
      const x = parseInt(confFromPath.x, 10);
      const y = parseInt(confFromPath.y, 10);
      if (!Number.isNaN(x) && !Number.isNaN(y) && Number.isFinite(x) && Number.isFinite(y)) {
        const plane =
          confParams.activePlane || ViewerManager.status?.activePlane || ViewerManager.config?.firstActivePlane;
        const planeImageSize =
          plane === ZAVConfig.AXIAL
            ? ViewerManager.config?.axial_size
            : plane === ZAVConfig.CORONAL
              ? ViewerManager.config?.coronal_size
              : plane === ZAVConfig.SAGITTAL
                ? ViewerManager.config?.sagittal_size
                : ViewerManager.config?.imageSize;

        if (x >= 0 && y >= 0 && (!planeImageSize || (x <= planeImageSize && y <= planeImageSize))) {
          confParams.center = new OpenSeadragon.Point(x, y);
        } else {
          debugWarn('Ignoring out-of-bounds history center', {
            x,
            y,
            plane,
            planeImageSize,
            location: typeof location === 'string' ? location : 'href' in location ? location.href : location.hash,
          });
        }
      }
    }
    if (confFromPath.p) {
      confParams.protocol = confFromPath.p;
    }
    if (confFromPath.mode && confFromPath.mode === 'edit') {
      confParams.editMode = true;
    }
    //transient param: open UI with right panel expanded
    if (confFromPath.px && confFromPath.px === '1') {
      confParams.initPanelExpanded = true;
    }
    return confParams;
  }

  private static applyChangeFromHistory(params: ViewerHistoryParams) {
    const targetPlane = params.activePlane || ViewerManager.status.activePlane;
    const targetSlice =
      typeof params.sliceNum !== 'undefined' ? params.sliceNum : (ViewerManager.getPlaneChosenSlice(targetPlane) ?? 0);

    if (
      typeof params.activePlane !== 'undefined' ||
      typeof params.sliceNum !== 'undefined' ||
      params.center ||
      typeof params.imageZoom !== 'undefined'
    ) {
      ViewerManager.applyNavigationState({
        plane: targetPlane,
        slice: targetSlice,
        viewport: params,
      });
    }

    ViewerManager.status.editModeOn = params.editMode === true;
    if (params.editMode === true) {
      ViewerManager.setBorderDisplay(true);
    }
    ViewerManager.status.initExpanded = Boolean(params.initPanelExpanded);
  }
}

export default ViewerManager;
