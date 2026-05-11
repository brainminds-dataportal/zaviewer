import {
  Alignment,
  Button,
  ButtonGroup,
  Classes,
  Menu,
  MenuDivider,
  MenuItem,
  PopoverInteractionKind,
  PopoverNext,
  Slider,
  Switch,
} from '@blueprintjs/core';
import React from 'react';

import { HexColorPicker } from 'react-colorful';

import RegionsManager from '../RegionsManager';
import ViewerManager from '../ViewerManager';

import './RegionEditPanel.scss';

const REGIONEDITOR_ACTIONSOURCEID = 'REGEDIT';

type RegionShapeInfo = {
  pathId: string;
  fill: string;
  abbrev: string;
};

type ColorBulletProps = {
  color: string | null;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  label?: string;
};

type RegionEditPanelProps = {
  editingTool: string;
  editPathId?: string | null;
  editPathFillColor?: string | null;
  editingToolRadius: number;
  lastSelectedPath?: string | null;
  editModeOn?: boolean;
  editingActive?: boolean;
};

const ColorBullet = (props: ColorBulletProps) => {
  const bulletStyle = { backgroundColor: props.color ?? undefined };
  return props.onClick ? (
    <button
      type="button"
      className="zav-colorbullet"
      style={bulletStyle}
      onClick={props.onClick}
      aria-label={props.label ?? 'Select color'}
    />
  ) : (
    <span className="zav-colorbullet" style={bulletStyle} />
  );
};

const RegionGrid = () => {
  const regionActionner = RegionsManager.getActionner(REGIONEDITOR_ACTIONSOURCEID);
  const regionsMap = ViewerManager.getCurrentSliceRegions() as Map<string, RegionShapeInfo> | null;
  const regionsInfo = regionsMap ? Array.from(regionsMap.values()) : [];

  const onSelectClick = (regionInfo: RegionShapeInfo) => {
    regionActionner.replaceSelected(regionInfo.abbrev, false);
    ViewerManager.setLastSelectedPath(regionInfo.pathId);
  };

  const onCenterClick = (regionInfo: RegionShapeInfo) => {
    ViewerManager.centerOnRegions([regionInfo.abbrev]);
  };

  const onStartEditClick = (regionInfo: RegionShapeInfo) => {
    regionActionner.replaceSelected(regionInfo.abbrev, false);
    ViewerManager.startEditRegionPath(regionInfo.pathId);
  };

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 20px',
          gap: '3px 6px',
          alignItems: 'center',
          maxHeight: '50vh',
          overflowY: 'scroll',
          margin: '0 -10px',
          padding: '5px 10px',
        }}
      >
        {regionsInfo.map((ri) => (
          <React.Fragment key={`frg-${ri.pathId}`}>
            <button
              type="button"
              key={`lbl-${ri.pathId}`}
              className="zav-regiongrid-item zav-regiongrid-label"
              onClick={() => onSelectClick(ri)}
              onDoubleClick={() => onCenterClick(ri)}
              style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }}
            >
              {ri.pathId}
            </button>
            <button
              type="button"
              key={`clr-${ri.pathId}`}
              className="zav-regiongrid-item zav-regiongrid-color"
              onClick={() => onStartEditClick(ri)}
              style={{ background: 'none', border: 0, padding: 0 }}
              aria-label={`Edit region ${ri.pathId}`}
            >
              <ColorBullet color={ri.fill} />
            </button>
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          textAlign: 'right',
          fontSize: 'small',
          margin: '6px 0 -10px 0',
          border: 'solid 1px #eaeaea',
          borderRadius: 5,
          padding: '2px 6px',
        }}
      >
        {`Nb regions: ${regionsInfo.length}`}
      </div>
    </div>
  );
};

