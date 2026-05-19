import type { DatasetInfo } from '../common/Types';

export type AtlasOption = {
  label: string;
  regionsSVG?: string;
  regionsTreeDef?: string;
};

export type LayerDisplaySetting = {
  key: string;
  name: string;
  enabled: boolean;
  initOpacity: number;
  opacity: number;
  index?: number;
  isTracer?: boolean;
  enhanceSignal?: boolean;
  manualEnhancing?: boolean;
  dilation?: number;
  manualDilation?: number;
  autoDilation?: number;
  loading?: boolean;
  isLabelMap?: boolean;
  contrastEnabled?: boolean;
  initContrast?: number;
  contrast?: number;
  gammaEnabled?: boolean;
  initGamma?: number;
  gamma?: number;
  [key: string]: unknown;
};

export type LayerDisplaySettings = Record<string, LayerDisplaySetting>;

export type ViewerDatasetInfo = DatasetInfo & {
  ginRepoBaseUrl?: string;
  layerFolderMap?: Record<string, string>;
};

export type ViewerConfigLike = {
  dataset_info?: ViewerDatasetInfo;
  getTotalSlidesCount(): number;
  hasDelineation?: boolean;
};

export type BrandingInfo = {
  short?: string;
  descr?: string;
  theme?: string;
};

export type DatasetVersionInfo = {
  label: string;
  uri: string;
};

export type ViewerExtraConfig = {
  termsOfUse?: string;
  hasImageServer?: boolean;
};

export type ViewerRange = {
  min: number;
  max: number;
  len: number;
};

export type ViewerLayerConfig = {
  protocol?: string;
  metadata?: string;
  opacity?: string | number;
  ext?: string;
  key?: string;
  colortable?: string;
  contrast?: string | number;
  gamma?: string | number;
  [key: string]: unknown;
};

export type ZAViewerConfig = ViewerConfigLike & {
  useEditor: boolean;
  hasCOSource?: boolean;
  hasMultiPlanes: boolean;
  firstActivePlane?: number;
  axialSlideCount: number;
  coronalSlideCount: number;
  sagittalSlideCount: number;
  axialSliceStep?: number;
  coronalSliceStep?: number;
  sagittalSliceStep?: number;
  currentAtlas?: number | null;
  atlases: AtlasOption[];
  data: Record<string, ViewerLayerConfig>;
  showRegions?: boolean;
  displayAreas?: boolean;
  displayBorders?: boolean;
  displayLabels?: boolean;
  displayROIs?: boolean;
  useCustomBorders?: boolean;
  customBorderColor?: string;
  customBorderWidth?: number;
  PUBLISH_PATH?: string;
  IIIF_SERVER_PATH?: string;
  volumeUrl?: string;
  layers: Record<string, ViewerLayerConfig>;
  viewerId?: string;
  svgFolderName?: string;
  treeUrlPath?: string;
  fallbackTreeUrl?: string;
  dataVersionTag?: string;
  imageSize?: number;
  axial_size?: number;
  coronal_size?: number;
  sagittal_size?: number;
  matrix?: unknown;
  extra?: ViewerExtraConfig;
  branding?: BrandingInfo;
  datasetId?: string;
  datasetVersion?: DatasetVersionInfo;
  subviewFolderName?: string;
  subviewSize: number;
  subviewZoomRatio?: number;
  hasPlane(plane: number): boolean;
  getTreeDataUrl(): string;
  getSubviewHRange(plane: number): ViewerRange;
  getSubviewVRange(plane: number): ViewerRange;
  setSelectedAtlas?(atlasIndex: number): void;
};
