// @ts-nocheck
import _ from 'underscore';

import paper from 'paper';
import Color from 'color';

import LabelMapper from './LabelMapper';
import Utils from './Utils';

import RegionsManager from './RegionsManager';
import ZAVConfig from './ZAVConfig';
import RoiInfos from './RoiInfo';

import CustomFilters from './CustomFilters';
import UserSettings from './UserSettings';
import { getJson, getXmlDocument } from './common/http';

export const VIEWER_ID = 'openseadragon1';
export const NAVIGATOR_ID = 'navigatorDiv';

const VIEWER_ACTIONSOURCEID = 'VIEWER';
const BACKGROUND_PATHID = 'background';

const SVGNS = 'http://www.w3.org/2000/svg';

/** Class in charge of managing viewer's main display (OSD) and state of related elements */
class ViewerManager {
  static get VIEWER_ID() {
    return VIEWER_ID;
  }

  static get NAVIGATOR_ID() {
    return NAVIGATOR_ID;
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

  static setMouseNavigationEnabled(enabled) {
    if (!ViewerManager.viewer) {
      return;
    }

    ViewerManager.viewer.setMouseNavEnabled(enabled);
  }

  /**
   * Create ViewManager from the specified config and setup underlying OpenSeaDragon and related components
   * @param {object} config - configuration used as blueprint to setup the viewer
   * @param {function} callbackWhenReady - function repeatidly invoked whenever viewer's status has changed
   * @param {object} history - browser's history
   */
  static init(config, callbackWhenStatusChanged, history) {
    ViewerManager.config = config;

    ViewerManager.history = history;
    //some continuous operations must not be recorded immediately in history (e.g. zooming, paning)
    ViewerManager.makeHistoryStep = _.debounce(ViewerManager.makeActualHistoryStep, 500);

    ViewerManager.history.listen(({ location, action }) => {
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

    //layers initial display values
    const initLayerDisplaySettings = {};
    Object.entries(ViewerManager.config.data).forEach(([key, value], i) => {
      //FIXME should use another method than name to identify tracer signal layer
      const isTracer = value.metadata.includes('nn_tracer');

      const isLabelMap = typeof value.colortable != 'undefined';

      const itemKeyLayerPrefix = UserSettings.getLayerKeyPrefix(config.viewerId, key);

      const useIIProtocol = value.protocol === 'IIP';

      const initContrast = parseFloat(value.contrast || 1.0);
      const initGamma = parseFloat(value.gamma || 1.0);

      initLayerDisplaySettings[key] = new Proxy(
        {
          key: key,
          enabled: UserSettings.getBoolItem(itemKeyLayerPrefix + 'enabled', true),
          initOpacity: value.opacity ? parseInt(value.opacity) : 100,
          opacity: UserSettings.getNumItem(
            itemKeyLayerPrefix + 'opacity',
            value.opacity ? parseInt(value.opacity) : 100,
          ),
          name: value.metadata,
          index: i,
          isTracer: isTracer,
          enhanceSignal: false,
          manualEnhancing: false,
          dilation: 0,
          manualDilation: 0,
          autoDilation: 0,

          isLabelMap: isLabelMap,

          defaultProtocol: value.protocol || 'IIIF',
          useIIProtocol: useIIProtocol,

          contrastEnabled: UserSettings.getBoolItem(itemKeyLayerPrefix + 'contrastEnabled', initContrast != 1.0),
          initContrast: initContrast,
          contrast: UserSettings.getNumItem(itemKeyLayerPrefix + 'contrast', initContrast),
          gammaEnabled: UserSettings.getBoolItem(itemKeyLayerPrefix + 'gammaEnabled', initGamma != 1.0),
          initGamma: initGamma,
          gamma: UserSettings.getNumItem(itemKeyLayerPrefix + 'gamma', initGamma),
        },
        //handler to intercept Set operations and store it as user settings as required
        {
          set: function (target, property, value) {
            if (['enabled', 'contrastEnabled', 'gammaEnabled'].includes(property)) {
              target[property] = value;
              const itemKey = itemKeyLayerPrefix + property;
              UserSettings.setBoolItem(itemKey, value);
              return true;
            } else if (['opacity', 'contrast', 'gamma'].includes(property)) {
              target[property] = value;
              const itemKey = itemKeyLayerPrefix + property;
              UserSettings.setNumItem(itemKey, value);
              return true;
            } else {
              return Reflect.set(...arguments);
            }
          },
        },
      );
    });

    //params retrieved from initial location
    const overridingConf = ViewerManager.getParamsFromCurrLocation();
    ViewerManager.pendingInitialAtlasFit = !overridingConf.center;
    // should use overrinf configuration only if it make sens with current data
    const overridingPlane = ViewerManager.config.hasPlane(overridingConf.activePlane)
      ? overridingConf.activePlane
      : null;

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
        showRegions: ViewerManager.config.showRegions,
        displayAreas: ViewerManager.config.displayAreas,
        displayBorders: ViewerManager.config.displayBorders,
        displayLabels: ViewerManager.config.displayLabels,
        displayROIs: ViewerManager.config.displayROIs,
        useCustomBorders: ViewerManager.config.useCustomBorders,
        customBorderColor: ViewerManager.config.customBorderColor,
        customBorderWidth: ViewerManager.config.customBorderWidth,
        initRegionsOpacity: 0.4,
        regionsOpacity: UserSettings.getNumItem(UserSettings.SettingsKeys.OpacityAtlasRegionArea, 0.4),

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

        /** currently displayed plane */
        activePlane: overridingPlane || ViewerManager.config.firstActivePlane,

        /** currently displayed slice on active plane */
        chosenSlice: undefined,

        /** currently selected slice for each plane */
        axialChosenSlice:
          overridingConf.sliceNum && overridingPlane === ZAVConfig.AXIAL
            ? overridingConf.sliceNum
            : ViewerManager.config.axialChosenSlice,

        coronalChosenSlice:
          overridingConf.sliceNum && overridingPlane === ZAVConfig.CORONAL
            ? overridingConf.sliceNum
            : ViewerManager.config.coronalChosenSlice,

        sagittalChosenSlice:
          overridingConf.sliceNum && overridingPlane === ZAVConfig.SAGITTAL
            ? overridingConf.sliceNum
            : ViewerManager.config.sagittalChosenSlice,

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
        set: function (target, property, value) {
          if ('displayAreas' === property) {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.ShowAtlasRegionArea, value);
            return true;
          } else if ('displayBorders' === property) {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.ShowAtlasRegionBorder, value);
            return true;
          } else if ('displayLabels' === property) {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.ShowAtlasRegionLabel, value);
            return true;
          } else if ('displayROIs' === property) {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.ShowOverlayROI, value);
            return true;
          } else if ('useCustomBorders' === property) {
            target[property] = value;
            UserSettings.setBoolItem(UserSettings.SettingsKeys.UseCustomRegionBorder, value);
            return true;
          } else if ('customBorderColor' === property) {
            target[property] = value;
            UserSettings.setStrItem(UserSettings.SettingsKeys.CustomRegionBorderColor, value);
            return true;
          } else if ('customBorderWidth' === property) {
            target[property] = value;
            UserSettings.setNumItem(UserSettings.SettingsKeys.CustomRegionBorderWidth, value);
            return true;
          } else if ('regionsOpacity' === property) {
            target[property] = value;
            UserSettings.setNumItem(UserSettings.SettingsKeys.OpacityAtlasRegionArea, value);
            return true;
          } else {
            return Reflect.set(...arguments);
          }
        },
      },
    );
    ViewerManager.status.chosenSlice = ViewerManager.getCurrentPlaneChosenSlice();

    ViewerManager.setupTileSources(overridingConf);
  }

  static setupTileSources(overridingConf) {
    const layerEntries = Object.values(ViewerManager.config.layers);
    const firstLayer = layerEntries.length > 0 ? layerEntries[0] : undefined;

    console.info('[ZAV debug] setupTileSources', {
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
      console.error('[ZAV debug] setupTileSources aborted: no first layer found', {
        layers: ViewerManager.config?.layers,
        data: ViewerManager.config?.data,
      });
      return;
    }

    if (ViewerManager.config.hasBackend) {
      if (ViewerManager.config.data) {
        if (firstLayer.protocol === 'IIP') {
          //Internet Imaging Protocol (IIP)

          const that = ViewerManager;
          const iiifInfoUrl = ViewerManager.getIIIFTileSourceUrl(
            ViewerManager.status.coronalChosenSlice,
            firstLayer.key,
            firstLayer.ext,
          );
          console.info('[ZAV debug] Fetching IIP pyramidal info', {
            url: iiifInfoUrl,
          });

          //Prerequisite: All pages have same image size and tile composition, so pyramidal infos for first image is reused for all
          void getJson(iiifInfoUrl)
            .then((pyramidalImgInfo) => {
              const tileSources = [];

              that.status.IIPSVR_PATH = that.config.IIPSERVER_PATH.replace('?IIIF=', '?FIF=');

              const tileDef = pyramidalImgInfo.tiles[0];

              const minLevel = 0;
              const maxLevel = tileDef.scaleFactors.length - 1;
              const iipTileInfos = {
                minLevel: minLevel,
                maxLevel: maxLevel,
                levelScale: {},
                tileWidth: tileDef.width,
                tileHeight: tileDef.height,

                imageWidth: pyramidalImgInfo.width,
                imgeHeight: pyramidalImgInfo.height,

                //number of tiles along both axis
                xTilesNumAtMaxLevel: Math.ceil(pyramidalImgInfo.width / tileDef.width),
                yTilesNumAtMaxLevel: Math.ceil(pyramidalImgInfo.height / tileDef.height),

                //number of tiles on X axis at each scale level
                xTilesNumAtLevel: {},
              };

              //at maxLevel, image is at full scale
              tileDef.scaleFactors.forEach(
                (scaleFact, level, factors) => (iipTileInfos.levelScale[level] = scaleFact / factors[maxLevel]),
              );

              for (var level = minLevel; level <= maxLevel; level++) {
                iipTileInfos.xTilesNumAtLevel[level] = Math.ceil(
                  iipTileInfos.xTilesNumAtMaxLevel * iipTileInfos.levelScale[level],
                );
              }

              that.status.iipTileInfos = iipTileInfos;

              //tile source for 1rst layer of each slices
              //FIXME use specified plane
              for (var j = 0; j < that.config.coronalSlideCount; j++) {
                tileSources.push(that.getTileSourceDef(firstLayer.key, firstLayer.ext));
              }
              that.status.tileSources = tileSources;

              console.info('[ZAV debug] IIP tileSources prepared', {
                count: tileSources.length,
                sample: tileSources[0],
              });

              that.init2ndStage(overridingConf);
            })
            .catch((error) => {
              console.error('[ZAV debug] Failed to fetch IIP pyramidal info', {
                url: iiifInfoUrl,
                error,
              });
            });
        } else {
          //International Image Interoperability Framework (IIIF) protocol (default)

          const tileSources = [];
          if (ViewerManager.config.data) {
            //FIXME use specified plane
            for (var j = 0; j < ViewerManager.config.coronalSlideCount; j++) {
              tileSources.push(ViewerManager.getIIIFTileSourceUrl(j, firstLayer.key, firstLayer.ext));
            }
            ViewerManager.status.tileSources = tileSources;

            console.info('[ZAV debug] IIIF tileSources prepared', {
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
      const tileSources = [];
      if (ViewerManager.config.data) {
        if (ViewerManager.config.hasAxialPlane) {
          for (var j = 0; j < ViewerManager.config.axialSlideCount; j++) {
            tileSources.push(
              ViewerManager.getFileTileSourceUrl(
                j,
                firstLayer.key,
                firstLayer.ext,
                ViewerManager.config.hasMultiPlanes ? ZAVConfig.AXIAL : null,
              ),
            );
          }
        }
        if (ViewerManager.config.hasCoronalPlane) {
          for (var j = 0; j < ViewerManager.config.coronalSlideCount; j++) {
            tileSources.push(
              ViewerManager.getFileTileSourceUrl(
                j,
                firstLayer.key,
                firstLayer.ext,
                ViewerManager.config.hasMultiPlanes ? ZAVConfig.CORONAL : null,
              ),
            );
          }
        }
        if (ViewerManager.config.hasSagittalPlane) {
          for (var j = 0; j < ViewerManager.config.sagittalSlideCount; j++) {
            tileSources.push(
              ViewerManager.getFileTileSourceUrl(
                j,
                firstLayer.key,
                firstLayer.ext,
                ViewerManager.config.hasMultiPlanes ? ZAVConfig.SAGITTAL : null,
              ),
            );
          }
        }

        ViewerManager.status.tileSources = tileSources;

        console.info('[ZAV debug] Local DZI tileSources prepared', {
          count: tileSources.length,
          firstUrl: tileSources[0],
        });

        //prerequisite: all page have same image size and tile composition, so pyramidal infos for first image is reused for all
        const that = ViewerManager;
        void getXmlDocument(tileSources[0])
          .then((dziInfo) => {
            const imageNodes = dziInfo.getElementsByTagNameNS('http://schemas.microsoft.com/deepzoom/2008', 'Image');
            if (imageNodes.length) {
              const imageNode = imageNodes.item(0);
              const titleSizeAttr = imageNode.attributes['TileSize'];
              if (titleSizeAttr) {
                that.status.tileSize = parseInt(titleSizeAttr.value);
              }
              const overlapAttr = imageNode.attributes['Overlap'];
              if (overlapAttr) {
                that.status.tileOverlap = parseInt(overlapAttr.value);
              }

              const formatAttr = imageNode.attributes['Format'];
              if (formatAttr) {
                that.status.tileFormat = formatAttr.value;
              }
              if (imageNode.childElementCount) {
                const sizeNode = imageNode.childNodes.item(0);
                const widthAttr = sizeNode.attributes['Width'];
                if (widthAttr) {
                  that.status.imageWidth = parseInt(widthAttr.value);
                }
                const heightAttr = sizeNode.attributes['Height'];
                if (heightAttr) {
                  that.status.imageHeight = parseInt(heightAttr.value);
                }
              }
            }
            console.info('[ZAV debug] DZI metadata parsed', {
              tileSize: that.status.tileSize,
              tileOverlap: that.status.tileOverlap,
              tileFormat: that.status.tileFormat,
              imageWidth: that.status.imageWidth,
              imageHeight: that.status.imageHeight,
            });
            that.init2ndStage(overridingConf);
          })
          .catch((error) => {
            console.error('[ZAV debug] Failed to load DZI metadata', {
              url: tileSources[0],
              error,
            });
          });
      }
    }
  }

  static init2ndStage(overridingConf) {
    const that = ViewerManager;

    const initialPage = ViewerManager.config.initialPage;

    console.info('[ZAV debug] init2ndStage', {
      viewerId: VIEWER_ID,
      initialPage: initialPage,
      tileSourceCount: ViewerManager.status?.tileSources?.length,
      firstTileSource: ViewerManager.status?.tileSources?.[0],
      navigatorId: NAVIGATOR_ID,
      overridingConf,
    });

    ViewerManager.viewer = OpenSeadragon(
      Object.assign(
        {
          id: VIEWER_ID,
          tileSources: ViewerManager.status.tileSources,
          initialPage: initialPage,
          minZoomLevel: 0,
          minZoomImageRatio: 0.5,
          maxZoomLevel: 16,
          maxImageCacheCount: 2000,
          sequenceMode: true,
          preserveViewport: true,
          showHomeControl: false,
          showZoomControl: false,
          showSequenceControl: false,
          showNavigator: true,
          navigatorId: NAVIGATOR_ID,
          showReferenceStrip: false,
          showFullPageControl: false,
          //keep image size (and zoom) when container/window is resized
          preserveImageSizeOnResize: true,
          autoResize: true,
        },
        //necessary for filtering when images are loaded from different origin (using datasrcurl param)
        ViewerManager.config.hasCOSource ? { crossOriginPolicy: 'Anonymous' } : {},
      ),
    );

    console.info('[ZAV debug] OpenSeadragon viewer created', {
      elementFound: Boolean(document.getElementById(VIEWER_ID)),
      crossOriginPolicy: ViewerManager.config.hasCOSource ? 'Anonymous' : undefined,
    });

    //Initialize labelMap handler
    ViewerManager.status.hasLabelMap = LabelMapper.initLabelMapper(
      ViewerManager.viewer,
      ViewerManager.status.layerDisplaySettings,
      ViewerManager.config.color2labelMap,
      (color, classLabel) => {
        ViewerManager.status.hoveredRegion = classLabel != 'Background' ? classLabel : null;
        ViewerManager.signalStatusChanged(ViewerManager.status);
      },
    );

    if (ViewerManager.config.matrix) {
      const pixelsPerMeter = 1000 / ViewerManager.config.matrix[0];
      ViewerManager.viewer.scalebar({
        type: OpenSeadragon.ScalebarType.MAP,
        pixelsPerMeter: pixelsPerMeter,
        minWidth: '150px',
        location: OpenSeadragon.ScalebarLocation.BOTTOM_LEFT,
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

    ViewerManager.viewer.addHandler('add-overlay', (event) => {
      //add overlay is called for each page change
      //Reference 1): http://chrishewett.com/blog/openseadragon-svg-overlays/
      if (that.config.svgFolderName != '') {
        //load region delineations in the dedicated overlay
        if (event.element.id === 'svgDelineationOverlay') {
          if (that.config.hasDelineation) {
            that.status.hasCurrentSVG = false;
            const svgPath = that.getRegionsSVGUrl();
            that.addSVGData(svgPath, event.element);
          }
        }
      }
    });

    ViewerManager.viewer.addHandler('open', (event) => {
      if (!that.viewer.source) {
        return;
      }
      const dimensions = that.viewer.source.dimensions;

      if (that.status.editModeOn) {
        /** overlay to hold currently edited region */
        const editOverlay = document.createElement('div');
        editOverlay.className = 'overlay';
        editOverlay.id = 'svgEditOverlay';
        editOverlay.style.zIndex = 0;

        that.viewer.addOverlay({
          element: editOverlay,
          location: that.viewer.viewport.imageToViewportRectangle(
            new OpenSeadragon.Rect(0, 0, dimensions.x, dimensions.y),
          ),
        });
      }

      /** overlay to hold region delineations (triggers 'add-overlay' event) */
      const regionOverlay = document.createElement('div');
      regionOverlay.className = 'overlay';
      regionOverlay.id = 'svgDelineationOverlay';

      that.viewer.addOverlay({
        element: regionOverlay,
        location: that.viewer.viewport.imageToViewportRectangle(
          new OpenSeadragon.Rect(0, 0, dimensions.x, dimensions.y),
        ),
      });

      const layers = Object.entries(that.config.layers);
      layers.forEach(([key, value]) => {
        if (value.index != 0) {
          that.addLayer(key, value.name, value.ext);
        } else {
          that.setLayerOpacity(key);
          //Ensure filters are applied for single layer instances
          if (layers.length === 1) {
            that.setAllFilters();
          }
        }
      });

      if (that.status.mousemoveHandler) {
        that.viewer.canvas.removeEventListener('mousemove', that.status.mousemoveHandler);
      }
      that.status.mousemoveHandler = that.mousemoveHandler.bind(that);
      that.viewer.canvas.addEventListener('mousemove', that.status.mousemoveHandler);
    });

    //--------------------------------------------------
    /** quickfix: ensure that whole image is visible at startup */
    ViewerManager.viewer.addOnceHandler('open', () => {
      const containerSize = that.viewer.viewport.getContainerSize();
      //FIXME id is a  constant
      const rightPanelWidth = document.getElementById('ZAV-rightPanel').getBoundingClientRect().width;

      const coveredPart = rightPanelWidth / containerSize.x;
      const uncoveredBounds = new OpenSeadragon.Rect(0, 0, 1 + coveredPart + 0.05, 1);
      that.viewer.viewport.fitBounds(uncoveredBounds);

      //restore state according to history provided at init
      const initHistoryParams = { ...overridingConf };
      if (!initHistoryParams.center && initHistoryParams.imageZoom) {
        console.info('[ZAV debug] Ignoring initial zoom without valid center', {
          imageZoom: initHistoryParams.imageZoom,
          overridingConf,
        });
        delete initHistoryParams.imageZoom;
      }
      that.applyChangeFromHistory(initHistoryParams);
    });

    //--------------------------------------------------
    //TODO replace by fixed image
    /** set image displayed in navigator as the one loaded in first layer */
    ViewerManager.viewer.addHandler('open', (event) => {
      // items are automatically added to navigator when layers are added to viewer,
      // but only first layer at 100% opacity is needed
      const navItemReplaceHnd = (event) => {
        if (that.viewer.navigator.world.getItemCount() == 1 && event.userData.replaced == 0) {
          var tiledImage = that.viewer.navigator.world.getItemAt(0);
          //replace first item in navigator view by a clone with forced 100% opacity
          var options = {
            tileSource: event.item.source,
            originalTiledImage: tiledImage,
            opacity: 1,
            replace: true,
            index: 0,
          };
          event.userData.replaced = 1;
          that.viewer.navigator.addTiledImage(options);
        } else if (that.viewer.navigator.world.getItemCount() > 1) {
          //remove any extra items from the navigator
          event.userData.removed += 1;
          that.viewer.navigator.world.removeItem(
            that.viewer.navigator.world.getItemAt(that.viewer.navigator.world.getItemCount() - 1),
          );
        }

        //
        if (event.userData.replaced == 1 && event.userData.removed == _.size(that.config.layers) - 1) {
          //remove current handler once replacement/removal has been performed
          that.viewer.navigator.world.removeHandler('add-item', navItemReplaceHnd);
        }
      };

      that.viewer.navigator.world.addHandler('add-item', navItemReplaceHnd, { replaced: 0, removed: 0 });
    });

    //--------------------------------------------------
    //Apply filter on tracer signal once it is fully loaded

    ViewerManager.viewer.world.addHandler('add-item', (addItemEvent) => {
      const tiledImage = addItemEvent.item;
      //retrieve layer info associated to added tiled image
      for (var i = 0; i < that.viewer.world.getItemCount(); i++) {
        if (that.viewer.world.getItemAt(i) === tiledImage) {
          const layer = _.findWhere(that.status.layerDisplaySettings, { index: i });

          //if this tiled image corresponds to tracer signal
          if (layer && layer.isTracer) {
            //handler to set filter on once the image is fully loaded
            const hnd = (fullyLoadedChangeEvent) => {
              //this handler is called anytime the fullyLoaded status changes
              if (fullyLoadedChangeEvent.fullyLoaded) {
                // apply filter
                that.setAllFilters();

                //
                tiledImage.removeHandler('fully-loaded-change', hnd);
              }
            };
            tiledImage.addHandler('fully-loaded-change', hnd);
          }
          break;
        }
      }
    });

    //--------------------------------------------------
    ViewerManager.viewer.world.addHandler('add-item', (addItemEvent) => {
      const i = that.viewer.world.getIndexOfItem(addItemEvent.item);
      const tiledImage = addItemEvent.item;
      //retrieve layer info associated to tiled image source of the event

      const layers = Object.values(that.status.layerDisplaySettings);
      const layer = i < layers.length ? layers[i] : undefined;
      if (layer) {
        //signal loading started for current tiledImage
        that.eventSource.raiseEvent('zav-layer-loading', { layer: layer.key });

        //register event handler to track loaded state (loaded state will change after panning & zomming)
        tiledImage.addHandler('fully-loaded-change', (fullyLoadedChangeEvent) => {
          if (fullyLoadedChangeEvent.fullyLoaded) {
            that.eventSource.raiseEvent('zav-layer-loaded', { layer: layer.key });
          } else {
            that.eventSource.raiseEvent('zav-layer-loading', { layer: layer.key });
          }
        });

        //if tiledImage is already loaded by then, event handler might not be called...
        if (tiledImage.getFullyLoaded()) {
          //... thus, signal loading finished for current tiledImage
          that.eventSource.raiseEvent('zav-layer-loaded', { layer: layer.key });
        }
      }

      changeLabelSizeDebounced();
    });

    ViewerManager.viewer.addHandler('page', (zoomEvent) => {
      //discard previous custom processing result if any
      that.status.processedImage = null;
    });

    ViewerManager.viewer.addHandler('zoom', (zoomEvent) => {
      //change must be recorded in browser's history
      that.makeHistoryStep();

      //some filter might need to be adjusted after zoom changed
      that.adjustFiltersAfterZoom(zoomEvent.zoom);

      //reset hoveredRegion when using labelMap
      if (that.status.hasLabelMap) {
        that.status.hoveredRegion = undefined;
      }
    });

    ViewerManager.viewer.addHandler('pan', (panEvent) => {
      //change must be recorded in browser's history
      that.makeHistoryStep();
    });

    //--------------------------------------------------
    //Adjust label text size depending on zoom level

    //first retrieve CSS rule to be updated
    let ruleToUpdate;
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.cssRules.length > 0) {
          //region's text-label css rule is the first rule of its sheet (inlined within document head)
          const rule = sheet.cssRules[0];
          if (rule.selectorText === '.zav-region-label') {
            ruleToUpdate = rule;
            break;
          }
        }
      } catch (e) {
        //SecurityError maybe raised when accessing cross-origin stylesheet, which can be disregarded
      }
    }

    const changeLabelSizeDebounced = _.debounce((zoomEvent) => {
      const pf = 100 / ViewerManager.getZoomFactor();
      ruleToUpdate.style.setProperty('font-size', `${pf * 15}px`);
      ruleToUpdate.style.setProperty('stroke-width', `${pf * 2.0}px`);
    }, 150);

    if (ruleToUpdate) {
      ViewerManager.viewer.addHandler('zoom', changeLabelSizeDebounced);
    }

    //--------------------------------------------------
    ViewerManager.viewer.addViewerInputHook({
      hooks: [
        { tracker: 'viewer', handler: 'scrollHandler', hookHandler: ViewerManager.onViewerScroll },
        { tracker: 'viewer', handler: 'clickHandler', hookHandler: ViewerManager.onViewerClick },
        { tracker: 'viewer', handler: 'dragHandler', hookHandler: ViewerManager.onViewerDrag.bind(ViewerManager) },
        { tracker: 'viewer', handler: 'keyHandler', hookHandler: ViewerManager.onViewerKey },
      ],
    });

    ViewerManager.viewer.addHandler('resize', (event) => {
      that.resizeCanvas();
      that.adjustResizeRegionsOverlay(that.status.set);
    });

    ViewerManager.viewer.addHandler('animation', (event) => {
      that.adjustResizeRegionsOverlay(that.status.set);
    });

    //--------------------------------------------------

    ViewerManager.viewer.canvas.addEventListener('click', ViewerManager.pointerupHandler.bind(ViewerManager));
    ViewerManager.viewer.canvas.addEventListener('pointerdown', ViewerManager.pointerdownHandler.bind(ViewerManager));
    ViewerManager.viewer.canvas.addEventListener('mousedown', ViewerManager.pointerdownHandler.bind(ViewerManager));

    var cnv = document.createElement('canvas');
    cnv.id = 'poscanvas';
    if (ViewerManager.status.showRegions) {
      cnv.style.display = 'none';
    }
    ViewerManager.viewer.canvas.appendChild(cnv);
    ViewerManager.setMeasureMode(ViewerManager.status.measureModeOn);
    ViewerManager.resizeCanvas();

    //--------------------------------------------------
    ViewerManager.eventSource.addHandler('zav-layer-loading', (event) => {
      ViewerManager.status.layerDisplaySettings[event.layer].loading = true;
      if (ViewerManager.status.isAllLoaded) {
        ViewerManager.eventSource.raiseEvent('zav-alllayers-loading');
      }
      ViewerManager.status.isAllLoaded = false;
      ViewerManager.signalStatusChanged(ViewerManager.status);
    });
    ViewerManager.eventSource.addHandler('zav-layer-loaded', (event) => {
      ViewerManager.status.layerDisplaySettings[event.layer].loading = false;
      const isAllLoaded = !_.findKey(ViewerManager.status.layerDisplaySettings, (val, key) => val.loading);
      if (isAllLoaded && !ViewerManager.status.isAllLoaded) {
        ViewerManager.eventSource.raiseEvent('zav-alllayers-loaded');
      }
      ViewerManager.status.isAllLoaded = isAllLoaded;
      ViewerManager.signalStatusChanged(ViewerManager.status);
    });
    //all layers loaded
    ViewerManager.eventSource.addHandler('zav-alllayers-loaded', (event) => {});
    //--------------------------------------------------

    RegionsManager.addListeners((regionsStatus) => {
      if (RegionsManager.getLastActionSource() != VIEWER_ACTIONSOURCEID) {
        ViewerManager.unselectRegions();
        ViewerManager.selectRegions(RegionsManager.getSelectedRegions());
      }
    });
  }
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  //create SVG element where all editing related drawing is performed
  static createEditSVGElement() {
    if (ViewerManager.status.editModeOn) {
      const editOverlay = document.getElementById('svgEditOverlay');
      const regionSVG = document.getElementById('svgDelineationOverlay').getElementsByTagName('svg')[0];

      const svg = document.createElementNS(SVGNS, 'svg');
      //same size a region delineation SVG
      svg.setAttribute('height', regionSVG.getAttribute('height'));
      svg.setAttribute('width', regionSVG.getAttribute('width'));
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
          if (event.buttons == 1) {
            ViewerManager.doEdit(event);
          }
        },
        pressHandler: (event) => {
          //start active editing when left button pressed
          if (event.buttons == 1) {
            ViewerManager.startEdit(event);
          }
        },
        releaseHandler: (event) => {
          //stop active editing when left button is released
          ViewerManager.suspendEdit(event);
        },
      });
    }
  }

  static createEditSVGBackground(srcBackNode) {
    if (ViewerManager.status.editModeOn) {
      srcBackNode.setAttribute('id', 'editBackgroundPath');
      srcBackNode.setAttribute('class', 'editBackground');
      srcBackNode.setAttribute('fill-opacity', 0);
      ViewerManager.status.editBackgNode = srcBackNode.cloneNode();
      const editGroup = document.getElementById('svgEditGroup');
      if (editGroup) {
        editGroup.appendChild(ViewerManager.status.editBackgNode);
      }

      ViewerManager.status.editScope = paper.setup([10, 10]);
    }
  }

  static getEditCursorSVG(tool) {
    //
    const brushRadius = ViewerManager.status.editingToolRadius;
    const brushBorder = 8;
    const color = Color(ViewerManager.status.editPathFillColor);
    const invcolor = color.negate();
    const zoom = ViewerManager.viewer.world
      .getItemAt(0)
      .viewportToImageZoom(ViewerManager.viewer.viewport.getZoom(true));
    const scaledWidth = 2 * brushRadius * zoom;

    const eraserOn = tool == 'eraser';
    const strokeDash = eraserOn ? 'stroke-dasharray="1 1"' : '';
    const fillColor = eraserOn ? invcolor : color;
    const strokeColor = eraserOn ? 'silver' : invcolor;

    return `url('data:image/svg+xml;utf8,
<svg
 width="${scaledWidth}" 
 height="${scaledWidth}" 
 viewBox="0 0 ${2 * (brushRadius + brushBorder)} ${2 * (brushRadius + brushBorder)}" 
 xmlns="${SVGNS}" 
 style="background-color: transparent;"
 >
  <g>
    <circle 
     cx="${brushRadius + brushBorder}" 
     cy="${brushRadius + brushBorder}" 
     r="${brushRadius}" 
     stroke="${strokeColor}" 
     stroke-width="${brushBorder}" 
     fill="${fillColor}" 
     fill-opacity="0.55"
     ${strokeDash}
    />
  </g>
</svg>
') ${scaledWidth / 2} ${scaledWidth / 2}, crosshair
`.replace(/\n/g, '');
  }

  //set up specific mouse cursor for edit
  static updateEditCursor() {
    if (ViewerManager.status.editPathId) {
      const inlinedCursor = ViewerManager.getEditCursorSVG(ViewerManager.status.editingTool);
      ViewerManager.status.editSVG.style.cursor = inlinedCursor;
    }
  }

  static removeEditCursor() {
    ViewerManager.status.editSVG.style.cursor = 'default';
  }

  static getSVGPos(x, y) {
    const zoom = ViewerManager.viewer.world
      .getItemAt(0)
      .viewportToImageZoom(ViewerManager.viewer.viewport.getZoom(true));
    return { x: Math.round(x / zoom), y: Math.round(y / zoom) };
  }

  static startEditRegionPath(pathId) {
    ViewerManager.stopEditingRegion();
    const regionInDom = document.getElementById(pathId);
    if (regionInDom) {
      ViewerManager.selectEditRegion(regionInDom);
    }
  }

  static selectEditRegion(targetElt) {
    //
    if (targetElt.id && !targetElt.id.startsWith(BACKGROUND_PATHID)) {
      ViewerManager.status.editOrigPathId = ViewerManager.status.editPathId = targetElt.id;
      ViewerManager.status.editRegion = targetElt;
      ViewerManager.status.editPathFillColor = targetElt.getAttribute('fill');
      ViewerManager.status.editPathStrokeColor = targetElt.getAttribute('stroke');

      const editGroup = ViewerManager.status.editSVG.getElementById('svgEditGroup');
      //copy region svg as a base for edit
      const newLivPath = targetElt.cloneNode();
      newLivPath.id = 'beingEditedRegion';

      //insert in DOM
      editGroup.appendChild(newLivPath);
      newLivPath.setAttribute('stroke', Color(ViewerManager.status.editPathFillColor).negate());
      newLivPath.removeAttribute('style');
      newLivPath.setAttribute('fill-opacity', 0.35);
      newLivPath.setAttribute('stroke-opacity', 0.2);
      newLivPath.setAttribute('stroke-width', 20);
      newLivPath.setAttribute('vector-effect', 'non-scaling-stroke');

      ViewerManager.status.editLivePath = newLivPath;
      //import as Paper object for edit transformations
      ViewerManager.status.editRegionPath = paper.project.importSVG(newLivPath, { insert: false });

      //hide source region while its copy is being edited
      targetElt.style.display = 'none';

      //place the editing overlay on top of region overlay while editing is being done
      const editOverlay = document.getElementById('svgEditOverlay');
      editOverlay.style.zIndex = 1;

      ViewerManager.updateEditCursor();

      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static startEdit(e) {
    ViewerManager.status.editingActive = true;
    ViewerManager.status.editPos = ViewerManager.status.lastPos;
    ViewerManager.doEdit(e, true);
  }

  static changeEditedRegionName(newRegionId) {
    const oldPathId = ViewerManager.status.editPathId;

    const regionInfo = ViewerManager.status.currentSliceRegions.get(oldPathId);
    ViewerManager.status.currentSliceRegions.delete(oldPathId);

    const sepIndex = oldPathId.lastIndexOf('-');
    const pathIdSuffix = oldPathId.substr(sepIndex);
    const newPathId = newRegionId + pathIdSuffix;

    const { suffix, side, abbrev } = ViewerManager._splitRegionId(newRegionId);
    regionInfo.pathId = newPathId;
    regionInfo.abbrev = abbrev;
    regionInfo.regionId = newRegionId;
    ViewerManager.status.currentSliceRegions.set(newPathId, regionInfo);
    ViewerManager.status.editPathId = newPathId;

    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static changeEditedRegionFill(newFill) {
    const regionInfo = ViewerManager.status.currentSliceRegions.get(ViewerManager.status.editPathId);
    regionInfo.fill = newFill;
    ViewerManager.status.editPathFillColor = newFill;
    ViewerManager.status.editLivePath.setAttribute('fill', newFill);
    ViewerManager.status.editLivePath.setAttribute('stroke', Color(newFill).negate());

    //stop/start edit to save change
    ViewerManager.startEditRegionPath(ViewerManager.status.editPathId);

    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static suspendEdit(e) {
    ViewerManager.status.editingActive = false;
  }

  static doEdit(e, forcedEdit) {
    if (ViewerManager.status.editingActive) {
      const prevPos = ViewerManager.status.editPos;
      //const newPos = this.getSVGPos(e.layerX, e.layerY);
      const newPos = ViewerManager.getSVGPos(e.position.x, e.position.y);
      ViewerManager.status.editPos = newPos;
      if (forcedEdit || (prevPos && (Math.abs(prevPos.x - newPos.x) > 1 || Math.abs(prevPos.y - newPos.y) > 1))) {
        const outlined = new paper.Path.Circle(
          new paper.Point(newPos.x, newPos.y),
          ViewerManager.status.editingToolRadius,
        );

        const united =
          ViewerManager.status.editingTool == 'eraser'
            ? ViewerManager.status.editRegionPath.subtract(outlined, { insert: false })
            : ViewerManager.status.editRegionPath.unite(outlined, { insert: false });

        const newLivPath = united.exportSVG();
        ViewerManager.status.editRegionPath = united;

        ViewerManager.status.editLivePath.replaceWith(newLivPath);
        ViewerManager.status.editLivePath = newLivPath;
      }
    } else {
      //store first position of editing segment
      ViewerManager.status.lastPos = ViewerManager.getSVGPos(e.position.x, e.position.y);
    }
  }

  static stopEditingRegion() {
    ViewerManager.status.editingActive = false;
    if (ViewerManager.status.editPathId) {
      //restore region overlay above edition
      const editOverlay = document.getElementById('svgEditOverlay');
      editOverlay.style.zIndex = 0;

      ViewerManager.removeEditCursor();
      const newPathId = ViewerManager.status.editPathId;
      ViewerManager.status.editPathId = null;

      //replace exisiting region by edited one

      //remove un-edited source region from Raphaël set
      ViewerManager.status.set.exclude(ViewerManager.status.editRegion);
      const regionId = ViewerManager.status.editRegion.getAttribute('bma:regionId');

      const origPathId = ViewerManager.status.editRegion.id;

      //remove from DOM
      ViewerManager.status.editRegion.remove();

      //import edited region in Raphaël
      const modifiedRegion = ViewerManager.status.editRegionPath.exportSVG();
      modifiedRegion.setAttribute('id', newPathId);

      //FIXME region order is not conserved, Raphaël will place the newly imported region at the end
      const newRaphElt = ViewerManager.status.paper.importSVG(modifiedRegion);
      newRaphElt.attr('fill', ViewerManager.status.editPathFillColor);
      newRaphElt.attr('stroke', ViewerManager.status.editPathStrokeColor);
      ViewerManager.status.set.push(newRaphElt);

      //once modified path is added to DOM, restore lost attributes
      const modifiedRegionInDom = document.getElementById(newPathId);
      //restore non-scaling strocke attribute
      modifiedRegionInDom.setAttribute('vector-effect', 'non-scaling-stroke');

      //in case region id was modified
      const regionInfo = ViewerManager.status.currentSliceRegions.get(newPathId);
      const newRegionId = regionInfo.regionId ? regionInfo.regionId : regionId;

      //restore region Id
      modifiedRegionInDom.setAttribute('bma:regionId', newRegionId);

      if (newRegionId == regionId) {
        //reuse region event listener
        ViewerManager.connectRegionListeners(newRaphElt, ViewerManager.status.regionEventListeners[origPathId]);
      } else {
        //change listener since id has been modified
        delete ViewerManager.status.regionEventListeners[origPathId];
        ViewerManager._addNActivateRegion(newPathId, newRegionId, newRaphElt);
      }

      ViewerManager.applyUnselectedPresentation(newRaphElt);

      ViewerManager.status.editLivePath.remove();

      ViewerManager.status.editLivePath = null;
      ViewerManager.status.editPos = null;
      ViewerManager.status.editRegion = null;

      //call WS to remotely save
      ViewerManager.updateSVGRegion(modifiedRegionInDom, ViewerManager.status.editOrigPathId);
      ViewerManager.status.editOrigPathId = null;

      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static createOrUpdateSVGRegion(regionInDom, create, origPathId) {
    const pathId = regionInDom.getAttribute('id');
    const regionId = regionInDom.getAttribute('bma:regionId');

    const url = ViewerManager.getRegionsSVGEditUrl({ region: pathId });
    fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: create ? 'cr' : 'up',
        //original path id in case of id modification
        pathId: origPathId ? origPathId : pathId,
        regionId: regionId,
        pathSVG: regionInDom.outerHTML,
      }),
    })
      .then((response) => {
        if (response.ok) {
          return Promise.resolve(response.json());
        } else {
          throw new Error(response.status + ' - ' + response.message);
        }
      })
      .then((data) => {
        //console.debug((create ? 'New' : 'Modified') + ' region path ' + pathId + ' successfully saved!', data);
      })
      .catch((error) => {
        //FIXME alert user
        console.error('Error when saving region path ' + pathId);
      });
  }

  static updateSVGRegion(regionInDom, origPathId) {
    ViewerManager.createOrUpdateSVGRegion(regionInDom, false, origPathId);
  }

  static createSVGRegion(regionInDom) {
    ViewerManager.createOrUpdateSVGRegion(regionInDom, true);
  }

  static createPathForRegion(regionId, fill, stroke) {
    const maxPathIndex = Array.from(ViewerManager.getCurrentSliceRegions().keys()).reduce((maxIndex, pathId) => {
      const sepPos = pathId.lastIndexOf('-');
      return Math.max(0, sepPos > 0 ? parseInt(pathId.substr(sepPos + 1)) : -1);
    }, 0);
    const pathId = regionId + '-' + (maxPathIndex + 1);
    const newPath = document.createElementNS(SVGNS, 'path');
    newPath.id = pathId;
    newPath.setAttribute('fill', fill);
    newPath.setAttribute('stroke', stroke);

    //import in Raphael
    const newRaphElt = ViewerManager.status.paper.importSVG(newPath);
    ViewerManager.status.set.push(newRaphElt);
    //locate DOM element created by Raphael
    const regionInDom = document.getElementById(pathId);

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
    fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        width: ViewerManager.status.imageWidth,
        height: ViewerManager.status.imageHeight,
      }),
    })
      .then((response) => {
        if (response.ok) {
          return Promise.resolve(response.json());
        } else {
          throw new Error(response.status + ' - ' + response.message);
        }
      })
      .then((data) => {
        //console.debug('New SVG successfully created!');

        //Reload (newly created) SVG
        ViewerManager.shiftToSlice(0, true);
      })
      .catch((error) => {
        //FIXME alert user
        console.error('Error while creating new SVG:' + error);
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
    if (ViewerManager.status.editPathId) {
      if (ViewerManager.status.editRegionPath.simplify()) {
        const newLivPath = ViewerManager.status.editRegionPath.exportSVG();

        ViewerManager.status.editLivePath.replaceWith(newLivPath);
        ViewerManager.status.editLivePath = newLivPath;
      }
    }
  }

  static extendRegionListenerForEdit(listener) {
    listener.dblclick = (e) => {
      if (ViewerManager.status.editPathId) {
        ViewerManager.stopEditingRegion(e);
      } else {
        ViewerManager.selectEditRegion(e.target);
      }
    };

    listener.click = [
      listener.click,
      (e, raphElt) => {
        if (ViewerManager.status.acquiringRegionToEdit) {
          ViewerManager.status.acquiringRegionToEdit = false;
          ViewerManager.selectEditRegion(e.target);
        }
      },
    ];

    return listener;
  }

  static connectRegionListeners(targetElt, regionListener, pathElt) {
    if (targetElt.mouseover) {
      //Raphael element

      targetElt.mouseover(function (e) {
        regionListener.mouseover(e, this);
      });
      targetElt.mouseout(function (e) {
        regionListener.mouseout(e, this);
      });
      targetElt.click(function (e) {
        if (_.isArray(regionListener.click)) {
          for (const clickListener of regionListener.click) {
            clickListener(e, this);
          }
        } else {
          regionListener.click(e, this);
        }
      });
      if (regionListener.dblclick) {
        targetElt.dblclick(function (e) {
          regionListener.dblclick(e, this);
        });
      }
    } else {
      //SVG DOM element

      targetElt.addEventListener('mouseover', (e) => {
        regionListener.mouseover(e, pathElt);
      });
      targetElt.addEventListener('mouseout', (e) => {
        regionListener.mouseout(e, pathElt);
      });

      targetElt.addEventListener('click', (e) => {
        if (_.isArray(regionListener.click)) {
          for (const clickListener of regionListener.click) {
            clickListener(e, pathElt);
          }
        } else {
          regionListener.click(e, pathElt);
        }
      });
      if (regionListener.dblclick) {
        targetElt.addEventListener('dblclick', (e) => {
          regionListener.dblclick(e, pathElt);
        });
      }
    }
  }

  static changeEditingTool(newTool) {
    ViewerManager.status.editingTool = newTool;
    ViewerManager.updateEditCursor();
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static changeEditingRadius(newradius) {
    ViewerManager.status.editingToolRadius = newradius;
    ViewerManager.updateEditCursor();
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  static setSelectedAtlasIndex(atlasIndex) {
    if (ViewerManager.config.currentAtlas != atlasIndex) {
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
  static addSVGData(svgName, overlayElement) {
    ViewerManager.status.paper = Raphael(overlayElement);
    ViewerManager.status.set = ViewerManager.status.paper.set();
    //clear the set if necessary
    ViewerManager.status.set.remove();

    ViewerManager.status.currentSVGName = svgName;
    //console.log("svg " + svgName);

    //Create SVG element dedicated to edition
    ViewerManager.createEditSVGElement();

    const that = ViewerManager;

    //load SVG
    void getXmlDocument(svgName, 'image/svg+xml').then((svgFile) => {
      // process retrieved data only if it's the last one requested to ensure current slice SVG is loaded
      if (svgName === that.status.currentSVGName) {
        const root = svgFile.getElementsByTagName('svg')[0];
        that.status.hasCurrentSVG = typeof root !== 'undefined';

        that.status.currentSliceRegions.clear();
        //new set of mouse event listeners
        that.status.regionEventListeners = {};

        let hasBackground = false;
        const svgElement = overlayElement.getElementsByTagName('svg')[0];

        //add group for ROI
        const roig = document.createElementNS(SVGNS, 'g');
        roig.setAttribute('id', 'rois');
        that.status.roig = roig;

        //ROIs from the source SVG
        const ROISrcGroup = root.getElementById('rois');
        that.status.hasROIs = ROISrcGroup != null;

        const ROIListener = {
          mouseover: (roiID, roiLabel) => {
            that.status.hoveredROI = roiID;
            that.status.hoveredROILabel = roiLabel;
            that.signalStatusChanged(that.status);
          },

          mouseout: () => {
            that.status.hoveredROI = null;
            that.status.hoveredROILabel = null;
            that.signalStatusChanged(that.status);
          },
        };

        if (that.status.hasROIs) {
          //import ROI's SVG path elements
          const rois_paths = ROISrcGroup.getElementsByTagName('path');
          for (var i = 0; i < rois_paths.length; i++) {
            const roiPath = rois_paths[i];
            const roiElt = document.createElementNS(SVGNS, 'path');

            let roiID, roiLabel;
            //copy all attributes except ID and class
            for (let j = 0; j < roiPath.attributes.length; j++) {
              const attr = roiPath.attributes[j];
              if (attr.name != 'id' && attr.name != 'class' && attr.name != 'zav:roi-label') {
                roiElt.setAttribute(attr.name, attr.value);
              }
              if (attr.name == 'zav:roi-id') {
                roiID = attr.value;
                //duplicate id without custom ns to access with css selector
                roiElt.setAttribute('zav-roi-id', roiID);
              } else if (attr.name == 'zav:roi-label') {
                roiLabel = attr.value;
              }
            }

            //get color from ROIs descriptor file
            const roiInfo = RoiInfos.getRoiById(roiID);
            if (roiInfo) {
              roiLabel = roiInfo.roiLabel;
              roiElt.setAttribute('fill', roiInfo.fill);
            }
            roiElt.setAttribute('class', 'zav-roi');
            roiElt.setAttribute('vector-effect', 'non-scaling-stroke');

            //attach listener to track ROI hover
            roiElt.addEventListener('mouseover', () => ROIListener.mouseover(roiID, roiLabel));
            roiElt.addEventListener('mouseout', ROIListener.mouseout);

            roig.appendChild(roiElt);
          }

          const defs = document.createElementNS(SVGNS, 'defs');
          svgElement.appendChild(defs);
        }

        //add group for region labels
        const labelsg = document.createElementNS(SVGNS, 'g');
        labelsg.setAttribute('id', 'region_labels');
        that.status.labelsg = labelsg;

        //labels from the source SVG
        const labelSrcGroup = root.getElementById('region-labels');
        that.status.hasRegionLabels = labelSrcGroup != null;

        const regionSrcGroup = root.getElementsByTagName('g')[0];
        const region_paths = regionSrcGroup.getElementsByTagName('path');
        for (var i = 0; i < region_paths.length; i++) {
          const regionPath = region_paths[i];
          let regionId = regionPath.getAttribute('bma:regionId')
            ? regionPath.getAttribute('bma:regionId').trim()
            : null;
          let pathId;
          if (regionId) {
            //when a specific attribute holding region id exists, SVG path's id is garanteed to be unique
            pathId = regionPath.getAttribute('id').trim();
          } else {
            //Legacy SVG : regionId is specified in the id attribute of the path
            regionId = regionPath.getAttribute('id').trim();
            //append ordinal number to ensure unique id (case of non-contiguous regions)
            pathId = regionId + (regionId === BACKGROUND_PATHID ? '' : '-' + i);
            regionPath.setAttribute('id', pathId);
          }

          var newPathElt = that.status.paper.importSVG(regionPath);

          const isBackgroundElement = regionId === BACKGROUND_PATHID;
          if (isBackgroundElement) {
            //background elements
            newPathElt.id = pathId;
            newPathElt.attr('fill-opacity', 0.0);

            //unselect all when click on the background element
            newPathElt.click((e) => {
              if (that.status.showRegions) {
                that.unselectRegions();
                that.regionActionner.unSelectAll();
                that.status.lastSelectedPath = null;
              }
            });

            //Create Background path in the SVG dedicated to edition
            that.createEditSVGBackground(regionPath);
            hasBackground = true;
          } else {
            newPathElt.id = pathId;

            that._addNActivateRegion(pathId, regionId, newPathElt);

            that.applyUnselectedPresentation(newPathElt);
          }

          that.status.set.push(newPathElt);

          if (!isBackgroundElement) {
            //once path elements are added to the DOM
            const modifiedRegionInDom = svgElement.getElementById(pathId);
            if (modifiedRegionInDom) {
              //restore custom attribute lost when imported in Raphaël
              modifiedRegionInDom.setAttribute('bma:regionId', regionId);
              //make path's stroke width independant of scaling transformations
              modifiedRegionInDom.setAttribute('vector-effect', 'non-scaling-stroke');

              //add corresponding label, if any
              if (labelSrcGroup) {
                const labelSrc = root.getElementById('lbl-' + pathId);
                if (labelSrc) {
                  const labelElt = document.createElementNS(SVGNS, 'text');
                  labelElt.setAttribute('class', 'zav-region-label');
                  //labelElt.setAttribute("x", center.x);
                  //labelElt.setAttribute("y", center.y);

                  const x = labelSrc.getAttribute('x');
                  const y = labelSrc.getAttribute('y');
                  labelElt.setAttribute('transform', `translate(${x}, ${y})`);
                  labelElt.innerHTML = labelSrc.innerHTML;
                  labelsg.appendChild(labelElt);

                  that.connectRegionListeners(labelElt, that.status.regionEventListeners[pathId], newPathElt);
                }
              }
            }
          }
        }
        if (!hasBackground) {
          console.warn('SVG without background: Region rendering and edition will likely fail! ' + svgName);
        }

        //append region labels' group
        const regionsGroup = svgElement.getElementsByTagName('g')[0];

        regionsGroup.appendChild(roig);
        that.applyROIPresentation();

        regionsGroup.appendChild(labelsg);
        that.applyLabelPresentation();

        if (that.pendingInitialAtlasFit && that.viewer && regionsGroup) {
          const atlasBounds = regionsGroup.getBBox();
          if (atlasBounds.width > 0 && atlasBounds.height > 0) {
            const containerSize = that.viewer.viewport.getContainerSize();
            const rightPanelWidth = document.getElementById('ZAV-rightPanel')?.getBoundingClientRect().width || 0;
            const coveredPart = containerSize.x > 0 ? rightPanelWidth / containerSize.x : 0;
            const marginRatio = 0.08;
            const extraRightWidth = (atlasBounds.width * coveredPart) / Math.max(1 - coveredPart, 0.1);
            const imageRect = new OpenSeadragon.Rect(
              atlasBounds.x - (atlasBounds.width * marginRatio) / 2,
              ViewerManager.config.dzDiff + atlasBounds.y - (atlasBounds.height * marginRatio) / 2,
              atlasBounds.width * (1 + marginRatio) + extraRightWidth,
              atlasBounds.height * (1 + marginRatio),
            );

            that.viewer.viewport.fitBounds(that.viewer.viewport.imageToViewportRectangle(imageRect), true);
            that.pendingInitialAtlasFit = false;

            console.info('[ZAV debug] Applied initial atlas fit', {
              atlasBounds,
              imageRect,
              coveredPart,
            });
          }
        }

        that.eventSource.raiseEvent('zav-regions-created', { svgUrl: svgName });

        that.adjustResizeRegionsOverlay(that.status.set);

        //restore presentation of regions selected in previous slice
        that.selectRegions(RegionsManager.getSelectedRegions());

        if (!that.status.showRegions) {
          that.hideDelineation();
        }

        that.regionActionner.setCurrentSliceRegions(
          Array.from(that.status.currentSliceRegions.values()).map((r) => r.abbrev),
        );

        that.signalStatusChanged(that.status);
      }
    });
  }

  static _splitRegionId(regionId) {
    //extract hemisphere side from region id
    const suffix = regionId ? regionId.substring(regionId.length - 2) : '';
    const side = suffix === '_L' ? '(left)' : suffix === '_R' ? '(right)' : '';
    //region abbreviation without hemisphere side
    const abbrev = side ? regionId.substring(0, regionId.length - 2) : regionId;
    return { suffix, side, abbrev };
  }

  static _addNActivateRegion(pathId, regionId, newPathElt) {
    const that = ViewerManager;
    const { suffix, side, abbrev } = ViewerManager._splitRegionId(regionId);

    const pathElt = newPathElt.items[0];
    that.status.currentSliceRegions.set(pathId, {
      abbrev: abbrev,
      pathId: pathId,
      fill: pathElt.attr('fill'),
      stroke: pathElt.attr('stroke'),
    });

    //grouped listeners so they can be easily reused
    const regionListener = {
      abbrev: abbrev,
      side: side,

      mouseover: (e, raphElt) => {
        //highlight border and display info about hovered region
        if (raphElt && that.status.showRegions) {
          that.applyMouseOverPresentation(raphElt);
        }
        that.status.hoveredRegion = abbrev;
        that.status.hoveredRegionSide = side;
        that.signalStatusChanged(that.status);
      },

      mouseout: (e, raphElt) => {
        //remove highlighted border and info when cursor move out of region
        if (raphElt && that.status.showRegions) {
          that.applyMouseOutPresentation(raphElt, RegionsManager.isSelected(abbrev));
        }
        that.status.hoveredRegion = null;
        that.status.hoveredRegionSide = null;
        that.signalStatusChanged(that.status);
      },

      click: (e, raphElt) => {
        if (that.status.showRegions) {
          that.unselectRegions();
          if (e.ctrlKey) {
            //when Ctrl key is pressed, allow multi-select or toogle of currently selected region
            if (RegionsManager.isSelected(abbrev)) {
              that.regionActionner.unSelect(abbrev);
              if (that.status.lastSelectedPath == pathId) {
                that.status.lastSelectedPath = null;
              } else {
                that.status.lastSelectedPath = pathId;
              }
            } else {
              that.regionActionner.addToSelection(abbrev);
              that.status.lastSelectedPath = pathId;
            }
          } else {
            that.regionActionner.replaceSelected(abbrev);
            that.status.lastSelectedPath = pathId;
          }
          that.status.userClickedRegion = true;
          that.selectRegions(RegionsManager.getSelectedRegions());
        } else if (raphElt && e.shiftKey) {
          that.applyMouseOverPresentation(raphElt, true);
          setTimeout(() => that.applyMouseOutPresentation(raphElt), 2500);
        }
      },
    };

    that.status.regionEventListeners[pathId] = regionListener;

    //Add event listener related to edit mode
    if (that.status.editModeOn) {
      that.status.regionEventListeners[pathId] = that.extendRegionListenerForEdit(regionListener);
    }

    that.connectRegionListeners(newPathElt, that.status.regionEventListeners[pathId]);
  }

  /**
   * @private
   */
  static adjustResizeRegionsOverlay(el) {
    if (ViewerManager.viewer.world.getItemCount()) {
      var zoom = ViewerManager.viewer.world
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
        ViewerManager.status.paper.setTransform(
          ' scale(' + zoom + ',' + zoom + ') translate(0,' + ViewerManager.config.dzDiff + ')',
        );
      }
      //console.log('S' + zoom + ',' + zoom + ',0,0');

      ViewerManager.refreshCanvasContent();

      if (ViewerManager.status.editModeOn) {
        //scale edition overlay
        const editGroup = document.getElementById('svgEditGroup');
        if (editGroup) {
          editGroup.setAttribute(
            'transform',
            ' scale(' + zoom + ',' + zoom + ') translate(0,' + ViewerManager.config.dzDiff + ')',
          );
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
        ViewerManager.status.set.forEach(
          function (el) {
            this.applyHiddenPresentation(el);
          }.bind(ViewerManager),
        );
      } else {
        ViewerManager.status.set.forEach(
          function (el) {
            if (el.id !== BACKGROUND_PATHID) {
              this.applyUnselectedPresentation(el);
            }
          }.bind(ViewerManager),
        );
      }
    }
  }

  /**
   * Hide all region delineations
   * @private
   */
  static hideDelineation() {
    ViewerManager.status.set.forEach(
      function (el) {
        this.applyHiddenPresentation(el);
      }.bind(ViewerManager),
    );
  }

  static updateRegionAreasPresentation() {
    if (ViewerManager.status.set) {
      const selectedRegions = RegionsManager.getSelectedRegions();
      const that = ViewerManager;
      ViewerManager.status.set.forEach((el) => {
        if (el.id !== BACKGROUND_PATHID) {
          const regionInfo = that.status.currentSliceRegions.get(el.id);
          const abbrev = regionInfo ? regionInfo.abbrev : null;
          if (selectedRegions.includes(abbrev)) {
            that.applySelectedPresentation(el);
          } else {
            that.applyUnselectedPresentation(el);
          }
        }
      });
    }
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static changeRegionsOpacity(opacity) {
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

  static setBorderDisplay(active) {
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

  static changeCustomBorderColor(color) {
    ViewerManager.status.customBorderColor = color;
    ViewerManager.updateRegionsVisibility();
    ViewerManager.updateRegionAreasPresentation();
  }

  static changeCustomBorderWidth(width) {
    ViewerManager.status.customBorderWidth = width;
    ViewerManager.updateRegionsVisibility();
    ViewerManager.updateRegionAreasPresentation();
  }

  static setLabelDisplay(active) {
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

  static setROIDisplay(active) {
    ViewerManager.status.displayROIs = active;
    ViewerManager.applyROIPresentation();
  }

  static toggleROIDisplay() {
    ViewerManager.setROIDisplay(!ViewerManager.status.displayROIs);
  }

  static applyROIPresentation() {
    ViewerManager.status.roig.style.opacity = ViewerManager.status.displayROIs ? '1' : '0';
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static centerOnROI(roiId) {
    const el = document.querySelector("div#svgDelineationOverlay g#rois path.zav-roi[zav-roi-id='" + roiId + "']");
    if (el) {
      const bbox = el.getBBox();
      const newX = (bbox.x - bbox.width / 2) / ViewerManager.config.dzWidth;
      const newY = (ViewerManager.config.dzDiff + bbox.y - bbox.height / 2) / ViewerManager.config.dzHeight;
      console.log(newX, newY);
      const windowPoint = new OpenSeadragon.Point(newX, newY);
      ViewerManager.viewer.viewport.panTo(windowPoint);
      ViewerManager.viewer.viewport.zoomTo(1.1);
    }
  }

  static applyMouseOverPresentation(element, forcedBorder = false) {
    const el = element.length ? element[0] : element;
    const color = el.node.getAttribute('fill');
    const fillOpacity =
      !ViewerManager.status.displayAreas || ViewerManager.status.regionsOpacity < 0.05
        ? 0
        : ViewerManager.status.regionsOpacity + (ViewerManager.status.regionsOpacity > 0.6 ? -0.4 : 0.4);
    const strokeOpacity = forcedBorder || ViewerManager.status.displayBorders ? 1 : 0;
    element.attr({
      'fill-opacity': fillOpacity,
      'stroke-opacity': strokeOpacity,
      'stroke-width': '4px',
      stroke: color,
    });
    (element.length ? element : [element]).forEach((e) => {
      e.node.classList.add('delin-high');
      e.node.classList.remove('delin-NOThigh');
    });
  }

  static applyMouseOutPresentation(element, isSelected) {
    (element.length ? element : [element]).forEach((e) => {
      e.node.classList.remove('delin-high');
      e.node.classList.add('delin-NOThigh');
    });
    if (isSelected) {
      ViewerManager.applySelectedPresentation(element);
    } else {
      ViewerManager.applyUnselectedPresentation(element);
    }
  }

  static applySelectedPresentation(element) {
    const fillOpacity =
      !ViewerManager.status.displayAreas || ViewerManager.status.regionsOpacity < 0.05
        ? 0
        : ViewerManager.status.regionsOpacity + (ViewerManager.status.regionsOpacity > 0.6 ? -0.4 : 0.4);
    const strokeOpacity = ViewerManager.status.showRegions ? 0.7 : 0;
    element.attr({
      'fill-opacity': fillOpacity,
      'stroke-opacity': strokeOpacity,
      'stroke-width': '3px',
      stroke: '#0000ff',
    });
    (element.length ? element : [element]).forEach((e) => {
      e.node.classList.add('delin-select');
      e.node.classList.remove('delin-NOTselect');
    });
  }

  static applyUnselectedPresentation(element) {
    const el = element.length ? element[0] : element;
    const color =
      ViewerManager.status.displayBorders && ViewerManager.status.useCustomBorders
        ? ViewerManager.status.customBorderColor
        : el.node.getAttribute('fill');
    const fillOpacity = ViewerManager.status.displayAreas ? ViewerManager.status.regionsOpacity : 0;
    const strokeOpacity = ViewerManager.status.displayBorders ? 0.5 : 0;
    const strokeWidth = (ViewerManager.status.useCustomBorders ? ViewerManager.status.customBorderWidth : 2) + 'px';
    element.attr({
      'fill-opacity': fillOpacity,
      'stroke-opacity': strokeOpacity,
      'stroke-width': strokeWidth,
      stroke: color,
    });
    (element.length ? element : [element]).forEach((e) => {
      e.node.classList.remove('delin-select');
      e.node.classList.add('delin-NOTselect');
    });
  }

  static applyHiddenPresentation(element) {
    element.attr({
      'fill-opacity': 0,
      'stroke-opacity': 0,
    });
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
  static selectRegions(nameList) {
    if (ViewerManager.status.set) {
      const that = ViewerManager;

      // apply presentation for selected regions
      ViewerManager.status.set.forEach((el) => {
        const regionInfo = that.status.currentSliceRegions.get(el.id);
        const abbrev = regionInfo ? regionInfo.abbrev : null;
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

  static centerOnRegions(nameList) {
    const that = ViewerManager;
    //how to choose a center?
    var newX = 0;
    var newY = 0;
    var snCount = 0;
    for (var k = 0; k < nameList.length; k++) {
      //try to find the nodes -> slow way!
      ViewerManager.status.set.forEach((el) => {
        const subNode = el[0];
        const regionInfo = that.status.currentSliceRegions.get(el.id);
        if (regionInfo && regionInfo.abbrev == nameList[k]) {
          snCount++;
          const bbox = subNode.getBBox();
          newX += (bbox.x2 - bbox.width / 2) / that.config.dzWidth;
          newY += (that.config.dzDiff + bbox.y2 - bbox.height / 2) / that.config.dzHeight;
        }
      });
    }
    if (snCount > 0) {
      newX /= snCount;
      newY /= snCount;
      var windowPoint = new OpenSeadragon.Point(newX, newY);
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

  static setLastSelectedPath(pathId) {
    ViewerManager.status.lastSelectedPath = pathId;
  }

  static getCurrentSliceRegions() {
    return ViewerManager.status ? ViewerManager.status.currentSliceRegions : null;
  }

  static switchPlane(newPlane) {
    //allow switching to another plane only if it exits!
    if (ViewerManager.config.hasPlane(newPlane)) {
      ViewerManager.status.activePlane = newPlane;
      ViewerManager.config.setPlaneSizes(ViewerManager.status.activePlane);
      ViewerManager.status.chosenSlice = ViewerManager.getCurrentPlaneChosenSlice();

      ViewerManager.viewer.goToPage(ViewerManager.getPageNumForCurrentSlice());
      ViewerManager.claerPosition();
      return true;
    } else {
      return false;
    }
  }

  static getActivePlane() {
    return ViewerManager.status.activePlane;
  }

  static activatePlane(newPlane) {
    if (newPlane !== ViewerManager.status.activePlane) {
      ViewerManager.switchPlane(newPlane);

      //change must be recorded (immediately) in browser's history
      ViewerManager.makeActualHistoryStep({ s: ViewerManager.status.chosenSlice, a: ViewerManager.status.activePlane });
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static getPlaneSlideCount(plane) {
    switch (plane) {
      case ZAVConfig.AXIAL:
        return ViewerManager.config.axialSlideCount;
      case ZAVConfig.CORONAL:
        return ViewerManager.config.coronalSlideCount;
      case ZAVConfig.SAGITTAL:
        return ViewerManager.config.sagittalSlideCount;
    }
  }

  static getPlaneSliceStep(plane) {
    switch (plane) {
      case ZAVConfig.AXIAL:
        return ViewerManager.config.axialSliceStep;
      case ZAVConfig.CORONAL:
        return ViewerManager.config.coronalSliceStep;
      case ZAVConfig.SAGITTAL:
        return ViewerManager.config.sagittalSliceStep;
    }
  }

  static getCurrentPlaneChosenSlice() {
    const chosenSlice = ViewerManager.getPlaneChosenSlice(ViewerManager.status.activePlane);
    return chosenSlice;
  }

  static getPlaneChosenSlice(plane) {
    switch (plane) {
      case ZAVConfig.AXIAL:
        return ViewerManager.status.axialChosenSlice;
      case ZAVConfig.CORONAL:
        return ViewerManager.status.coronalChosenSlice;
      case ZAVConfig.SAGITTAL:
        return ViewerManager.status.sagittalChosenSlice;
    }
  }

  static getPageNumForCurrentPlaneSlice(sliceNum) {
    return ViewerManager.getPageNumForPlaneSlice(ViewerManager.status.activePlane, sliceNum);
  }

  static getPageNumForPlaneSlice(plane, sliceNum) {
    switch (plane) {
      case ZAVConfig.AXIAL:
        return ViewerManager.config.axialFirstIndex + sliceNum;
      case ZAVConfig.CORONAL:
        return ViewerManager.config.coronalFirstIndex + sliceNum;
      case ZAVConfig.SAGITTAL:
        return ViewerManager.config.sagittalFirstIndex + sliceNum;
    }
  }

  static getPageNumForCurrentSlice() {
    return ViewerManager.getPageNumForCurrentPlaneSlice(ViewerManager.getCurrentPlaneChosenSlice());
  }

  static checkNSetChosenSlice(plane, chosenSlice) {
    switch (plane) {
      case ZAVConfig.AXIAL:
        if (chosenSlice > ViewerManager.config.axialSlideCount - 1) {
          chosenSlice = ViewerManager.config.axialSlideCount - 1;
        } else if (chosenSlice < 0) {
          chosenSlice = 0;
        }
        ViewerManager.status.axialChosenSlice = chosenSlice;
        return chosenSlice;

      case ZAVConfig.CORONAL:
        if (chosenSlice > ViewerManager.config.coronalSlideCount - 1) {
          chosenSlice = ViewerManager.config.coronalSlideCount - 1;
        } else if (chosenSlice < 0) {
          chosenSlice = 0;
        }
        ViewerManager.status.coronalChosenSlice = chosenSlice;
        return chosenSlice;

      case ZAVConfig.SAGITTAL:
        if (chosenSlice > ViewerManager.config.sagittalSlideCount - 1) {
          chosenSlice = ViewerManager.config.sagittalSlideCount - 1;
        } else if (chosenSlice < 0) {
          chosenSlice = 0;
        }
        ViewerManager.status.sagittalChosenSlice = chosenSlice;
        return chosenSlice;
    }
  }

  /**
   * @public
   */
  static goToPlaneSlice(plane, chosenSlice, regionsToCenterOn, force) {
    //TODO use plane

    const focusRoi = regionsToCenterOn && typeof regionsToCenterOn == 'object' && regionsToCenterOn.roiId;
    if (
      force ||
      plane != ViewerManager.status.activePlane ||
      chosenSlice != ViewerManager.getCurrentPlaneChosenSlice() ||
      focusRoi
    ) {
      ViewerManager.status.activePlane = plane;
      chosenSlice = ViewerManager.checkNSetChosenSlice(plane, chosenSlice);
      ViewerManager.status.chosenSlice = chosenSlice;

      //asynchronous focus the view on specified regions of interest
      if (regionsToCenterOn) {
        const that = ViewerManager;
        ViewerManager.eventSource.addOnceHandler('zav-regions-created', (event) => {
          if (focusRoi) {
            that.centerOnROI(focusRoi);
          } else {
            that.centerOnRegions(regionsToCenterOn);
          }
        });
      }

      const pageNum = ViewerManager.getPageNumForCurrentSlice();
      ViewerManager.viewer.goToPage(pageNum);

      //change must be recorded (immediately) in browser's history
      ViewerManager.makeActualHistoryStep({ s: chosenSlice, a: ViewerManager.status.activePlane });

      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  static goToSlice(chosenSlice, regionsToCenterOn, force) {
    ViewerManager.goToPlaneSlice(ViewerManager.status.activePlane, chosenSlice, regionsToCenterOn, force);
  }

  static shiftToSlice(increment, force) {
    ViewerManager.goToPlaneSlice(
      ViewerManager.status.activePlane,
      ViewerManager.status.chosenSlice + increment,
      null,
      force,
    );
  }

  static changeSlices(slicesByPlane) {
    //for all planes but the active one
    for (const [p, slice] of Object.entries(slicesByPlane)) {
      const plane = parseInt(p);
      if (plane != ViewerManager.status.activePlane) {
        ViewerManager.checkNSetChosenSlice(plane, slice);
      }
    }

    //eventually change active plane's slice
    if (_.has(slicesByPlane, ViewerManager.status.activePlane)) {
      ViewerManager.goToPlaneSlice(ViewerManager.status.activePlane, slicesByPlane[ViewerManager.status.activePlane]);
    } else {
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  //get point in physical space coordinates from specified image coordinates
  static getPoint(x, y) {
    const tx = ViewerManager.config.imageSize - x;
    const ty = ViewerManager.config.imageSize - y;
    const point = [
      tx,
      ViewerManager.getPlaneChosenSlice(ViewerManager.status.activePlane) *
        ViewerManager.getPlaneSliceStep(ViewerManager.status.activePlane),
      ty,
      1,
    ];
    //return multiplyMatrixAndPoint(point);
    const result = [0, 0, 0, 0];
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        result[i] += ViewerManager.config.matrix[i * 4 + j] * point[j];
      }
    }
    return result;
  }

  static getPointXY(x, y) {
    var pos = ViewerManager.getPoint(x, y);
    return { x: pos[0], y: pos[2] };
  }

  static mousemoveHandler(event) {
    if (ViewerManager.viewer.currentOverlays[0] == null) {
      return;
    }
    var rect = ViewerManager.viewer.canvas.getBoundingClientRect();
    var zoom =
      ViewerManager.viewer.viewport.getZoom(true) *
      (ViewerManager.viewer.canvas.clientWidth / ViewerManager.config.imageSize);
    // update current position of pointer in local (DOM content) coordinates
    ViewerManager.status.position[0].x = event.clientX;
    ViewerManager.status.position[0].y = event.clientY;
    var orig = ViewerManager.viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
    // convert to coordinates in image space
    var x = (ViewerManager.status.position[0].x - orig.x - rect.left) / zoom;
    var y = (ViewerManager.status.position[0].y - orig.y - rect.top) / zoom;

    //update clipping box when clip selection has started
    if (ViewerManager.status.clippingModeOn && ViewerManager.status.position[0].c == 1) {
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

  static onViewerScroll(event) {
    // Disable mousewheel zoom on the viewer and let the original mousewheel events bubble
    // if (!event.isTouchEvent) {
    //     event.preventDefaultAction = true;
    //     return true;
    // }
  }

  static onViewerClick(event) {
    // Disable click zoom on the viewer using event.preventDefaultAction
    event.preventDefaultAction = true;
    event.stopBubbling = true;
  }

  static onViewerDrag(event) {
    // Disable panning on the viewer when a region is selected for edition
    if (ViewerManager.status.editModeOn && ViewerManager.status.editPathId) {
      event.preventDefaultAction = true;
    }
  }

  static onViewerKey(event) {
    // Disable keyboard shortcuts on the viewer using event.preventDefaultAction
    event.preventDefaultAction = true;
    event.stopBubbling = true;
  }

  static getLayerOpacity(key) {
    var opacity = 0;
    if (ViewerManager.config.layers[key]) {
      if (ViewerManager.status.layerDisplaySettings[key].enabled) {
        opacity = ViewerManager.status.layerDisplaySettings[key].opacity / 100;
      }
    }
    return opacity;
  }

  /**
   * Refresh effective opacity of the layer stack including and below the specified one,
   * and returns the id of refreshed layers
   *
   *   Effective opacity of a layer is zero (to prevent it from being loaded by OSD),
   *   when any fully opaque layer above it renders it invisible.
   *   (Assuming that there's no transparent color in the layer images, except for tracer layer)
   */
  static refreshLayersEffectiveOpacity(startLayerKey) {
    const opacities = [];
    let hasOpaqueLayerAbove = false;

    let skip = true;
    Object.keys(ViewerManager.config.layers)
      // from top to bottom
      .reverse()
      // iterate over layers
      .forEach((currentLayerKey) => {
        const isStartingLayer = currentLayerKey == startLayerKey;
        const currentlayer = ViewerManager.status.layerDisplaySettings[currentLayerKey];

        //skip computing opacity for layer above the specified one
        skip = skip && !isStartingLayer;

        if (!skip) {
          //effective opacity is set to 0 when layer is disabled or covered by another layer above it
          currentlayer.effectiveOpacity = !hasOpaqueLayerAbove && currentlayer.enabled ? currentlayer.opacity / 100 : 0;
          opacities.push(currentLayerKey);
        }

        //check if the current layer is hidding the one below
        if (!hasOpaqueLayerAbove) {
          //layeris enabled and fully opaque and not a tracer layer (which has alpha values),
          hasOpaqueLayerAbove = !currentlayer.isTracer && currentlayer.enabled && currentlayer.opacity == 100;
        }
      });

    return opacities;
  }

  static setLayerOpacity(key) {
    if (ViewerManager.config.layers[key]) {
      //Update the effective opacity of the specified layer and the ones below
      ViewerManager.refreshLayersEffectiveOpacity(key).forEach((layerKey) => {
        const layerInfo = ViewerManager.status.layerDisplaySettings[layerKey];
        const layerIndex = ViewerManager.config.layers[layerKey].index;

        const viewerLayer = ViewerManager.viewer.world.getItemAt(layerIndex);
        if (viewerLayer) {
          viewerLayer.setOpacity(layerInfo.effectiveOpacity);

          if (layerInfo.effectiveOpacity == 0) {
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

  static getRegionsSVGEditUrl(extraParams) {
    const sliceNum = ViewerManager.getCurrentPlaneChosenSlice();
    const url = new URL(Utils.makePath(ViewerManager.config.ADMIN_PATH, 'SVG.php'), window.location);
    const params = ViewerManager.config.viewerId
      ? {
          dataset: ViewerManager.config.viewerId,
          plane: ViewerManager.status.activePlane,
        }
      : {};
    _.extend(params, { slice: ViewerManager.getCurrentPlaneChosenSlice() });
    if (extraParams) {
      _.extend(params, extraParams);
    }
    url.search = new URLSearchParams(params).toString();
    return url.toString();
  }

  static getRegionsSVGUrl(extraParams) {
    if (ViewerManager.status.editModeOn) {
      return ViewerManager.getRegionsSVGEditUrl(extraParams);
    } else {
      const sliceNum = ViewerManager.getCurrentPlaneChosenSlice();
      const svgurl = Utils.makePath(
        ViewerManager.config.PUBLISH_PATH,
        ViewerManager.config.svgFolderName,
        ViewerManager.config.hasMultiPlanes ? ZAVConfig.getPlaneName(ViewerManager.status.activePlane) : null,
        'Anno_' + sliceNum + '.svg' + (ViewerManager.config.dataVersionTag ? ViewerManager.config.dataVersionTag : ''),
      );
      return svgurl;
    }
  }

  static getFileTileSourceUrl(slideNum, key, ext, plane) {
    //if no plane param is specified (= single plane mode), returned plane label will be undefined, thus the url won't contain reference to any plane
    return Utils.makePath(ViewerManager.config.dataRootPath, key, ZAVConfig.getPlaneName(plane), slideNum + ext);
  }

  /**
   * compute url to retrieve a specific tile stored in file folders (no backend image server)
   */
  static getFileTileUrl(slideNum, key, ext, level, x, y) {
    switch (ViewerManager.status.activePlane) {
      case ZAVConfig.AXIAL:
        slideNum -= ViewerManager.config.axialFirstIndex;
        break;
      case ZAVConfig.CORONAL:
        slideNum -= ViewerManager.config.coronalFirstIndex;
        break;
      case ZAVConfig.SAGITTAL:
        slideNum -= ViewerManager.config.sagittalFirstIndex;
        break;
    }
    return (
      ViewerManager.config.dataRootPath +
      '/' +
      key +
      (ViewerManager.config.hasMultiPlanes ? '/' + ZAVConfig.getPlaneName(ViewerManager.status.activePlane) : '') +
      '/' +
      slideNum +
      '_files/' +
      level +
      '/' +
      x +
      '_' +
      y +
      '.' +
      ViewerManager.status.tileFormat
    );
  }

  static getIIIFTileSourceUrl(slideNum, key, ext) {
    return ViewerManager.config.IIPSERVER_PATH + key + '/' + slideNum + ext + ViewerManager.config.TILE_EXTENSION;
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
  static getIIPTileUrl(slideNum, key, ext, level, x, y) {
    const xTilesNum = Math.ceil(
      ViewerManager.status.iipTileInfos.xTilesNumAtMaxLevel * ViewerManager.status.iipTileInfos.levelScale[level],
    );
    const layerDispSettings = ViewerManager.status.layerDisplaySettings[key];
    return (
      ViewerManager.status.IIPSVR_PATH +
      key +
      '/' +
      slideNum +
      ext +
      (layerDispSettings.useIIProtocol && layerDispSettings.gammaEnabled ? '&GAM=' + layerDispSettings.gamma : '') +
      (layerDispSettings.useIIProtocol && layerDispSettings.contrastEnabled
        ? '&CNT=' + layerDispSettings.contrast
        : '') +
      // + "&WID=" + this.status.iipTileInfos.tileWidth + "&HEI=" + this.status.iipTileInfos.tileHeight
      '&JTL=' +
      (level ? level : '0') +
      ',' +
      (y * xTilesNum + x)
    );
  }

  static getTileSourceDef(key, ext) {
    const currentPage = ViewerManager.getPageNumForCurrentSlice();
    if (ViewerManager.config.hasBackend) {
      const layerDispSettings = ViewerManager.status.layerDisplaySettings[key];
      if (layerDispSettings.useIIProtocol) {
        return {
          width: ViewerManager.status.iipTileInfos.imageWidth,
          height: ViewerManager.status.iipTileInfos.imgeHeight,
          tileWidth: ViewerManager.status.iipTileInfos.tileWidth,
          tileHeight: ViewerManager.status.iipTileInfos.tileHeight,

          overlap: 1,

          maxLevel: ViewerManager.status.iipTileInfos.maxLevel,
          minLevel: ViewerManager.status.iipTileInfos.minLevel,
          getTileUrl: (level, x, y) =>
            ViewerManager.getIIPTileUrl(ViewerManager.getPageNumForCurrentSlice(), key, ext, level, x, y),
        };
      } else {
        return ViewerManager.getIIIFTileSourceUrl(currentPage, key, ext);
      }
    } else {
      return {
        width: ViewerManager.config.dzLayerWidth,
        height: ViewerManager.config.dzLayerHeight,
        tileSize: ViewerManager.status.tileSize,
        overlap: ViewerManager.status.tileOverlap,
        tileFormat: ViewerManager.status.tileFormat,

        //minLevel: 0,
        //maxLevel: 10, //maxLevel should correspond to the depth of the number of folders in the dzi subdirectory

        getTileUrl: (level, x, y) => ViewerManager.getFileTileUrl(currentPage, key, ext, level, x, y),
      };
    }
  }

  /**
   * Called once 1rst layer is opened to add other layers
   */
  static addLayer(key, name, ext) {
    var options = {
      tileSource: ViewerManager.getTileSourceDef(key, ext),
      opacity: ViewerManager.getLayerOpacity(key),
      success: (event) => ViewerManager.setAllFilters(),

      //force labelMap layer's tiles loading even when the image is hidden by zero opacity
      preload: ViewerManager.status.layerDisplaySettings[key].isLabelMap,
    };

    ViewerManager.viewer.addTiledImage(options);
  }

  static changeLayerOpacity(layerid, enabled, opacity) {
    if (ViewerManager.config.layers[layerid]) {
      ViewerManager.status.layerDisplaySettings[layerid].enabled = enabled;
      ViewerManager.status.layerDisplaySettings[layerid].opacity = opacity;
      ViewerManager.setLayerOpacity(layerid);
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  /** adjust filters to the new zoom factor */
  static adjustFiltersAfterZoom(zoom) {
    const tracerLayer = _.findWhere(ViewerManager.status.layerDisplaySettings, { isTracer: true });
    if (tracerLayer) {
      const newDilationSize = zoom > 2.5 ? 0 : zoom > 1.5 ? 3 : zoom > 0.3 ? 5 : 7;
      tracerLayer.autoDilation = newDilationSize;

      //change filters only if dilation kernel size changed
      if (newDilationSize != tracerLayer.dilation && !tracerLayer.manualEnhancing) {
        tracerLayer.dilation = newDilationSize;
        if (tracerLayer.enhanceSignal) {
          ViewerManager.setAllFilters();
        }
      }
    }
  }

  /** reset filters : the plugin API allows only to set all processors for all tiled images at once  */
  static setAllFilters() {
    const filters = [];
    let tracerNum = 0;
    Object.values(ViewerManager.status.layerDisplaySettings).forEach((layer) => {
      const processors = [];

      if (layer.isTracer) {
        //change filters only if dilation kernel size changed
        if (layer.enhanceSignal && layer.dilation > 0) {
          processors.push(OpenSeadragon.Filters.MORPHOLOGICAL_OPERATION(layer.dilation, Math.max));
        }
        processors.push(CustomFilters.INTENSITYALPHA(tracerNum));
        tracerNum++;
      } else {
        if (!layer.useIIProtocol) {
          if (layer.contrastEnabled) {
            processors.push(OpenSeadragon.Filters.CONTRAST(layer.contrast));
          }
          if (layer.gammaEnabled) {
            processors.push(OpenSeadragon.Filters.GAMMA(layer.gamma));
          }
        }
      }

      if (processors.length) {
        const tiledImage = ViewerManager.viewer.world.getItemAt(layer.index);
        filters.push({
          items: tiledImage,
          processors: processors,
        });
      }
    });
    ViewerManager.viewer.setFilterOptions({
      filters: filters,
    });
  }

  static resetTiledImageCache(layerid) {
    const layerIndex = Object.keys(ViewerManager.status.layerDisplaySettings).findIndex((id) => id === layerid);

    var tiledImage = ViewerManager.viewer.world.getItemAt(layerIndex);
    var tiledImageSource = tiledImage.source;

    //Force update tiles's url for those already in viewer's tile matrix
    Object.entries(tiledImage.tilesMatrix).forEach(([level, levelTiles]) =>
      Object.entries(levelTiles).forEach(([x, xTiles]) =>
        Object.entries(xTiles).forEach(([y, tile]) => {
          const newTileUrl = tiledImageSource.getTileUrl(parseInt(level), parseInt(x), parseInt(y));
          if (tile.url !== newTileUrl) {
            tile.exists = true;
            tile.loaded = false;
            //update tile url that otherwise would still use previous image adjustement param values
            tile.url = newTileUrl;
          }
        }),
      ),
    );

    //clears all of the current (cached) tiles and sets it to reload.
    tiledImage.reset();
  }

  static changeLayerContrast(layerid, enabled, contrast) {
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

  static changeLayerGamma(layerid, enabled, gamma) {
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

  static changeLayerDilation(layerid, enabled, manualEnhancing, dilation) {
    if (ViewerManager.config.layers[layerid]) {
      const layerSettings = ViewerManager.status.layerDisplaySettings[layerid];

      if (layerSettings.enhanceSignal != enabled) {
        if (!enabled) {
          layerSettings.dilation = layerSettings.autoDilation;
          layerSettings.manualEnhancing = false;
        }
        layerSettings.enhanceSignal = enabled;
      }

      //just enabled or disabled manual setting of dilation value
      else if (layerSettings.manualEnhancing != manualEnhancing) {
        //reset dilation to previous value in corresponding mode
        if (manualEnhancing) {
          layerSettings.dilation = layerSettings.manualDilation;
        } else {
          layerSettings.dilation = layerSettings.autoDilation;
        }
        layerSettings.manualEnhancing = manualEnhancing;
      }
      //just manually changed value of dilation
      else if (manualEnhancing) {
        //dilation kernel size must be an odd number
        layerSettings.manualDilation = dilation == 0 ? dilation : Math.floor(dilation / 2) * 2 + 1;
        layerSettings.dilation = layerSettings.manualDilation;
      }

      ViewerManager.setAllFilters();
      ViewerManager.signalStatusChanged(ViewerManager.status);
    }
  }

  //--------------------------------------------------
  // position
  static resizeCanvas() {
    const posCanvas = document.getElementById('poscanvas');
    posCanvas.setAttribute('width', ViewerManager.viewer.canvas.clientWidth);
    posCanvas.setAttribute('height', ViewerManager.viewer.canvas.clientHeight);
    ViewerManager.refreshCanvasContent();

    if (ViewerManager.viewer.referenceStrip) {
      //FIXME resetReferenceStrip();
    }
  }

  static pointerdownHandler(event) {
    ViewerManager.status.pointerdownpos.x = event.clientX;
    ViewerManager.status.pointerdownpos.y = event.clientY;
  }

  static pointerupHandler(event) {
    //
    const posCanvas = document.getElementById('poscanvas');
    if (ViewerManager.viewer.currentOverlays.length == 0 || posCanvas.style.display == 'none') {
      return;
    }

    //prevent recording another point if a dragging gesture is occuring
    if (
      ViewerManager.status.pointerdownpos.x > event.clientX + 5 ||
      ViewerManager.status.pointerdownpos.x < event.clientX - 5 ||
      ViewerManager.status.pointerdownpos.y > event.clientY + 5 ||
      ViewerManager.status.pointerdownpos.y < event.clientY - 5
    ) {
      return;
    }

    if (ViewerManager.status.measureModeOn || ViewerManager.status.clippingModeOn) {
      //already 2 points recorded, reset measuring line
      if (ViewerManager.status.position[0].c == 2) {
        ViewerManager.resetPositionview();
        ViewerManager.viewer.drawer.clear();
        ViewerManager.viewer.world.draw();
        ViewerManager.refreshCanvasContent();
        return;
      }

      var orig = ViewerManager.viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
      var rect = ViewerManager.viewer.canvas.getBoundingClientRect();
      //var zoom = viewer.viewport.getZoom(true);
      var zoom =
        ViewerManager.viewer.viewport.getZoom(true) *
        (ViewerManager.viewer.canvas.clientWidth / ViewerManager.config.imageSize);

      //record next point for measuring line feature
      var x = (event.clientX - orig.x - rect.left) / zoom;
      var y = (event.clientY - orig.y - rect.top) / zoom;
      ViewerManager.status.position[0].c++;
      ViewerManager.status.position[ViewerManager.status.position[0].c].x = x;
      ViewerManager.status.position[ViewerManager.status.position[0].c].y = y;

      //init second position with first one in order to draw initial clipbox
      if (1 == ViewerManager.status.position[0].c) {
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
    if (ViewerManager.viewer.currentOverlays[0] == null) {
      return;
    }
    if (!ViewerManager.config.matrix) {
      return;
    }
    const posCanvas = document.getElementById('poscanvas');
    if (ViewerManager.status.ctx == null && posCanvas) {
      ViewerManager.status.ctx = posCanvas.getContext('2d');
    }

    var orig = ViewerManager.viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
    var rect = ViewerManager.viewer.canvas.getBoundingClientRect();

    var zoom =
      ViewerManager.viewer.viewport.getZoom(true) *
      (ViewerManager.viewer.canvas.clientWidth / ViewerManager.config.imageSize);
    var x = (ViewerManager.status.position[0].x - orig.x - rect.left) / zoom;
    var y = (ViewerManager.status.position[0].y - orig.y - rect.top) / zoom;

    ViewerManager.status.livePosition = ViewerManager.getPoint(x, y);
    ViewerManager.signalStatusChanged(ViewerManager.status);
    if (!ViewerManager.status.measureModeOn) {
      return;
    }

    ViewerManager.status.ctx.clearRect(0, 0, posCanvas.width, posCanvas.height);

    // distance line
    if (ViewerManager.status.position[0].c == 2) {
      var px1 = Math.round(ViewerManager.status.position[1].x * zoom + orig.x + 0.5) - 0.5;
      var py1 = Math.round(ViewerManager.status.position[1].y * zoom + orig.y + 0.5) - 0.5;
      var px2 = Math.round(ViewerManager.status.position[2].x * zoom + orig.x + 0.5) - 0.5;
      var py2 = Math.round(ViewerManager.status.position[2].y * zoom + orig.y + 0.5) - 0.5;
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
    if (ViewerManager.status.position[0].c != 0) {
      ViewerManager.status.ctx.beginPath();
      ViewerManager.status.ctx.setLineDash([]);
      ViewerManager.status.ctx.lineWidth = 1;
      ViewerManager.status.ctx.lineCap = 'butt';
      ViewerManager.status.ctx.strokeStyle = '#000';
      for (var i = 1; i <= ViewerManager.status.position[0].c; i++) {
        var px = Math.round(ViewerManager.status.position[i].x * zoom + orig.x + 0.5) + 0.5;
        var py = Math.round(ViewerManager.status.position[i].y * zoom + orig.y + 0.5) + 0.5;
        ViewerManager.status.ctx.moveTo(px, py - 10);
        ViewerManager.status.ctx.lineTo(px, py + 10);
        ViewerManager.status.ctx.moveTo(px - 10, py);
        ViewerManager.status.ctx.lineTo(px + 10, py);
      }
      ViewerManager.status.ctx.stroke();

      for (var i = 1; i <= ViewerManager.status.position[0].c; i++) {
        ViewerManager.status.ctx.beginPath();
        ViewerManager.status.ctx.strokeStyle = ViewerManager.status.markedPosColors[i - 1];
        var px = Math.round(ViewerManager.status.position[i].x * zoom + orig.x + 0.5) - 0.5;
        var py = Math.round(ViewerManager.status.position[i].y * zoom + orig.y + 0.5) - 0.5;
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
    ViewerManager.viewer.drawer.clear();
    ViewerManager.viewer.world.draw();
    ViewerManager.refreshCanvasContent();
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

  static setMeasureMode(active) {
    ViewerManager.claerPosition();
    if (active) {
      //measurement mode and display of regions are mutually exclusive
      ViewerManager.hideRegions();
      ViewerManager.status.clippingModeOn = false;
    }
    ViewerManager.status.measureModeOn = active;
    const posCanvas = document.getElementById('poscanvas');
    if (ViewerManager.status.measureModeOn) {
      posCanvas.style.display = 'block';
    } else {
      posCanvas.style.display = 'none';
    }
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static isMeasureModeOn() {
    return ViewerManager.status && ViewerManager.status.measureModeOn;
  }

  static displayClipBox() {
    if (ViewerManager.viewer.currentOverlays[0] == null) {
      return;
    }
    if (!ViewerManager.status.clippingModeOn) {
      return;
    }
    const posCanvas = document.getElementById('poscanvas');
    if (ViewerManager.status.ctx == null) {
      ViewerManager.status.ctx = posCanvas.getContext('2d');
    }

    ViewerManager.status.ctx.clearRect(0, 0, posCanvas.width, posCanvas.height);

    //clip box
    if (ViewerManager.status.position[0].c != 0) {
      const orig = ViewerManager.viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
      const zoom =
        ViewerManager.viewer.viewport.getZoom(true) *
        (ViewerManager.viewer.canvas.clientWidth / ViewerManager.config.imageSize);

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
      if (ViewerManager.status.position[0].c == 2) {
        ViewerManager.status.ctx.setLineDash([]);
        ViewerManager.status.ctx.lineWidth = 1;

        if (!ViewerManager.status.processedImage) {
          ViewerManager.status.ctx.strokeStyle = '#0000ff';
        } else {
          //override clip dimension by actually computed result (scaled to current zoom factor)
          const sf = ViewerManager.getZoomFactor() / ViewerManager.status.processedZoom;
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
      const clipSizeConstraints = selectedProc && selectedProc.inputSize ? selectedProc.inputSize : null;
      const constraintType = clipSizeConstraints
        ? clipSizeConstraints.constraint
          ? clipSizeConstraints.constraint
          : 'none'
        : null;

      //extra right-bottom space of the clipped area that won't be used for actual processing
      let extraWidth = 0;
      let extraHeight = 0;

      //take into account size constraints, unless processings already done
      if (constraintType && !ViewerManager.status.processedImage) {
        if (constraintType == 'fixed') {
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
        } else if (constraintType == 'ratio') {
          // keep constant width/height ratio
          const multW = clipSizeConstraints.width ? Math.floor(clipWidth / clipSizeConstraints.width) : Infinity;
          const multH = clipSizeConstraints.height ? Math.floor(clipHeight / clipSizeConstraints.height) : Infinity;
          const mult = Math.min(multW, multH);
          if (mult == Infinity) {
            extraWidth = clipWidth;
            extraHeight = clipHeight;
          } else {
            extraWidth = clipWidth - clipSizeConstraints.width * mult;
            extraHeight = clipHeight - clipSizeConstraints.height * mult;
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
        for (var offX = blockSize; offX < constrainedClipWidth; offX += blockSize) {
          ViewerManager.status.ctx.moveTo(lx + offX, ty);
          ViewerManager.status.ctx.lineTo(lx + offX, ty + constrainedClipHeight);
        }
        for (var offY = blockSize; offY < constrainedClipHeight; offY += blockSize) {
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

      if (vty != ty) {
        //top border
        ViewerManager.status.ctx.moveTo(vlx, vty);
        ViewerManager.status.ctx.lineTo(vrx, vty);
        ViewerManager.status.ctx.stroke();
      }
      if (vlx != lx) {
        //left border
        ViewerManager.status.ctx.moveTo(vlx, vty);
        ViewerManager.status.ctx.lineTo(vlx, vby);
        ViewerManager.status.ctx.stroke();
      }
      if (vby != by) {
        //bottom border
        ViewerManager.status.ctx.moveTo(vlx, vby);
        ViewerManager.status.ctx.lineTo(vrx, vby);
        ViewerManager.status.ctx.stroke();
      }
      if (vrx != rx) {
        //right border

        //right panel might be covering OSD canvas, so warning line should be drawn at the panel limit
        const rightPanelWidth = document.getElementById('ZAV-rightPanel').getBoundingClientRect().width;
        ViewerManager.status.ctx.moveTo(vrx - rightPanelWidth, vty);
        ViewerManager.status.ctx.lineTo(vrx - rightPanelWidth, vby);
        ViewerManager.status.ctx.stroke();
      }

      ViewerManager.status.ctx.setLineDash([]);
    }
  }

  static drawProcessingResult(clipOrigX, clipOrigY, clipWidth, clipHeight) {
    //if the result of previous processing is still available, display it on top of layers
    if (ViewerManager.status.processedImage) {
      const sf = ViewerManager.getZoomFactor() / ViewerManager.status.processedZoom;
      const deltaSF = 1 - sf;
      const needScaling = Math.abs(deltaSF) > Number.EPSILON;
      if (needScaling) {
        //image was computed at different scale factor, so it needs to be scaled
        ViewerManager.status.ctx.translate(deltaSF * clipOrigX, deltaSF * clipOrigY);
        ViewerManager.status.ctx.scale(sf, sf);
      }
      //draw computed image on top of layers
      ViewerManager.status.ctx.drawImage(ViewerManager.status.processedImage, clipOrigX, clipOrigY);

      if (needScaling) {
        ViewerManager.status.ctx.resetTransform();
      }
      return !needScaling;
    }
  }

  static setSelectClip(active) {
    ViewerManager.claerPosition();
    ViewerManager.status.processedImage = null;
    if (active) {
      //this.viewer.zoomPerScroll =1;
      ViewerManager.hideRegions();
      ViewerManager.status.measureModeOn = false;
    }
    ViewerManager.status.clippingModeOn = active;
    const posCanvas = document.getElementById('poscanvas');
    if (active) {
      posCanvas.style.display = 'block';
    } else {
      posCanvas.style.display = 'none';
    }
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static isSelectClipModeOn() {
    return ViewerManager.status && ViewerManager.status.clippingModeOn;
  }

  static isClipSelected() {
    return ViewerManager.status && ViewerManager.status.clippingModeOn && ViewerManager.status.position[0].c == 2;
  }

  static isZoomEnabled() {
    return ViewerManager.viewer && 1.0 != ViewerManager.viewer.zoomPerScroll;
  }

  static setZoomEnabled(active) {
    if (active) {
      ViewerManager.viewer.zoomPerScroll = ViewerManager.status.prevZoomPerScroll;
      ViewerManager.viewer.zoomPerClick = ViewerManager.status.prevZoomPerClick;
    } else {
      ViewerManager.status.prevZoomPerScroll = ViewerManager.viewer.zoomPerScroll;
      ViewerManager.viewer.zoomPerScroll = 1.0;
      ViewerManager.status.prevZoomPerClick = ViewerManager.viewer.zoomPerClick;
      ViewerManager.viewer.zoomPerClick = 1.0;
    }
    ViewerManager.signalStatusChanged(ViewerManager.status);
  }

  static getZoomFactor() {
    return ViewerManager.viewer && ViewerManager.viewer.world.getItemCount()
      ? (
          100 * ViewerManager.viewer.world.getItemAt(0).viewportToImageZoom(ViewerManager.viewer.viewport.getZoom(true))
        ).toFixed(3)
      : 0;
  }

  static setZoomFactor(zf) {
    if (ViewerManager.viewer) {
      const animDuration = ViewerManager.viewer.zoomPerSecond;
      ViewerManager.viewer.zoomPerSecond = 0.1;
      const viewportZoom = ViewerManager.viewer.viewport.imageToViewportZoom(zf / 100);
      ViewerManager.viewer.viewport.zoomTo(viewportZoom, null, true);
      ViewerManager.viewer.zoomPerSecond = animDuration;
    }
  }

  static goHome() {
    if (ViewerManager.viewer) {
      ViewerManager.viewer.viewport.goHome(false);
    }
  }

  static hasProcessingsModule() {
    return typeof globalThis.ZAVProcessings != 'undefined';
  }

  static hasProcessors() {
    return ViewerManager.hasProcessingsModule() && globalThis.ZAVProcessings.nbProcessors();
  }

  static getProcessors() {
    return ViewerManager.hasProcessingsModule() ? globalThis.ZAVProcessings.getProcessors() : [];
  }

  static getProcessor(procIndex) {
    if (ViewerManager.hasProcessingsModule()) {
      const procs = globalThis.ZAVProcessings.getProcessors();
      return procIndex < procs.length ? procs[procIndex] : null;
    } else {
      return null;
    }
  }

  static setSelectedProcessorIndex(procIndex) {
    const nbProcessors = ViewerManager.hasProcessingsModule() ? globalThis.ZAVProcessings.nbProcessors() : 0;
    if (procIndex < nbProcessors) {
      if (ViewerManager.status.selectedprocIndex != procIndex) {
        ViewerManager.status.selectedprocIndex = procIndex;
        //reset previous result and its associated clip box if any
        if (ViewerManager.status.processedImage) {
          ViewerManager.resetPositionview();
        }
        ViewerManager.displayClipBox();
      }
    }
  }

  static getSelectedProcessorIndex() {
    if (ViewerManager.hasProcessors() && ViewerManager.status) {
      if (typeof ViewerManager.status.selectedprocIndex == 'undefined') {
        ViewerManager.status.selectedprocIndex = 0;
      }
      return ViewerManager.status.selectedprocIndex;
    } else {
      return -1;
    }
  }

  static getSelectedProcessor() {
    const procIndex = ViewerManager.getSelectedProcessorIndex();
    if (procIndex >= 0) {
      return ViewerManager.getProcessor(procIndex);
    } else {
      return null;
    }
  }

  static getProcessedImage() {
    return ViewerManager.status && ViewerManager.status.processedImage;
  }

  static isProcessingActive() {
    return ViewerManager.status && ViewerManager.status.processingActive;
  }

  static performProcessing(procIndex) {
    if (ViewerManager.isClipSelected()) {
      ViewerManager.getProcessors();
      const proc = ViewerManager.getProcessor(procIndex);
      if (proc) {
        console.debug('Computing "' + proc.name + '"');

        //store zoom factor of the image about to be processed
        ViewerManager.status.processedZoom = ViewerManager.getZoomFactor();
        ViewerManager.status.processedRegion = ViewerManager.status.constrainedClippedRegion;
        ViewerManager.status.processedImage = null;
        ViewerManager.status.processedTopleftPx = null;

        //retrieve image data for custom processing
        const tilescanvas = ViewerManager.viewer.drawer.canvas;
        const ctx = tilescanvas.getContext('2d');

        //routine to perform processing on specified imageData
        const startProcessor = (imageData) => {
          console.debug(`start processor "${proc.name}" on ${imageData.width} x ${imageData.height} pixels`);

          //perform actual computation
          ViewerManager.status.processingActive = true;
          ViewerManager.status.longRunningMessage = 'Performing custom processing...';
          ViewerManager.signalStatusChanged(ViewerManager.status);

          try {
            proc
              .processImageData(imageData)
              .then((processedImageData) => {
                //if result is already an image, no conversion necessary
                if (Image.prototype.isPrototypeOf(processedImageData)) {
                  return processedImageData;
                } else {
                  //convert computed result as image object
                  return ViewerManager.imageDataToImage(processedImageData);
                }
              })
              .then((imageObj) => {
                imageObj.name =
                  proc.name +
                  //info to identify processed image clip (top-left pixel coords in orginal image and zoom value)
                  `-${ViewerManager.status.processedTopleftPx[0]},${ViewerManager.status.processedTopleftPx[1]}@${Math.round(ViewerManager.status.processedZoom * 100) / 100.0}-` +
                  new Date().toISOString().slice(0, 19).replaceAll(/[:-]/g, '');
                ViewerManager.status.processedImage = imageObj;
                ViewerManager.displayClipBox();
              })
              .catch((error) => {
                console.error(error);
                alert('An error occured:\n' + error);
                ViewerManager.signalStatusChanged(ViewerManager.status);
              })
              .finally(() => {
                ViewerManager.status.processingActive = false;
                ViewerManager.status.longRunningMessage = null;
                ViewerManager.signalStatusChanged(ViewerManager.status);
              });
          } catch (e) {
            alert('An error occured:\n' + e);
            ViewerManager.status.processingActive = false;
            ViewerManager.status.longRunningMessage = null;
            ViewerManager.signalStatusChanged(ViewerManager.status);
          }
        };

        //collect info to check if part of the clipped region is outside of the screen
        const bounds = ViewerManager.viewer.viewport.getBounds(true);
        const vpCoord1 = ViewerManager.viewer.viewport.imageToViewportCoordinates(
          ViewerManager.status.position[1].x,
          ViewerManager.status.position[1].y,
        );
        const vpCoord2 = ViewerManager.viewer.viewport.imageToViewportCoordinates(
          ViewerManager.status.position[2].x,
          ViewerManager.status.position[2].y,
        );
        const vlx = Math.min(vpCoord1.x, vpCoord2.x);
        const vrx = Math.max(vpCoord1.x, vpCoord2.x);
        const vty = Math.min(vpCoord1.y, vpCoord2.y);
        const vby = Math.max(vpCoord1.y, vpCoord2.y);

        const [lx, ty, w, h] = ViewerManager.status.processedRegion;

        ViewerManager.status.processedTopleftPx = [
          Math.round(ViewerManager.config.imageSize * vlx),
          Math.round(ViewerManager.config.imageSize * vty),
        ];

        if (vlx >= bounds.x && vty >= bounds.y && vrx <= bounds.x + bounds.width && vby <= bounds.y + bounds.height) {
          //clipped regions within viewport boundaries, complete clipped region imageData is available
          const imageData = ctx.getImageData(lx, ty, w, h);
          startProcessor(imageData);
        } else {
          //part of the clip is outside of the screen, necessary to pan the viewport to retreive complete imageData

          {
            //compute the panning moves (in row-major order) necessary to cover the clipped region at the current zoom level
            const panMoves = [];
            const halfWidth = bounds.width / 2;
            const halfHeight = bounds.height / 2;
            let row = 0;
            for (let panY = vty; panY < vby; panY += bounds.height, row++) {
              let col = 0;
              for (let panX = vlx; panX < vrx; panX += bounds.width, col++) {
                panMoves.push({
                  col: col,
                  row: row,
                  lastRow: panY + bounds.height >= vby,
                  lastCol: panX + bounds.width >= vrx,
                  point: new OpenSeadragon.Point(panX + halfWidth, panY + halfHeight),
                });
              }
            }
            const nbParts = panMoves.length;

            //dimension of imageData that can be collect at once
            const canvasWidth = tilescanvas.clientWidth;
            const canvasHeight = tilescanvas.clientHeight;

            //return a promise which collect image data
            const getDeferedCollectImageDataPromise = (imageDataArray, panMove) => {
              const collectImageData = () => {
                //collect only the necessary part of the canvas where the viewport is currently panned
                const partWidth = panMove.lastCol ? w - panMove.col * canvasWidth : canvasWidth;
                const partHeight = panMove.lastRow ? h - panMove.row * canvasHeight : canvasHeight;
                const imageData = ctx.getImageData(0, 0, partWidth, partHeight);
                imageDataArray.push({
                  data: imageData,
                  col: panMove.col,
                  row: panMove.row,
                });
                return imageDataArray;
              };

              return new Promise(
                //resolution deferred to give exta time to browser to finish drawing canvas...
                (resolve) => setTimeout(() => resolve(collectImageData()), 200),
              );
            };

            const that = ViewerManager;
            //return a promise chain which trigger next pan move and image data collection
            const getNextPanPromise = (imageDataArray) =>
              new Promise((resolve, reject) => {
                //while there is panning moves left
                if (panMoves.length) {
                  const panMove = panMoves.shift();
                  ViewerManager.status.longRunningMessage = `Collecting data... (${nbParts - panMoves.length}/${nbParts})`;

                  //Since image loading and drawing is asynchrously handled by OSD,
                  //we rely on OSD events to detect when the promise can be resolved

                  //event handler to detect when panning has been performed
                  ViewerManager.viewer.addOnceHandler('pan', (pannedEvent) => {
                    let resolveDeferred = false;

                    //attach a single event handler on the first visible layer not fully loaded
                    for (var i = 0; i < that.viewer.world.getItemCount() && !resolveDeferred; i++) {
                      const tiledImage = that.viewer.world.getItemAt(i);
                      const layer = _.findWhere(that.status.layerDisplaySettings, { index: i });

                      if (layer && layer.enabled) {
                        //check if image is already fully loaded
                        if (!tiledImage.getFullyLoaded()) {
                          //event handler to detect when all tiled images have been fully loaded (for current viewport)
                          that.eventSource.addOnceHandler('zav-alllayers-loaded', (event) => {
                            resolve(
                              getDeferedCollectImageDataPromise(imageDataArray, panMove).then((imgDtaArr) =>
                                getNextPanPromise(imgDtaArr),
                              ),
                            );
                          });
                          // one single event handler is enough
                          resolveDeferred = true;
                        }
                      }
                    }

                    //if no handler was added, it means all tiles are fully loaded at this point
                    if (!resolveDeferred) {
                      resolve(
                        getDeferedCollectImageDataPromise(imageDataArray, panMove).then((imgDtaArr) =>
                          getNextPanPromise(imgDtaArr),
                        ),
                      );
                    }
                  });

                  // trigger next Panning
                  ViewerManager.viewer.viewport.panTo(panMove.point, true);
                } else {
                  //console.debug("Resolving Last PanPromise");
                  resolve(imageDataArray);
                }
              });

            //create (and execute) Panning and collection Promises chain
            ViewerManager.status.longRunningMessage = 'Collecting data...';
            ViewerManager.signalStatusChanged(ViewerManager.status);

            getNextPanPromise([])
              .then(
                // create full ImageData by joining collected ImageData parts
                (imageDataArray) => {
                  ViewerManager.status.longRunningMessage = 'Aggregating data...';

                  const fullImgDataSizeByte = w * h * 4;
                  console.debug(`allocating ${fullImgDataSizeByte} bytes`);
                  const joinedImgDataPx = new Uint8ClampedArray(fullImgDataSizeByte);
                  imageDataArray.forEach((imageDataInfo, index) => {
                    const partImgData = imageDataInfo.data;
                    for (let x = 0; x < partImgData.width; x++) {
                      for (let y = 0; y < partImgData.height; y++) {
                        for (let c = 0; c < 4; c += 1) {
                          //vertical pixel offset, filled by parts in above rows
                          const vOffset = imageDataInfo.row * canvasHeight * w;
                          //horizontal pixel offset, filled by parts in left cols
                          const hOffset = imageDataInfo.col * canvasWidth;
                          //current line pixel offset for full image
                          const fullImgLineOffset = y * w;
                          //current line pixel offset for part image
                          const partImgLineOffset = y * partImgData.width;

                          joinedImgDataPx[(vOffset + hOffset + fullImgLineOffset + x) * 4 + c] =
                            partImgData.data[(partImgLineOffset + x) * 4 + c];
                        }
                      }
                    }
                  });
                  //clear imageData parts
                  imageDataArray.length = 0;

                  const joinedImageData = new ImageData(joinedImgDataPx, w, h);
                  return joinedImageData;
                },
              )
              .then((joinedImageData) => {
                //pan back to original position
                ViewerManager.viewer.viewport.fitBounds(bounds);
                return joinedImageData;
              })
              .then(
                //launch custom processing
                (joinedImageData) => startProcessor(joinedImageData),
              )
              .catch((error) => {
                console.error('Error while processing:', error);

                ViewerManager.status.longRunningMessage = error;
                ViewerManager.signalStatusChanged(ViewerManager.status);
                setTimeout(() => {
                  ViewerManager.status.longRunningMessage = error;
                  ViewerManager.signalStatusChanged(ViewerManager.status);
                }, 1500);
              });
          }
        }
      }
    }
  }

  static imageDataToImage(imageData) {
    return globalThis.ZAVProcessings.imageDataToImage(imageData);
  }

  //record current viewer state in browser history
  static makeActualHistoryStep(explicitParams) {
    let stepParams;
    //explicitely specified params override live values
    if (explicitParams) {
      stepParams = explicitParams;
    } else {
      //get live values (Beware, OSD must not be transitioning)
      const imageZoom = ViewerManager.viewer.viewport.viewportToImageZoom(ViewerManager.viewer.viewport.getZoom());
      const center = ViewerManager.viewer.viewport.viewportToImageCoordinates(
        ViewerManager.viewer.viewport.getCenter(),
      );
      const sliceNum = ViewerManager.getCurrentPlaneChosenSlice();
      const planeImageSize =
        ViewerManager.status.activePlane === ZAVConfig.AXIAL
          ? ViewerManager.config?.axial_size
          : ViewerManager.status.activePlane === ZAVConfig.CORONAL
            ? ViewerManager.config?.coronal_size
            : ViewerManager.status.activePlane === ZAVConfig.SAGITTAL
              ? ViewerManager.config?.sagittal_size
              : ViewerManager.config?.imageSize;
      const hasValidCenter =
        !planeImageSize || (center.x >= 0 && center.y >= 0 && center.x <= planeImageSize && center.y <= planeImageSize);

      stepParams = {
        z: hasValidCenter ? imageZoom.toFixed(3) : undefined,
        x: hasValidCenter ? Math.round(center.x) : undefined,
        y: hasValidCenter ? Math.round(center.y) : undefined,
        s: sliceNum,
        a: ViewerManager.status.activePlane,
      };

      if (!hasValidCenter) {
        console.info('[ZAV debug] Omitting out-of-bounds history viewport', {
          center,
          planeImageSize,
          activePlane: ViewerManager.status.activePlane,
        });
      }
    }
    //omitted param: expanded right panel, region selection
    Utils.pushHistoryStep(ViewerManager.history, stepParams, ['px', 'rs']);
  }

  static getParamsFromCurrLocation() {
    return ViewerManager.getParamsFromLocation(ViewerManager.history.location);
  }

  /** get params from location and check that they are well-formed  */
  static getParamsFromLocation(location) {
    const confParams = {};
    const confFromPath = Utils.getConfigFromLocation(location);
    if (confFromPath.a) {
      const plane = parseInt(confFromPath.a, 10);
      if (plane === ZAVConfig.AXIAL || plane === ZAVConfig.CORONAL || plane === ZAVConfig.SAGITTAL) {
        confParams.activePlane = plane;
      }
    }
    if (confFromPath.s) {
      const sliceNum = parseInt(confFromPath.s, 10);
      if (!isNaN(sliceNum) && isFinite(sliceNum)) {
        const plane = confParams.activePlane || ViewerManager.status.activePlane;
        if (sliceNum >= 0 && sliceNum <= ViewerManager.getPlaneSlideCount(plane) - 1) {
          confParams.sliceNum = sliceNum;
        }
      }
    }
    if (confFromPath.z) {
      const imageZoom = Number(confFromPath.z);
      if (!isNaN(imageZoom) && isFinite(imageZoom)) {
        if (imageZoom >= ViewerManager.config.minImageZoom && imageZoom <= ViewerManager.config.maxImageZoom) {
          confParams.imageZoom = imageZoom;
        }
      }
    }
    if (confFromPath.x && confFromPath.y) {
      const x = parseInt(confFromPath.x, 10);
      const y = parseInt(confFromPath.y, 10);
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
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
          console.warn('[ZAV debug] Ignoring out-of-bounds history center', {
            x,
            y,
            plane,
            planeImageSize,
            location: location?.href || location,
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

  static applyChangeFromHistory(params) {
    if (params.imageZoom) {
      const viewportZoom = ViewerManager.viewer.viewport.imageToViewportZoom(params.imageZoom);
      ViewerManager.viewer.viewport.zoomTo(viewportZoom);
    }
    if (params.center) {
      const refPoint = ViewerManager.viewer.viewport.imageToViewportCoordinates(params.center);
      ViewerManager.viewer.viewport.panTo(refPoint);
    }

    const targetPlane = params.activePlane || ViewerManager.status.activePlane;
    if (typeof params.sliceNum !== 'undefined' && params.sliceNum != ViewerManager.getPlaneChosenSlice(targetPlane)) {
      let targetSlice = params.sliceNum;
      //update active slice
      targetSlice = ViewerManager.checkNSetChosenSlice(targetPlane, targetSlice);
    }
    if (params.activePlane) {
      //change active plane and page
      ViewerManager.switchPlane(targetPlane);
    } else if (typeof params.sliceNum !== 'undefined') {
      ViewerManager.viewer.goToPage(ViewerManager.getPageNumForCurrentSlice());
    }

    ViewerManager.status.editModeOn = params.editMode === true;
    if (params.editMode === true) {
      ViewerManager.setBorderDisplay(true);
    }
    ViewerManager.status.initExpanded = params.initPanelExpanded;
  }
}

export default ViewerManager;
