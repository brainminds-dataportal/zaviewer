// @ts-nocheck
import _ from 'underscore';

import axios from 'axios';
import LabelMapper from './LabelMapper';

import { getJson, getOptionalJson, getText, postFormJson } from './common/http';
import Utils from './Utils';

import UserSettings from './UserSettings';

import ExtraConfig from './ZAVConfig.json';

export const AXIAL = 1;
export const CORONAL = 2;
export const SAGITTAL = 3;
/* internal plane names */
const PLANE_NAMES = { [AXIAL]: 'axial', [CORONAL]: 'coronal', [SAGITTAL]: 'sagittal' };
/* plane abbrev */
export const PLANE_ABBREVS = { [AXIAL]: 'a', [CORONAL]: 'c', [SAGITTAL]: 's' };

/* external plane labels (UI) */
const PLANE_LABELS = { [AXIAL]: 'axial', [CORONAL]: 'coronal', [SAGITTAL]: 'sagittal' };

/** color of plane border  */
export const PLANE_COLORS = { [AXIAL]: '#33dd33', [CORONAL]: '#ff4444', [SAGITTAL]: '#3399ff' };

/** orthogonal planes  */
export const PLANE_ORTHOG = {
  [AXIAL]: { v: SAGITTAL, h: CORONAL },
  [CORONAL]: { v: SAGITTAL, h: AXIAL },
  [SAGITTAL]: { v: CORONAL, h: AXIAL },
};

/** labels of coordinate axis defining the plane */
export const PLANE_AXIS = {
  [AXIAL]: { v: 'y', h: 'x' },
  [CORONAL]: { v: 'z', h: 'x' },
  [SAGITTAL]: { v: 'z', h: 'y' },
};

/** preferred subview plane for main image plane (signel plane mode) */
export const PLANE_PREFSUBVIEW = { [AXIAL]: CORONAL, [CORONAL]: SAGITTAL, [SAGITTAL]: AXIAL };

/** Class in charge of retrieving and holding configuration associated to a dataset */
class ZAVConfig {
  static configRequests = new Map();

  static get AXIAL() {
    return AXIAL;
  }
  static get CORONAL() {
    return CORONAL;
  }
  static get SAGITTAL() {
    return SAGITTAL;
  }

  static getPlaneName(plane) {
    return PLANE_NAMES[plane];
  }

  static getPlaneLabel(plane) {
    return PLANE_LABELS[plane];
  }

  static getPlaneColor(plane) {
    return PLANE_COLORS[plane];
  }

  static getPlaneOrthoVertical(plane) {
    return PLANE_ORTHOG[plane]['v'];
  }

  static getPlaneOrthoHorizontal(plane) {
    return PLANE_ORTHOG[plane]['h'];
  }

  static getPlaneVerticalAxis(plane) {
    return PLANE_AXIS[plane]['v'];
  }

  static getPlaneHorizontalAxis(plane) {
    return PLANE_AXIS[plane]['h'];
  }

  static getPreferredSubviewForPlane(plane) {
    return PLANE_PREFSUBVIEW[plane];
  }

  static getConfigRequestKey(configId, dataSrc, dataVersionTag) {
    return JSON.stringify([configId ?? null, dataSrc ?? null, dataVersionTag ?? '']);
  }

  static getConfig(configId, dataSrc, dataVersionTag, callbackWhenReady) {
    const normalizedDataSrc = dataSrc ? dataSrc.toString().trim() : undefined;
    const requestKey = ZAVConfig.getConfigRequestKey(configId, normalizedDataSrc, dataVersionTag);
    const existingRequest = ZAVConfig.configRequests.get(requestKey);

    if (existingRequest) {
      if (callbackWhenReady) {
        if (existingRequest.isReady) {
          queueMicrotask(() => callbackWhenReady(existingRequest.instance.config));
        } else {
          existingRequest.callbacks.push(callbackWhenReady);
        }
      }
      return existingRequest.instance;
    }

    const requestState = {
      callbacks: callbackWhenReady ? [callbackWhenReady] : [],
      instance: undefined,
      isReady: false,
    };
    const notifyWhenReady = (config) => {
      requestState.isReady = true;
      const callbacks = requestState.callbacks.slice();
      requestState.callbacks.length = 0;
      callbacks.forEach((callback) => callback(config));
    };

    requestState.instance = new ZAVConfig(configId, normalizedDataSrc, dataVersionTag, notifyWhenReady);
    ZAVConfig.configRequests.set(requestKey, requestState);
    return requestState.instance;
  }

