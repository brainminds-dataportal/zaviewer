import { AnchorButton, Classes, ProgressBar, Switch } from '@blueprintjs/core';
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

const LayerSlider = ({
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
}: LayerSliderProps) => {
  const safeChosenSlice = Number.isFinite(chosenSlice) ? chosenSlice : 0;
  const safeOpacity = typeof opacity === 'number' ? opacity : 0;
  const safeInitOpacity = typeof initOpacity === 'number' ? initOpacity : 0;
  const safeContrast = typeof contrast === 'number' ? contrast : 0;
  const safeInitContrast = typeof initContrast === 'number' ? initContrast : 0;
  const safeGamma = typeof gamma === 'number' ? gamma : 0;
  const safeInitGamma = typeof initGamma === 'number' ? initGamma : 0;
  const safeDilation = typeof dilation === 'number' ? dilation : 0;
  const isEnabled = Boolean(enabled);
  const isContrastEnabled = Boolean(contrastEnabled);
  const isGammaEnabled = Boolean(gammaEnabled);
  const isEnhanceSignalEnabled = Boolean(enhanceSignal);
  const isManualEnhancing = Boolean(manualEnhancing);
  const isLayerLoading = Boolean(loading);

  const handleOpacityChange = (value: number) => {
    ViewerManager.changeLayerOpacity(layerid, isEnabled, value);
  };

  const handleCheckedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    ViewerManager.changeLayerOpacity(layerid, event.target.checked, safeOpacity);
  };

  const handleContrastChange = (value: number) => {
    ViewerManager.changeLayerContrast(layerid, isContrastEnabled, Math.round(value * 100) / 100);
  };

  const handleContrastCheck = (event: React.ChangeEvent<HTMLInputElement>) => {
    ViewerManager.changeLayerContrast(layerid, event.target.checked, safeContrast);
  };

  const handleGammaChange = (value: number) => {
    ViewerManager.changeLayerGamma(layerid, isGammaEnabled, Math.round(value * 100) / 100);
  };

  const handleGammaCheck = (event: React.ChangeEvent<HTMLInputElement>) => {
    ViewerManager.changeLayerGamma(layerid, event.target.checked, safeGamma);
  };

  const handleEnhanceCheck = (event: React.ChangeEvent<HTMLInputElement>) => {
    ViewerManager.changeLayerDilation(layerid, event.target.checked, isManualEnhancing, safeDilation);
  };

  const handleManualEnhanceCheck = (event: React.ChangeEvent<HTMLInputElement>) => {
    ViewerManager.changeLayerDilation(layerid, isEnhanceSignalEnabled, event.target.checked, safeDilation);
  };

  const handleDilationChange = (value: number) => {
    ViewerManager.changeLayerDilation(layerid, isEnhanceSignalEnabled, isManualEnhancing, value);
  };

  return (
    <div className="zav-LayerSlider">
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
        <span className="zav-AdjusterToggle" title="toggle layer's visibility">
          <Switch checked={isEnabled} onChange={handleCheckedChange} inline />
        </span>
        <div className="zav-AdjusterControl">
          <ParamAdjusterLabel
            icon="eye-open"
            label="Opacity"
            min={0}
            max={100}
            stepSize={1}
            onChange={handleOpacityChange}
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
      </div>

      {isTracer ? (
        <div className="zav-AdjusterItem zav-AdjusterItemIndented">
          <span className="zav-AdjusterToggle" title="toggle Tracer mask enhancer">
            <Switch checked={isEnhanceSignalEnabled} onChange={handleEnhanceCheck} inline disabled={!isEnabled} />
          </span>

          <div className="zav-AdjusterControl">
            <ParamAdjusterLabel
              icon="heatmap"
              label="Tracer enhancing factor"
              noAdjust={!isEnhanceSignalEnabled || !isManualEnhancing}
              min={0}
              max={21}
              stepSize={2}
              onChange={handleDilationChange}
              value={safeDilation}
              enabled={isEnabled && isEnhanceSignalEnabled}
            />
          </div>

          <span className="zav-AdjusterToggle zav-AdjusterToggleSecondary" title="manually set enhancement factor">
            <Switch
              checked={isManualEnhancing}
              onChange={handleManualEnhanceCheck}
              inline
              disabled={!isEnabled || !isEnhanceSignalEnabled}
            />
          </span>
        </div>
      ) : (
        <React.Fragment>
          <div className="zav-AdjusterItem zav-AdjusterItemIndented">
            <span className="zav-AdjusterToggle" title="toggle layer's contrast correction">
              <Switch checked={isContrastEnabled} onChange={handleContrastCheck} inline disabled={!isEnabled} />
            </span>

            <div className="zav-AdjusterControl">
              <ParamAdjusterLabel
                icon="contrast"
                label="Contrast"
                min={0}
                max={4.5}
                stepSize={0.01}
                onChange={handleContrastChange}
                value={safeContrast}
                defaultValue={safeInitContrast}
                enabled={isEnabled && isContrastEnabled}
              />
            </div>
          </div>

          <div className="zav-AdjusterItem zav-AdjusterItemIndented">
            <span className="zav-AdjusterToggle" title="toggle layer's gamma correction">
              <Switch checked={isGammaEnabled} onChange={handleGammaCheck} inline disabled={!isEnabled} />
            </span>

            <div className="zav-AdjusterControl">
              <ParamAdjusterLabel
                icon={
                  <span
                    className={Classes.ICON}
                    style={{ display: 'inline-block', width: 16, marginRight: 10, textAlign: 'right' }}
                  >
                    𝛄
                  </span>
                }
                label="Gamma"
                min={0}
                max={4.5}
                stepSize={0.01}
                onChange={handleGammaChange}
                value={safeGamma}
                defaultValue={safeInitGamma}
                enabled={isEnabled && isGammaEnabled}
              />
            </div>
          </div>
        </React.Fragment>
      )}
    </div>
  );
};

const SliderNavigatorPanel = (props: SliderNavigatorPanelProps) => {
  const buildLayerSliderProps = (layerid: string, layerValue: LayerDisplaySetting): LayerSliderProps => {
    const downloadFolder = props.layerFolderMap?.[layerValue.name];
    const downloadUrl =
      props.ginRepoBaseUrl && downloadFolder ? `${props.ginRepoBaseUrl}/raw/master/${downloadFolder}/` : undefined;

    return {
      layerid,
      name: layerValue.name,
      chosenSlice: props.chosenSlice,
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
  };

  const layerSliders: React.ReactElement[] = [];
  if (props.displaySettings) {
    Object.entries(props.displaySettings).forEach(([layerid, value]) => {
      const sliderProps = buildLayerSliderProps(layerid, value);
      layerSliders.push(<LayerSlider key={`slid_${layerid}`} {...sliderProps} />);
      layerSliders.push(
        <div key={`sepslid_${layerid}`} style={{ borderBottom: 'dotted 1px #8a8a8a', margin: '3px 0' }} />,
      );
    });
  }
  layerSliders.reverse();

  return <div className="zav-LayersPanel">{layerSliders.slice(1)}</div>;
};

export default SliderNavigatorPanel;
