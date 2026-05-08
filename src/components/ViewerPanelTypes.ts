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
  defaultProtocol?: string;
  useIIProtocol?: boolean;
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
