import { AnchorButton, ProgressBar, Switch } from '@blueprintjs/core';
import React from 'react';
import ViewerManager from '../ViewerManager';
import ParamAdjusterLabel from './ParamAdjusterLabel';
import type { LayerDisplaySetting, LayerDisplaySettings } from './ViewerPanelTypes';

import './SliderNavigatorPanel.scss';

type LayerSliderProps = {
  layerid: string;
  name: string;
  downloadUrl?: string;
  chosenSlice?: number;
  opacity?: number;
  initOpacity?: number;
  enabled?: boolean;
  contrast?: number;
  initContrast?: number;
  contrastEnabled?: boolean;
  gamma?: number;
  initGamma?: number;
  gammaEnabled?: boolean;
  isTracer?: boolean;
  enhanceSignal?: boolean;
  manualEnhancing?: boolean;
  dilation?: number;
  loading?: boolean;
};

type SliderNavigatorPanelProps = {
  displaySettings?: LayerDisplaySettings;
  ginRepoBaseUrl?: string | null;
  layerFolderMap?: Record<string, string> | null;
  chosenSlice?: number;
  hasDelineation?: boolean;
};

class LayerSlider extends React.Component<LayerSliderProps> {
  constructor(props: LayerSliderProps) {
    super(props);

    this.handleOpacityChange = this.handleOpacityChange.bind(this);
    this.handleCheckedChange = this.handleCheckedChange.bind(this);
  }
  render() {
    const {
      layerid,
      name,
      downloadUrl,
      chosenSlice,
      opacity,
      initOpacity,
      enabled,
      contrast,
      initContrast,
      contrastEnabled,
      gamma,
      initGamma,
      gammaEnabled,
      isTracer,
      enhanceSignal,
      manualEnhancing,
      dilation,
      loading,
    } = this.props;

    const safeChosenSlice = Number.isFinite(chosenSlice) ? chosenSlice : 0;
    const safeOpacity = Number.isFinite(opacity) ? opacity : 0;
    const safeInitOpacity = Number.isFinite(initOpacity) ? initOpacity : 0;
    const safeContrast = Number.isFinite(contrast) ? contrast : 0;
    const safeInitContrast = Number.isFinite(initContrast) ? initContrast : 0;
    const safeGamma = Number.isFinite(gamma) ? gamma : 0;
    const safeInitGamma = Number.isFinite(initGamma) ? initGamma : 0;
    const safeDilation = Number.isFinite(dilation) ? dilation : 0;
    const isEnabled = Boolean(enabled);
    const isContrastEnabled = Boolean(contrastEnabled);
    const isGammaEnabled = Boolean(gammaEnabled);
    const isEnhanceSignalEnabled = Boolean(enhanceSignal);
    const isManualEnhancing = Boolean(manualEnhancing);
    const isLayerLoading = Boolean(loading);

    return (
      <div style={{ width: 216, marginLeft: 10 }}>
        <div>
          <div style={{ position: 'relative' }}>
            <span>{name}</span>
            {downloadUrl ? (
              <span style={{ position: 'absolute', top: 2, right: 0 }} title="Download source image">
                <AnchorButton
                  small
                  icon="download"
                  href={`${downloadUrl}slice1${String(safeChosenSlice).padStart(4, '0')}.png`}
                  target="_blank"
                />
              </span>
            ) : null}
          </div>

          <div className="zav-thinProgressBar" style={{ width: 186 }}>
            {isLayerLoading && isEnabled ? <ProgressBar className="zav-thinProgressBar" /> : null}
          </div>
        </div>
        <div className="zav-AdjusterItem">
          <span title="toggle layer's visibility">
            <Switch checked={isEnabled} onChange={this.handleCheckedChange.bind(this, layerid, safeOpacity)} inline />
          </span>
          <ParamAdjusterLabel
            icon="eye-open"
            label="Opacity"
            min={0}
            max={100}
            stepSize={1}
            onChange={this.handleOpacityChange.bind(this, layerid, isEnabled)}
            value={safeOpacity}
            defaultValue={safeInitOpacity}
            labelRenderer={(value) => (
              <span>
                {value}
                <span style={{ fontSize: 8 }}>&nbsp;%</span>
              </span>
            )}
            enabled={isEnabled}
          />
        </div>

        {isTracer ? (
          <div className="zav-AdjusterItem" style={{ marginLeft: 6 }}>
            <span title="toggle Tracer mask enhancer">
              <Switch
                checked={isEnhanceSignalEnabled}
                onChange={this.handleEnhanceCheck.bind(this, layerid, isManualEnhancing, safeDilation)}
                inline
                disabled={!isEnabled}
              />
            </span>

            <ParamAdjusterLabel
              icon="heatmap"
              label="Tracer enhancing factor"
              noAdjust={!isEnhanceSignalEnabled || !isManualEnhancing}
              min={0}
              max={21}
              stepSize={2}
              onChange={this.handleDilationChange.bind(this, layerid, isEnhanceSignalEnabled, isManualEnhancing)}
              value={safeDilation}
              enabled={isEnabled && isEnhanceSignalEnabled}
            />

            <span title="manually set enhancement factor" style={{ paddingLeft: 4 }}>
              <Switch
                checked={isManualEnhancing}
                onChange={this.handleManualEnhanceCheck.bind(this, layerid, isEnhanceSignalEnabled, safeDilation)}
                inline
                disabled={!isEnabled || !isEnhanceSignalEnabled}
              />
            </span>
          </div>
        ) : (
          <React.Fragment>
            <div className="zav-AdjusterItem" style={{ marginLeft: 6 }}>
              <span title="toggle layer's contrast correction">
                <Switch
                  checked={isContrastEnabled}
                  onChange={this.handleContrastCheck.bind(this, layerid, safeContrast)}
                  inline
                  disabled={!isEnabled}
                />
              </span>

              <ParamAdjusterLabel
                icon="contrast"
                label="Contrast"
                min={0}
                max={4.5}
                stepSize={0.01}
                onChange={this.handleContrastChange.bind(this, layerid, isContrastEnabled)}
                value={safeContrast}
                defaultValue={safeInitContrast}
                enabled={isEnabled && isContrastEnabled}
              />
            </div>

            <div className="zav-AdjusterItem" style={{ marginLeft: 6 }}>
              <span title="toggle layer's gamma correction">
                <Switch
                  checked={isGammaEnabled}
                  onChange={this.handleGammaCheck.bind(this, layerid, safeGamma)}
                  inline
                  disabled={!isEnabled}
                />
              </span>

              <ParamAdjusterLabel
                icon={
                  <span
                    className="bp3-icon"
                    style={{ display: 'inline-block', width: 16, marginRight: 10, texAlign: 'right' }}
                  >
                    𝛄
                  </span>
                }
                label="Gamma"
                min={0}
                max={4.5}
                stepSize={0.01}
                onChange={this.handleGammaChange.bind(this, layerid, isGammaEnabled)}
                value={safeGamma}
                defaultValue={safeInitGamma}
                enabled={isEnabled && isGammaEnabled}
              />
            </div>
          </React.Fragment>
        )}
      </div>
    );
  }

