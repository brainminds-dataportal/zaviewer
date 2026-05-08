// biome-ignore lint/complexity/noStaticOnlyClass: UserSettings is intentionally exposed as a static utility API across the app.
class UserSettings {
  static SettingsKeys = {
    ShowAtlasRegionArea: 'zav:global:atlasRegionsArea:show',
    ShowAtlasRegionBorder: 'zav:global:atlasRegionsBorder:show',
    ShowAtlasRegionLabel: 'zav:global:atlasRegionsLabel:show',
    ShowOverlayROI: 'zav:global:overlayROI:show',
    OpacityAtlasRegionArea: 'zav:global:atlasRegionsArea:opacity',
    UseCustomRegionBorder: 'zav:global:atlasRegionsCustomBorder:use',
    CustomRegionBorderColor: 'zav:global:atlasRegionsCustomBorder:color',
    CustomRegionBorderWidth: 'zav:global:atlasRegionsCustomBorder:width',
  };

  static getLayerKeyPrefix(configId: string, layerId: string) {
    return `zav:${configId}:layer:${layerId}:`;
  }

  static getStrItem(key: string, defaultValue?: string | null) {
    if (window.localStorage) {
      const value = window.localStorage.getItem(key);
      if (value === null && typeof defaultValue !== 'undefined') {
        return defaultValue;
      } else {
        return value;
      }
    } else {
      return null;
    }
  }

  static setStrItem(key: string, value?: string) {
    if (window.localStorage && typeof value !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  }

  static setBoolItem(key: string, value: boolean | string) {
    const boolValue = typeof value === 'boolean' ? value : String(value) === 'true';

    UserSettings.setStrItem(key, String(boolValue));
  }

  static getBoolItem(key: string, defaultValue?: boolean | null) {
    const strValue = UserSettings.getStrItem(key);
    if (strValue === null) {
      return defaultValue;
    } else {
      return strValue === 'true';
    }
  }

  static setNumItem(key: string, value: number | string) {
    const numValue = Number.isInteger(value) ? Number.parseInt(String(value), 10) : Number.parseFloat(String(value));
    if (!Number.isNaN(numValue)) {
      UserSettings.setStrItem(key, String(numValue));
    }
  }

  static getNumItem(key: string, defaultValue?: number | null) {
    const strValue = UserSettings.getStrItem(key);
    if (strValue === null) {
      return defaultValue;
    } else {
      return Number(strValue);
    }
  }
}

export default UserSettings;