  /**
   * Create a configuration
   * @param {string} configId - ID of the configuration.
   * @param {string} dataSrc -  when the configId is not specified, url from where to retrieve config & data
   * @param {string} dataVersionTag -  optional version tag for cache busting purpose
   * @param {function} callbackWhenReady - function asynchronously invoked to signal that the configuration is fully loaded
   */
  constructor(configId, dataSrc, dataVersionTag, callbackWhenReady) {
    /** default subview size */
    const _subviewSize = 200;
    const _subviewZoomRatio = 200 / _subviewSize;

    //configuration default values
    this.config = {
      /** ZAViewer can be run with or without a backend instance (i.e. web services used to request dataset config repository, and an images server)
       * Without backend, only one dataset is available, and its data is stored as files directly served by the http server */
      hasBackend: typeof configId !== 'undefined',

      /** When running without a backend, ZAViewer can retrieve its config and data from cross-origin domain */
      hasCOSource: false,

      /** planes for which slices images can be displayed */
      hasMultiPlanes: false,
      firstActivePlane: undefined,
      hasAxialPlane: false,
      hasCoronalPlane: false,
      hasSagittalPlane: false,

      hasPlane: function (plane) {
        switch (plane) {
          case AXIAL:
            return this.hasAxialPlane;
          case CORONAL:
            return this.hasCoronalPlane;
          case SAGITTAL:
            return this.hasSagittalPlane;
          default:
            return false;
        }
      },

      /** total number of slices for each planes in the selected dataset */
      axialSlideCount: 0,
      coronalSlideCount: 0,
      sagittalSlideCount: 0,

      getTotalSlidesCount: function () {
        return this.axialSlideCount + this.coronalSlideCount + this.sagittalSlideCount;
      },

      /** index increment between 2 consecutive slices */
      axialSliceStep: 1,
      coronalSliceStep: 1,
      sagittalSliceStep: 1,

      /** first index of slice image*/
      axialFirstIndex: 0,
      coronalFirstIndex: 0,
      sagittalFirstIndex: 0,

      /** sets of (region tree + SVG region) */
      atlases: [],
      currentAtlas: undefined,
      /** folder of the current set of SVG region files */
      svgFolderName: undefined,
      /** URL path to the folder holding the current tree region data */
      treeUrlPath: undefined,

      resolveSimpleUrl: function (path) {
        if (!path || !this.baseConfigPath) {
          return path;
        }
        return new URL(path, new URL(this.baseConfigPath, window.location.href)).toString();
      },

      getTreeDataUrl: function () {
        return this.treeUrlPath
          ? this.hasBackend
            ? Utils.makePath(
                this.PUBLISH_PATH,
                this.treeUrlPath,
                'regionTreeGroup_' + this.viewerId + '.json' + this.dataVersionTag,
              )
            : this.resolveSimpleUrl(Utils.makePath(this.treeUrlPath, 'regionTree.json' + this.dataVersionTag))
          : this.fallbackTreeUrl;
      },

      setSelectedAtlas: function (atlasIndex) {
        if (atlasIndex >= 0 && atlasIndex < this.atlases.length) {
          this.currentAtlas = atlasIndex;
          const regset = this.atlases[this.currentAtlas];
          this.treeUrlPath = regset.regionsTreeDef;
          this.svgFolderName = regset.regionsSVG;
        }
      },

      /** atlas regions area & delineations visibility */
      showRegions: false,
      displayAreas: true,
      displayBorders: false,
      displayLabels: false,
      displayROIs: false,
      useCustomBorders: false,
      customBorderColor: '#ff0000',
      customBorderWidth: 2,

      //pixel color to label map, used when a raster labelMap is defined
      color2labelMap: undefined,

      /** relative path to folder containing subview background images */
      subviewFolderName: undefined,

      /** size of the subview widget */
      subviewSize: _subviewSize,
      subviewZoomRatio: _subviewZoomRatio,

      // horizontal range in Axial and Coronal subview image
      xMinGlobal: undefined,
      xMaxGlobal: undefined,

      // vertical range in Axial subview, and horizontal range in Sagittal subview image
      yMinGlobal: undefined,
      yMaxGlobal: undefined,

      // vertical range in Coronal and Sagittal subview image
      zMinGlobal: undefined,
      zMaxGlobal: undefined,

      getSubviewHRange: function (plane) {
        switch (plane) {
          case AXIAL:
          case CORONAL:
            return { min: this.xMinGlobal, max: this.xMaxGlobal, len: this.xMaxGlobal - this.xMinGlobal };
          case SAGITTAL:
            return { min: this.yMinGlobal, max: this.yMaxGlobal, len: this.yMaxGlobal - this.yMinGlobal };
        }
      },

      getSubviewVRange: function (plane) {
        switch (plane) {
          case AXIAL:
            return { min: this.yMinGlobal, max: this.yMaxGlobal, len: this.yMaxGlobal - this.yMinGlobal };
          case CORONAL:
          case SAGITTAL:
            return { min: this.zMinGlobal, max: this.zMaxGlobal, len: this.zMaxGlobal - this.zMinGlobal };
        }
      },

      /** matrix to convert image space to physical space (values expressed in millimeters) */
      matrix: undefined,
      anyMatrix: undefined,

      /** image size (of current plane) */
      imageSize: undefined,
      /** plane specific image sizes */
      axial_size: undefined,
      coronal_size: undefined,
      sagittal_size: undefined,

      anyImageSize: 1000,
      dzWidth: 1000.0,
      dzHeight: 1000.0,

      dzLayerWidth: 1000,
      dzLayerHeight: 1000,

      setPlaneSizes: function (plane) {
        switch (plane) {
          case AXIAL:
            this.imageSize = this.axial_size;
            this.matrix = this.axial_matrix;
            break;
          case CORONAL:
            this.imageSize = this.coronal_size;
            this.matrix = this.coronal_matrix;
            break;
          case SAGITTAL:
            this.imageSize = this.sagittal_size;
            this.matrix = this.sagittal_matrix;
            break;
          default:
            this.imageSize = this.anyImageSize;
            this.matrix = this.anyMatrix;
        }
        //FIXME assume that images are square
        this.dzWidth = this.imageSize;
        this.dzHeight = this.imageSize;
        this.dzLayerWidth = this.imageSize;
        this.dzLayerHeight = this.imageSize;
        //zooming limits proportional to image resolution
        this.minImageZoom = (this.minImageZoom / this.imageSize) * 1000;
        this.maxImageZoom = (this.maxImageZoom / this.imageSize) * 1000;
      },

      //FIXME magic values
      /** zooming limits */
      //minImageZoom: 0.036,
      //maxImageZoom: 1.557,
      minImageZoom: 0.648,
      maxImageZoom: 28.026,

      layers: {},

      editLayers: {},

      initialPage: 0,

      axialChosenSlice: 0,
      coronalChosenSlice: 0,
      sagittalChosenSlice: 0,

      global_X: 0, // Red
      global_Y: 0, // Green
      global_Z: 0, // Blue

      dzDiff: 0, //1290.0;

      /** raw configuration data for layers */
      data: undefined,

      /** data version tag for cache busting purpose */
      dataVersionTag: dataVersionTag,
    };

    if (this.config.hasBackend) {
      /** viewer id */
      this.config.viewerId = configId;
      /** dataset id */
      this.config.datasetId = configId;

      /** base URL of image server */
      this.config.IIPSERVER_PATH = undefined;
      /** base URL for region infos, region SVGs, ... */
      this.config.PUBLISH_PATH = undefined;
      /** base URL of admin web services */
      this.config.ADMIN_PATH = undefined;

      this.config.TILE_EXTENSION = '/info.json';
      this.config.THUMB_EXTENSION = '/full/250,/0/default.jpg'; //".ptif/full/250,/0/default.jpg";

      /** url to retrieve extra info for dataset */
      this.config.fmDatasetsInfoUrl = '../datasets.json';
    } else {
      /*
            var dataset = {}; // key -> object {axial_slide, coronal_slide, sagittal_slide}
            var datasetIndex = {}; // Save index of "key" in dataset
            */

      this.config.hasCOSource = dataSrc ? true : false;
      this.config.baseConfigPath = this.config.hasCOSource ? dataSrc + (dataSrc.endsWith('/') ? '' : '/') : '';

      this.config.dataRootPath = this.config.resolveSimpleUrl('data');
      /** base URL for region infos, region SVGs, ... */
      this.config.PUBLISH_PATH = undefined;
      /** base URL for SVG edit webservice ... */
      this.config.ADMIN_PATH = 'admin';

      this.config.fallbackExtension = 'dzi';

      /** URL path to the default tree region */
      this.config.fallbackTreeUrl = this.config.resolveSimpleUrl('regionTree.json' + (dataVersionTag || ''));
    }

    if (Object.keys(ExtraConfig).length) {
      this.config.extra = ExtraConfig;
    }

    //start retrieving configuration
    if (this.config.hasBackend) {
      this.retrieveConfigFromBackend(callbackWhenReady);
    } else {
      this.retrieveSimpleConfig(callbackWhenReady);
    }
  }