  handleOpacityChange(layerid: string, enabled: boolean, value: number) {
    ViewerManager.changeLayerOpacity(layerid, enabled, value);
  }
  handleCheckedChange(layerid: string, opacity: number, event: React.ChangeEvent<HTMLInputElement>) {
    ViewerManager.changeLayerOpacity(layerid, event.target.checked, opacity);
  }

  handleContrastChange(layerid: string, enabled: boolean, value: number) {
    ViewerManager.changeLayerContrast(layerid, enabled, Math.round(value * 100) / 100);
  }
  handleContrastCheck(layerid: string, contrast: number, event: React.ChangeEvent<HTMLInputElement>) {
    ViewerManager.changeLayerContrast(layerid, event.target.checked, contrast);
  }

  handleGammaChange(layerid: string, enabled: boolean, value: number) {
    ViewerManager.changeLayerGamma(layerid, enabled, Math.round(value * 100) / 100);
  }
  handleGammaCheck(layerid: string, gamma: number, event: React.ChangeEvent<HTMLInputElement>) {
    ViewerManager.changeLayerGamma(layerid, event.target.checked, gamma);
  }

  handleEnhanceCheck(
    layerid: string,
    manualEnhancing: boolean,
    dilation: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    ViewerManager.changeLayerDilation(layerid, event.target.checked, manualEnhancing, dilation);
  }
  handleManualEnhanceCheck(
    layerid: string,
    enabled: boolean,
    dilation: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    ViewerManager.changeLayerDilation(layerid, enabled, event.target.checked, dilation);
  }
  handleDilationChange(layerid: string, enabled: boolean, manualEnhancing: boolean, dilation: number) {
    ViewerManager.changeLayerDilation(layerid, enabled, manualEnhancing, dilation);
  }
}

