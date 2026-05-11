import { HTMLSelect, Switch } from '@blueprintjs/core';
import type React from 'react';
import ViewerManager from '../ViewerManager';
import BorderSettings from './BorderSettings';
import ParamAdjusterLabel from './ParamAdjusterLabel';
import type { AtlasOption } from './ViewerPanelTypes';

type RegionOptionsProps = {
  currentAtlas?: number | null;
  atlases: AtlasOption[];
  resetRegionsTree?: () => void;
  showRegions?: boolean;
  regionsOpacity: number;
  initRegionsOpacity: number;
  displayAreas?: boolean;
  displayBorders?: boolean;
  hasRegionLabels?: boolean;
  displayLabels?: boolean;
  useCustomBorders: boolean;
  customBorderColor: string;
  customBorderWidth: number;
};

const RegionOptions = (props: RegionOptionsProps) => {
  const handleClickHideShow = () => {
    ViewerManager.toggleAreaDisplay();
  };

  const handleOpacityChange = (opacity: number) => {
    ViewerManager.changeRegionsOpacity(opacity / 100);
  };

  const handleBorderChange = () => {
    ViewerManager.toggleBorderDisplay();
  };

  const handleClickLabelsShow = () => {
    ViewerManager.toggleLabelDisplay();
  };

  const handleSelectAtlas = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedAtlasIndex = parseInt(event.currentTarget.value, 10);
    ViewerManager.setSelectedAtlasIndex(selectedAtlasIndex);
    props.resetRegionsTree?.();
  };

  return (
    <div style={{ width: '100%' }}>
      {props.atlases.length ? (
        <span>
          Atlas:
          <div style={{ width: 156, display: 'inline-block', marginLeft: 6 }}>
            <HTMLSelect fill={true} value={String(props.currentAtlas ?? 0)} onChange={handleSelectAtlas}>
              {props.atlases.map((a, index) => (
                <option key={`${a.regionsSVG}-${a.regionsTreeDef}`} value={String(index)}>
                  {a.label}
                </option>
              ))}
            </HTMLSelect>
          </div>
        </span>
      ) : null}
      <div title="adjust regions' area opacity">
        <span title="toggle display of regions' area">
          <Switch checked={Boolean(props.displayAreas)} onChange={handleClickHideShow} inline label="areas" />
        </span>
        <ParamAdjusterLabel
          icon="eye-open"
          label="Opacity"
          min={5}
          max={100}
          stepSize={1}
          onChange={handleOpacityChange}
          value={Math.round(props.regionsOpacity * 100)}
          defaultValue={Math.round(props.initRegionsOpacity * 100)}
          labelRenderer={(value) => (
            <span>
              {value}
              <span style={{ fontSize: 8 }}>&nbsp;%</span>
            </span>
          )}
          enabled={Boolean(props.displayAreas)}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span title="toggle display of regions' border">
          <Switch checked={Boolean(props.displayBorders)} onChange={handleBorderChange} inline label="borders" />
        </span>

        <span title="click to set regions' custom border">
          <BorderSettings
            disabled={!props.displayBorders}
            useCustomBorders={props.useCustomBorders}
            customBorderColor={props.customBorderColor}
            customBorderWidth={props.customBorderWidth}
          />
        </span>
      </div>
      {props.hasRegionLabels ? (
        <div title="toggle display of region labels">
          <Switch checked={Boolean(props.displayLabels)} onChange={handleClickLabelsShow} inline label="labels" />
        </div>
      ) : null}
    </div>
  );
};

export default RegionOptions;