  expandDatasetImagesUrl = (data, config) => {
    data.thumbnailUrl = config.imageBaseUrl + '/' + config.thumbnailsFolder + '/' + data.thumbnail;
    data.snapshotUrl = config.imageBaseUrl + '/' + config.snapshotsFolder + '/' + data.snapshot;
    return data;
  };

  /**
   * Retrieve configuration from remote backend
   * @param {function} callbackWhenReady - function invoked when the configuration is fully loaded
   * @private
   */
  retrieveConfigFromBackend(callbackWhenReady) {
    const baseConfigUrl = './path.json';
    void (async () => {
      try {
        const response = await getJson(baseConfigUrl);

        this.config.ADMIN_PATH = response.admin_path;
        this.config.IIPSERVER_PATH = response.iipserver_path;
        this.config.PUBLISH_PATH = response.publish_path;

        const configUrl = Utils.makePath(this.config.ADMIN_PATH, 'json.php');
        const data = await postFormJson(configUrl, {
          id: this.config.viewerId,
        });

        if (data.dataset_id) {
          this.config.datasetId = data.dataset_id;
        }

        if (this.config.fmDatasetsInfoUrl) {
          void getJson(this.config.fmDatasetsInfoUrl)
            .then((datasetData) => {
              if (datasetData.datasets && datasetData.datasets.length) {
                const dataset_info = _.findWhere(datasetData.datasets, { marmosetID: this.config.datasetId });
                if (dataset_info) {
                  this.config.dataset_info = this.expandDatasetImagesUrl(dataset_info, datasetData.config);
                }
              } else {
                console.info('Missing info for dataset: ', this.config.datasetId);
              }
            })
            .catch((error) => {
              console.info('Error while retrieving datasets info: ', error);
            });
        }

        this.parseLayersConfig(callbackWhenReady, data);

        void postFormJson(Utils.makePath(this.config.ADMIN_PATH, 'findImageGroupList.php'), {
          id: this.config.viewerId,
        })
          .then((imageGroupListData) => {
            if (!imageGroupListData['error']) {
              this.config.imageGroupListData = imageGroupListData;
              Object.entries(imageGroupListData).forEach(([key, value]) => {
                this.config.editLayers[value['publish_id']] = {
                  name: value['display_name'],
                  ext: '.' + value['extension'],
                };
              });
            } else {
              this.config.imageGroupListError = imageGroupListData['error'];
            }
          })
          .catch(() => {
            this.config.imageGroupListError = 'Error';
          });
      } catch (error) {
        console.error('Error while retrieving base configuration: ', error);
        alert(
          'Error while retrieving base configuration from ' +
            baseConfigUrl +
            '\nTry reloading [F5], or check configuration source is up and running.',
        );
      }
    })();
  }