class SliderNavigatorPanel extends React.Component<SliderNavigatorPanelProps> {
  private buildLayerSliderProps(layerid: string, layerValue: LayerDisplaySetting): LayerSliderProps {
    const downloadFolder = this.props.layerFolderMap?.[layerValue.name];
    const downloadUrl =
      this.props.ginRepoBaseUrl && downloadFolder
        ? `${this.props.ginRepoBaseUrl}/raw/master/${downloadFolder}/`
        : undefined;

    return {
      layerid,
      name: layerValue.name,
      chosenSlice: this.props.chosenSlice,
      downloadUrl,
      opacity: typeof layerValue.opacity === 'number' ? layerValue.opacity : undefined,
      initOpacity: typeof layerValue.initOpacity === 'number' ? layerValue.initOpacity : undefined,
      enabled: typeof layerValue.enabled === 'boolean' ? layerValue.enabled : undefined,
      contrast: typeof layerValue.contrast === 'number' ? layerValue.contrast : undefined,
      initContrast: typeof layerValue.initContrast === 'number' ? layerValue.initContrast : undefined,
      contrastEnabled: typeof layerValue.contrastEnabled === 'boolean' ? layerValue.contrastEnabled : undefined,
      gamma: typeof layerValue.gamma === 'number' ? layerValue.gamma : undefined,
      initGamma: typeof layerValue.initGamma === 'number' ? layerValue.initGamma : undefined,
      gammaEnabled: typeof layerValue.gammaEnabled === 'boolean' ? layerValue.gammaEnabled : undefined,
      isTracer: typeof layerValue.isTracer === 'boolean' ? layerValue.isTracer : undefined,
      enhanceSignal: typeof layerValue.enhanceSignal === 'boolean' ? layerValue.enhanceSignal : undefined,
      manualEnhancing: typeof layerValue.manualEnhancing === 'boolean' ? layerValue.manualEnhancing : undefined,
      dilation: typeof layerValue.dilation === 'number' ? layerValue.dilation : undefined,
      loading: typeof layerValue.loading === 'boolean' ? layerValue.loading : undefined,
    };
  }

  render() {
    const layerSliders: React.ReactElement[] = [];
    if (this.props.displaySettings) {
      Object.entries(this.props.displaySettings).forEach(([layerid, value]) => {
        const sliderProps = this.buildLayerSliderProps(layerid, value);
        layerSliders.push(<LayerSlider key={`slid_${layerid}`} {...sliderProps} />);
        layerSliders.push(
          <div key={`sepslid_${layerid}`} style={{ borderBottom: 'dotted 1px #8a8a8a', margin: '3px 0' }} />,
        );
      });
    }
    layerSliders.reverse();

    return <React.Fragment>{layerSliders.slice(1)}</React.Fragment>;
  }
}

export default SliderNavigatorPanel;