const RegionEditPanel = (props: RegionEditPanelProps) => {
  const editingTools: Record<
    string,
    { toolid: string; icon: React.ComponentProps<typeof Button>['icon']; title: string }
  > = {
    pen: { toolid: 'pen', icon: 'draw', title: 'tool to extend region' },
    eraser: { toolid: 'eraser', icon: 'eraser', title: 'tool to reduce region' },
  };
  const activeTool = editingTools[props.editingTool as keyof typeof editingTools] ?? editingTools.pen;
  const isEditing = props.editPathId;

  let pathIdBase = '';
  let pathIdSuffix = '';
  let color: string | null = null;

  let displayedPathId: string | null = null;
  if (props.editPathId) {
    displayedPathId = props.editPathId;
    color = props.editPathFillColor ?? null;
  } else {
    displayedPathId = ViewerManager.getLastSelectedPath() ?? null;
  }

  const regionsMap = ViewerManager.getCurrentSliceRegions() as Map<string, RegionShapeInfo> | null;
  const regionsInfo = displayedPathId ? regionsMap?.get(displayedPathId) : undefined;
  if (displayedPathId && regionsInfo) {
    const sepIndex = displayedPathId.lastIndexOf('-');
    pathIdBase = displayedPathId.substring(0, sepIndex);
    pathIdSuffix = displayedPathId.substring(sepIndex);
    color = regionsInfo.fill;
  }

  const handleChangeRegionName = (event: React.ChangeEvent<HTMLInputElement>) => {
    ViewerManager.changeEditedRegionName(event.target.value.trim());
    event.preventDefault();
  };

  return (
    <div style={{ backgroundColor: '#f4f4f4', margin: '0 -5px', padding: 3, borderRadius: 2, color: 'black' }}>
      <div
        style={{
          margin: 3,
          height: 30,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{'Region Editing'}</span>
      </div>

      <div
        style={{
          margin: 3,
          height: 30,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <Switch
            checked={Boolean(isEditing)}
            alignIndicator={Alignment.RIGHT}
            disabled={!isEditing && !displayedPathId}
            onChange={(_e) => {
              if (isEditing) {
                ViewerManager.stopEditingRegion();
              } else {
                ViewerManager.startEditingClickedRegion();
              }
            }}
            large={true}
          />
        </div>
        <div>
          <input
            id="regionedit-name-abbrev"
            type="text"
            className={Classes.INPUT}
            style={{ width: 110, fontSize: 'small', padding: '0 2px', textAlign: 'right' }}
            placeholder="region name"
            maxLength={18}
            value={pathIdBase}
            onChange={handleChangeRegionName}
            disabled={!isEditing}
          />
          <input
            id="regionedit-name-suffix"
            type="text"
            className={Classes.INPUT}
            style={{ width: 34, fontSize: 'small', padding: '0 2px', textAlign: 'left' }}
            disabled={true}
            value={pathIdSuffix}
          />
          <PopoverNext
            interactionKind={PopoverInteractionKind.HOVER}
            placement={'left'}
            popoverClassName={Classes.POPOVER_CONTENT_SIZING}
            disabled={!isEditing}
            content={
              <div style={{ padding: 10 }}>
                <style>
                  {`
                    #zav_editregioncolorpicker .react-colorful__saturation-pointer,
                    #zav_editregioncolorpicker .react-colorful__hue-pointer,
                    #zav_editregioncolorpicker .react-colorful__alpha-pointer {
                      width: 14px;
                      height: 14px;
                    }
                  `}
                </style>
                <HexColorPicker
                  id="zav_editregioncolorpicker"
                  style={{ width: 180, height: 180 }}
                  color={color ?? '#000000'}
                  onChange={(nextColor) => ViewerManager.changeEditedRegionFill(nextColor)}
                />
              </div>
            }
          >
            <ColorBullet color={color ?? '#000000'} label="Edit region color" />
          </PopoverNext>
        </div>
      </div>

      <div style={{ margin: 3, height: 30, display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
        <ButtonGroup>
          <PopoverNext
            interactionKind={PopoverInteractionKind.HOVER}
            placement={'left'}
            popoverClassName={Classes.POPOVER_CONTENT_SIZING}
            lazy
            content={<RegionGrid />}
          >
            <Button icon="property" title="view list of regions" outlined={true} />
          </PopoverNext>

          <PopoverNext
            interactionKind={PopoverInteractionKind.HOVER}
            placement={'bottom-start'}
            content={
              <Menu>
                <MenuItem
                  icon="document"
                  text="Create an empty region container"
                  onClick={(_e) => ViewerManager.createSVGForRegions()}
                />
                <MenuDivider />
                <MenuItem
                  icon="new-drawing"
                  text="Create a new region"
                  onClick={(_e) => ViewerManager.createPathForRegion('NEW_REGION', '#F00', '#0F0')}
                />
              </Menu>
            }
          >
            <Button icon="caret-down" />
          </PopoverNext>
        </ButtonGroup>

        <ButtonGroup>
          <Button icon={activeTool.icon} title={activeTool.title} outlined={true} active={Boolean(isEditing)} />

          <PopoverNext
            interactionKind={PopoverInteractionKind.HOVER}
            placement={'bottom-start'}
            content={
              <Menu>
                {Object.values(editingTools).map((tool) => (
                  <MenuItem
                    key={tool.toolid}
                    icon={tool.icon}
                    text={tool.title}
                    onClick={(_e) => ViewerManager.changeEditingTool(tool.toolid)}
                  />
                ))}
              </Menu>
            }
          >
            <Button icon="caret-down" />
          </PopoverNext>
        </ButtonGroup>

        <PopoverNext
          interactionKind={PopoverInteractionKind.HOVER}
          placement={'left'}
          popoverClassName={Classes.POPOVER_CONTENT_SIZING}
          lazy
          content={
            <div>
              <Slider
                min={10}
                max={200}
                stepSize={1}
                value={props.editingToolRadius}
                showTrackFill={true}
                labelStepSize={50}
                labelRenderer={(value) => String(value)}
                vertical={true}
                onChange={(radius) => ViewerManager.changeEditingRadius(radius)}
              />
            </div>
          }
        >
          <Button icon="ring" title="Change tool's width" outlined={true} />
        </PopoverNext>

        <Button
          icon="clean"
          disabled={!isEditing}
          title="Simplify current region"
          outlined={true}
          onClick={(_e) => ViewerManager.simplifyEditedRegion()}
        />
      </div>
    </div>
  );
};

export default RegionEditPanel;