  /**
   * Retrieve static configuration from web sever
   * @param {function} callbackWhenReady - function invoked when the configuration is fully loaded
   * @private
   */
  retrieveSimpleConfig(callbackWhenReady) {
    const configUrl = this.config.resolveSimpleUrl('viewer.json');

    void (async () => {
      try {
        const data = await getJson(configUrl);
        if (data.dataset_id) {
          this.config.datasetId = data.dataset_id;
        }

        if (this.config.datasetId) {
          const datasetInfoUrl = this.config.resolveSimpleUrl(Utils.makePath(data.data_root_path, 'datasetInfo.json'));

          void getOptionalJson(datasetInfoUrl)
            .then((datasetInfo) => {
              if (datasetInfo) {
                this.config.dataset_info = this.expandDatasetImagesUrl(datasetInfo, datasetInfo);
              }
            })
            .catch((error) => {
              console.info('Error while retrieving info for current dataset: ', error);
            });
        }

        this.parseLayersConfig(callbackWhenReady, data);
      } catch (error) {
        console.error('Error while retrieving configuration: ', error);
        alert(
          'Error while retrieving configuration from ' +
            configUrl +
            '\nTry reloading [F5], or check configuration source is accessible.',
        );
      }
    })();
  }

  parseLayersConfig(callbackWhenReady, response) {
    const parseIntOr = (value, fallback) => {
      const parsedValue = Number.parseInt(value, 10);
      return Number.isFinite(parsedValue) ? parsedValue : fallback;
    };

    const parseCountOrZero = (value) => Math.max(parseIntOr(value, 0), 0);

    const clampSlice = (value, sliceCount) => {
      const maxSliceIndex = Math.max(sliceCount - 1, 0);
      return Math.min(Math.max(parseIntOr(value, 0), 0), maxSliceIndex);
    };

    if (response.error) {
      console.log(response.error);

      //FIXME display explicit message to user
    }

    this.config.hasAxialPlane = _.has(response.subview, 'axial_slide');
    this.config.hasCoronalPlane = _.has(response.subview, 'coronal_slide');
    this.config.hasSagittalPlane = _.has(response.subview, 'sagittal_slide');
    //single or multi-plane mode?
    const nbDefinedPlanes = this.config.hasAxialPlane + this.config.hasCoronalPlane + this.config.hasSagittalPlane;
    this.config.hasMultiPlanes = nbDefinedPlanes > 1;
    //if no plane explicitely specified
    if (nbDefinedPlanes == 0) {
      this.config.hasCoronalPlane = true;
    }

    if (!this.config.hasBackend) {
      this.config.PUBLISH_PATH = this.config.dataRootPath = this.config.resolveSimpleUrl(response.data_root_path);
    }

    this.config.subviewFolderName = response.subview.foldername;

    if (this.config.hasMultiPlanes) {
      this.config.axialSlideCount = this.config.hasAxialPlane ? parseCountOrZero(response.subview.axial_slide) : 0;
      this.config.coronalSlideCount = this.config.hasCoronalPlane
        ? parseCountOrZero(response.subview.coronal_slide)
        : 0;
      this.config.sagittalSlideCount = this.config.hasSagittalPlane
        ? parseCountOrZero(response.subview.sagittal_slide)
        : 0;
    } else {
      const sliceCount = parseCountOrZero(response.slide_count);

      this.config.axialSlideCount = this.config.hasAxialPlane ? sliceCount : 0;
      this.config.coronalSlideCount = this.config.hasCoronalPlane ? sliceCount : 0;
      this.config.sagittalSlideCount = this.config.hasSagittalPlane ? sliceCount : 0;
    }

    //In multiplanes mode, slices of all available planes are appended to the OSD viewer page list in that order : Axial, Coronal then Sagittal.
    //Hence, each plane start at different page offset which must be taken into account to display correct slice.

    //index of first slice of each plane within the Page axis
    this.config.axialFirstIndex = 0;
    this.config.coronalFirstIndex = this.config.axialFirstIndex + this.config.axialSlideCount;
    this.config.sagittalFirstIndex = this.config.coronalFirstIndex + this.config.coronalSlideCount;

    //size of subview images
    const subviewOrgSize = response.subview?.size
      ? parseIntOr(response.subview.size, this.config.subviewSize)
      : this.config.subviewSize;

    this.config.subviewZoomRatio = subviewOrgSize / this.config.subviewSize;
    if (this.config.hasMultiPlanes) {
      this.config.xMinGlobal = (response.subview.x_min ? response.subview.x_min : 0) / this.config.subviewZoomRatio;
      this.config.xMaxGlobal =
        (response.subview.x_max ? response.subview.x_max : subviewOrgSize) / this.config.subviewZoomRatio;
      this.config.yMinGlobal = (response.subview.y_min ? response.subview.y_min : 0) / this.config.subviewZoomRatio;
      this.config.yMaxGlobal =
        (response.subview.y_max ? response.subview.y_max : subviewOrgSize) / this.config.subviewZoomRatio;
      this.config.zMinGlobal = (response.subview.z_min ? response.subview.z_min : 0) / this.config.subviewZoomRatio;
      this.config.zMaxGlobal =
        (response.subview.z_max ? response.subview.z_max : subviewOrgSize) / this.config.subviewZoomRatio;

      if (response.subview.x_label) {
        PLANE_LABELS[SAGITTAL] = response.subview.x_label;
      }
      if (response.subview.y_label) {
        PLANE_LABELS[CORONAL] = response.subview.y_label;
      }
      if (response.subview.x_label) {
        PLANE_LABELS[AXIAL] = response.subview.z_label;
      }
    } else {
      if (this.config.hasBackend) {
        //subview.min & subview.max are expressed in percent of subview image size
        this.config.xMaxGlobal =
          this.config.yMaxGlobal =
          this.config.zMaxGlobal =
            (response.subview.max ? (response.subview.max / 100) * subviewOrgSize : subviewOrgSize) /
            this.config.subviewZoomRatio;
        this.config.xMinGlobal =
          this.config.yMinGlobal =
          this.config.zMinGlobal =
            (response.subview.min ? (response.subview.min / 100) * subviewOrgSize : subviewOrgSize) /
            this.config.subviewZoomRatio;
      } else {
        //subview.min & subview.max are expressed in pixels
        this.config.xMaxGlobal =
          this.config.yMaxGlobal =
          this.config.zMaxGlobal =
            (response.subview.max ? response.subview.max : subviewOrgSize) / this.config.subviewZoomRatio;
        this.config.xMinGlobal =
          this.config.yMinGlobal =
          this.config.zMinGlobal =
            (response.subview.min ? response.subview.min : 1) / this.config.subviewZoomRatio;
      }

      if (response.subview.label) {
        PLANE_LABELS[CORONAL] = response.subview.label;
      }
    }

    if (response.atlases && response.atlases.length) {
      this.config.atlases = response.atlases;
      this.config.setSelectedAtlas(0);
      this.config.hasDelineation = true;
    } else {
      this.config.treeUrlPath = response.tree;
      if (response.delineations) {
        this.config.hasDelineation = true;
        this.config.svgFolderName = response.delineations;
      } else {
        this.config.hasDelineation = false;
      }
    }

    this.config.anyMatrix = response.matrix ? response.matrix.split(',') : this.config.anyMatrix;
    //handle different matrices for each planes
    if (this.config.hasMultiPlanes) {
      this.config.axial_matrix = response.axial_matrix ? response.axial_matrix.split(',') : this.config.anyMatrix;
      this.config.coronal_matrix = response.coronal_matrix ? response.coronal_matrix.split(',') : this.config.anyMatrix;
      this.config.sagittal_matrix = response.sagittal_matrix
        ? response.sagittal_matrix.split(',')
        : this.config.anyMatrix;
    } else {
      this.config.axial_matrix = this.config.hasAxialPlane ? this.config.anyMatrix : this.config.axial_matrix;
      this.config.coronal_matrix = this.config.hasCoronalPlane ? this.config.anyMatrix : this.config.coronal_matrix;
      this.config.sagittal_matrix = this.config.hasSagittalPlane ? this.config.anyMatrix : this.config.sagittal_matrix;
    }

    if (this.config.hasMultiPlanes) {
      this.config.axialSliceStep = this.config.hasAxialPlane ? parseIntOr(response.axial_slice_step, 1) : 0;
      this.config.coronalSliceStep = this.config.hasCoronalPlane ? parseIntOr(response.coronal_slice_step, 1) : 0;
      this.config.sagittalSliceStep = this.config.hasSagittalPlane ? parseIntOr(response.sagittal_slice_step, 1) : 0;
    } else {
      const sliceStep = parseIntOr(response.slice_step, 1);
      this.config.axialSliceStep = this.config.hasAxialPlane ? sliceStep : 0;
      this.config.coronalSliceStep = this.config.hasCoronalPlane ? sliceStep : 0;
      this.config.sagittalSliceStep = this.config.hasSagittalPlane ? sliceStep : 0;
    }

    this.config.anyImageSize = response.image_size
      ? parseIntOr(response.image_size, this.config.anyImageSize)
      : this.config.anyImageSize;
    //handle different sizes for each planes
    if (this.config.hasMultiPlanes) {
      this.config.axial_size = response.axial_size
        ? parseIntOr(response.axial_size, this.config.anyImageSize)
        : this.config.anyImageSize;
      this.config.coronal_size = response.coronal_size
        ? parseIntOr(response.coronal_size, this.config.anyImageSize)
        : this.config.anyImageSize;
      this.config.sagittal_size = response.sagittal_size
        ? parseIntOr(response.sagittal_size, this.config.anyImageSize)
        : this.config.anyImageSize;
    } else {
      this.config.axial_size = this.config.hasAxialPlane ? this.config.anyImageSize : this.config.axial_size;
      this.config.coronal_size = this.config.hasCoronalPlane ? this.config.anyImageSize : this.config.coronal_size;
      this.config.sagittal_size = this.config.hasSagittalPlane ? this.config.anyImageSize : this.config.sagittal_size;
    }
    this.config.setPlaneSizes(null);

    if (response.data) {
      this.config.data = response.data;

      Object.entries(response.data).forEach(([key, value], i) => {
        // only firstLayer when running with a backend
        if (this.config.hasBackend && i == 0) {
          //showInfoText(key);
          this.config.infoTextName = value.metadata;

          //FIXME probably useless
          void getText(Utils.makePath(this.config.PUBLISH_PATH, key, '/info.txt'))
            .then((data) => {
              this.config.infoText = data;
            })
            .catch(() => {
              this.config.infoText = '';
            });
        }

        if (value.colortable) {
          axios({
            method: 'GET',
            url: Utils.makePath(this.config.PUBLISH_PATH, value.colortable),
          })
            .then((response) => {
              this.config.color2labelMap = LabelMapper.parseColorTable(response.data);
            })
            .catch((error) => {
              console.warn('Could not load ColorTable', error);
              this.config.color2labelMap = undefined;
            });
        }

        this.config.layers[key] = {
          name: value.metadata,
          ext: '.' + (value.extension || this.config.fallbackExtension),
          index: i,
          key: key,
          protocol: value.protocol,
        };
      });
    }

    if (response.first_access) {
      if (response.first_access.plane) {
        switch (response.first_access.plane) {
          case PLANE_NAMES[AXIAL]:
            this.config.firstActivePlane = AXIAL;
            break;

          case PLANE_NAMES[CORONAL]:
          default:
            this.config.firstActivePlane = CORONAL;
            break;

          case PLANE_NAMES[SAGITTAL]:
            this.config.firstActivePlane = SAGITTAL;
            break;
        }
      } else {
        if (this.config.hasCoronalPlane) {
          this.config.firstActivePlane = CORONAL;
        } else if (this.config.hasAxialPlane) {
          this.config.firstActivePlane = AXIAL;
        } else if (this.config.hasSagittalPlane) {
          this.config.firstActivePlane = SAGITTAL;
        }
      }

      const getShowSettings = (setting) => {
        //override user settings if setting specified all in capital letters
        const forced = setting === 'SHOW' || setting === 'HIDE';

        const lcSetting = setting ? setting.toLowerCase() : '';
        const display = lcSetting === 'hide' ? false : lcSetting === 'show' ? true : null;

        return [display, forced];
      };

      //default value for displaying regions
      const [regionVisibility, forcedRegionVisibility] = getShowSettings(response.first_access.delineations);
      if (regionVisibility != null) {
        this.config.showRegions = regionVisibility;
        this.config.displayAreas = regionVisibility;
      }

      //default value for displaying regions' labels
      const [displayLabels, forceddisplayLabels] = getShowSettings(response.first_access.region_labels);
      if (displayLabels != null) {
        this.config.displayLabels = displayLabels;
      }

      //override dataset settings with users' settings
      if (!forcedRegionVisibility) {
        this.config.displayAreas = UserSettings.getBoolItem(
          UserSettings.SettingsKeys.ShowAtlasRegionArea,
          this.config.displayAreas,
        );
        this.config.displayBorders = UserSettings.getBoolItem(
          UserSettings.SettingsKeys.ShowAtlasRegionBorder,
          this.config.displayBorders,
        );
      }
      if (!forceddisplayLabels) {
        this.config.displayLabels = UserSettings.getBoolItem(
          UserSettings.SettingsKeys.ShowAtlasRegionLabel,
          this.config.displayLabels,
        );
      }

      this.config.displayROIs = UserSettings.getBoolItem(
        UserSettings.SettingsKeys.ShowOverlayROI,
        this.config.displayROIs,
      );

      this.config.useCustomBorders = UserSettings.getBoolItem(
        UserSettings.SettingsKeys.UseCustomRegionBorder,
        this.config.useCustomBorders,
      );
      this.config.customBorderColor = UserSettings.getStrItem(
        UserSettings.SettingsKeys.CustomRegionBorderColor,
        this.config.customBorderColor,
      );
      this.config.customBorderWidth = UserSettings.getNumItem(
        UserSettings.SettingsKeys.CustomRegionBorderWidth,
        this.config.customBorderWidth,
      );
      this.config.showRegions = this.config.displayAreas || this.config.displayBorders;

      //start with the middle slice if none is specified
      this.config.axialChosenSlice = Math.floor(this.config.axialSlideCount / 2);
      this.config.coronalChosenSlice = Math.floor(this.config.coronalSlideCount / 2);
      this.config.sagittalChosenSlice = Math.floor(this.config.sagittalSlideCount / 2);

      //FIXME magic value!!
      const defaultInitialSlice = 30;
      switch (this.config.firstActivePlane) {
        case AXIAL:
          this.config.axialChosenSlice = clampSlice(
            typeof response.first_access.slide !== 'undefined' ? response.first_access.slide : defaultInitialSlice,
            this.config.axialSlideCount,
          );
          this.config.initialPage = this.config.axialChosenSlice + this.config.axialFirstIndex;
          //FIXME magic value!!
          this.config.global_X =
            this.config.axialSlideCount > 0
              ? 10 +
                ((this.config.axialSlideCount - this.config.axialChosenSlice) *
                  (this.config.zMaxGlobal - this.config.zMinGlobal)) /
                  this.config.axialSlideCount +
                this.config.zMinGlobal
              : 10 + this.config.zMinGlobal;
          this.config.global_Y = 10 + this.config.yMinGlobal;
          this.config.global_Z = 10 + this.config.xMinGlobal;

          break;
        case CORONAL:
          this.config.coronalChosenSlice = clampSlice(
            typeof response.first_access.slide !== 'undefined' ? response.first_access.slide : defaultInitialSlice,
            this.config.coronalSlideCount,
          );
          this.config.initialPage = this.config.coronalChosenSlice + this.config.coronalFirstIndex;
          //FIXME magic value!!
          this.config.global_X = 10 + this.config.zMaxGlobal;
          this.config.global_Y =
            this.config.coronalSlideCount > 0
              ? 10 +
                ((this.config.coronalSlideCount - this.config.coronalChosenSlice) *
                  (this.config.yMaxGlobal - this.config.yMinGlobal)) /
                  this.config.coronalSlideCount +
                this.config.yMinGlobal
              : 10 + this.config.yMinGlobal;
          this.config.global_Z = 10 + this.config.xMinGlobal;

          break;
        case SAGITTAL:
          this.config.sagittalChosenSlice = clampSlice(
            typeof response.first_access.slide !== 'undefined' ? response.first_access.slide : defaultInitialSlice,
            this.config.sagittalSlideCount,
          );
          this.config.initialPage = this.config.sagittalChosenSlice + this.config.sagittalFirstIndex;
          //FIXME magic value!!
          this.config.global_X = 10 + this.config.zMaxGlobal;
          this.config.global_Y = 10 + this.config.yMinGlobal;
          this.config.global_Z =
            this.config.sagittalSlideCount > 0
              ? 10 +
                ((this.config.sagittalSlideCount - this.config.sagittalChosenSlice) *
                  (this.config.xMaxGlobal - this.config.xMinGlobal)) /
                  this.config.sagittalSlideCount +
                this.config.xMinGlobal
              : 10 + this.config.xMinGlobal;

          break;
      }
    } else {
      this.config.firstActivePlane = CORONAL;
    }
    this.config.setPlaneSizes(this.config.firstActivePlane);

    if (response.verofdata) {
      if (response.verofdata.all) {
        this.config.datasetVersion = response.verofdata.all;
      }
    }
    if (response.branding) {
      this.config.branding = response.branding;
    }
    if (response.volume && response.volume.url) {
      this.config.volumeUrl = response.volume.url;
    }

    if (callbackWhenReady && typeof callbackWhenReady === 'function') {
      callbackWhenReady(this.config);
    }
  }
}

export default ZAVConfig;
