import type { LayerDisplaySettings, ViewerLayerConfig } from '../components/ViewerPanelTypes';
import UserSettings from '../UserSettings';
import ZAVConfig from '../ZAVConfig';
import type { ViewerHistoryParams, ViewerNavigationState } from './viewerNavigation';

type ViewerConfigSubset = {
  data: Record<string, ViewerLayerConfig>;
  viewerId?: string;
  hasPlane(plane: number): boolean;
  firstActivePlane: number;
  axialChosenSlice: number;
  coronalChosenSlice: number;
  sagittalChosenSlice: number;
};

export function createInitialLayerDisplaySettings(
  config: ViewerConfigSubset,
  viewerIdFallback: string,
): LayerDisplaySettings {
  const initLayerDisplaySettings: LayerDisplaySettings = {};
  Object.entries(config.data).forEach(([key, value], index) => {
    const metadata = String(value.metadata ?? key);
    const isTracer = metadata.includes('nn_tracer');
    const isLabelMap = typeof value.colortable !== 'undefined';
    const itemKeyLayerPrefix = UserSettings.getLayerKeyPrefix(config.viewerId ?? viewerIdFallback, key);

    const initContrast = Number.parseFloat(String(value.contrast ?? 1.0));
    const initGamma = Number.parseFloat(String(value.gamma ?? 1.0));
    const initialOpacity = value.opacity ? Number.parseInt(String(value.opacity), 10) : 100;

    initLayerDisplaySettings[key] = new Proxy(
      {
        key,
        enabled: UserSettings.getBoolItem(`${itemKeyLayerPrefix}enabled`, true) ?? true,
        initOpacity: initialOpacity,
        opacity: UserSettings.getNumItem(`${itemKeyLayerPrefix}opacity`, initialOpacity) ?? initialOpacity,
        name: metadata,
        index,
        isTracer,
        enhanceSignal: false,
        manualEnhancing: false,
        dilation: 0,
        manualDilation: 0,
        autoDilation: 0,
        isLabelMap,

        contrastEnabled:
          UserSettings.getBoolItem(`${itemKeyLayerPrefix}contrastEnabled`, initContrast !== 1.0) ?? false,
        initContrast,
        contrast: UserSettings.getNumItem(`${itemKeyLayerPrefix}contrast`, initContrast) ?? initContrast,
        gammaEnabled: UserSettings.getBoolItem(`${itemKeyLayerPrefix}gammaEnabled`, initGamma !== 1.0) ?? false,
        initGamma,
        gamma: UserSettings.getNumItem(`${itemKeyLayerPrefix}gamma`, initGamma) ?? initGamma,
      },
      {
        set: (target, property: string | symbol, value: unknown) => {
          const mutableTarget = target as Record<string, unknown>;
          if (
            typeof property === 'string' &&
            ['enabled', 'contrastEnabled', 'gammaEnabled'].includes(property) &&
            typeof value === 'boolean'
          ) {
            mutableTarget[property] = value;
            UserSettings.setBoolItem(itemKeyLayerPrefix + property, value);
            return true;
          }
          if (
            typeof property === 'string' &&
            ['opacity', 'contrast', 'gamma'].includes(property) &&
            typeof value === 'number'
          ) {
            mutableTarget[property] = value;
            UserSettings.setNumItem(itemKeyLayerPrefix + property, value);
            return true;
          }
          return Reflect.set(target, property, value);
        },
      },
    );
  });

  return initLayerDisplaySettings;
}

export function createInitialNavigationBootstrap(config: ViewerConfigSubset, overridingConf: ViewerHistoryParams) {
  const pendingInitialAtlasFit = !overridingConf.center;
  const overridingPlane =
    typeof overridingConf.activePlane !== 'undefined' && config.hasPlane(overridingConf.activePlane)
      ? overridingConf.activePlane
      : null;
  const initialActivePlane = overridingPlane ?? config.firstActivePlane;

  const navigationState: ViewerNavigationState = {
    activePlane: initialActivePlane,
    chosenSlices: {
      [ZAVConfig.AXIAL]:
        typeof overridingConf.sliceNum !== 'undefined' && overridingPlane === ZAVConfig.AXIAL
          ? overridingConf.sliceNum
          : config.axialChosenSlice,
      [ZAVConfig.CORONAL]:
        typeof overridingConf.sliceNum !== 'undefined' && overridingPlane === ZAVConfig.CORONAL
          ? overridingConf.sliceNum
          : config.coronalChosenSlice,
      [ZAVConfig.SAGITTAL]:
        typeof overridingConf.sliceNum !== 'undefined' && overridingPlane === ZAVConfig.SAGITTAL
          ? overridingConf.sliceNum
          : config.sagittalChosenSlice,
    },
    pendingVersion: 0,
  };

  return { pendingInitialAtlasFit, navigationState };
}

export function getInitialPlaneAndSlice(config: ViewerConfigSubset, overridingConf: ViewerHistoryParams) {
  const initialPlane = overridingConf.activePlane ?? config.firstActivePlane;
  const initialSlice =
    typeof overridingConf.sliceNum !== 'undefined'
      ? overridingConf.sliceNum
      : initialPlane === ZAVConfig.AXIAL
        ? config.axialChosenSlice
        : initialPlane === ZAVConfig.CORONAL
          ? config.coronalChosenSlice
          : initialPlane === ZAVConfig.SAGITTAL
            ? config.sagittalChosenSlice
            : 0;
  return { initialPlane, initialSlice };
}
