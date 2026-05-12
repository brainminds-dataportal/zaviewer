import {
  AnchorButton,
  Icon,
  PopoverInteractionKind,
  PopoverNext,
  Position,
  popoverPositionToNextPlacement,
  Slider,
  Switch,
} from '@blueprintjs/core';
import React from 'react';

import ViewerManager from '../ViewerManager';

import MetadataView from './MetadataView';
import type { LayerDisplaySettings, ViewerConfigLike } from './ViewerPanelTypes';

import './QuickActionButtons.scss';

type QuickActionButtonsProps = {
  hasDelineation?: boolean;
  displaySettings?: LayerDisplaySettings;
  showRegions?: boolean;
  activePlane?: number;
  chosenSlice?: number;
  config?: ViewerConfigLike;
  tourMenu?: React.ReactNode;
};

const getActivePlaneFromProps = (props: QuickActionButtonsProps) => {
  if (typeof props.activePlane === 'number') {
    return props.activePlane;
  }
  if (props.config && 'firstActivePlane' in props.config && typeof props.config.firstActivePlane === 'number') {
    return props.config.firstActivePlane;
  }
  return ViewerManager.getActivePlane();
};

const getCurrentSliceFromProps = (props: QuickActionButtonsProps) => {
  const activePlane = getActivePlaneFromProps(props);
  const planeSlideCount =
    props.config && ViewerManager.config ? (ViewerManager.getPlaneSlideCount(activePlane) ?? 1001) : 1001;
  const maxSliceNum = Math.max(Number.isFinite(planeSlideCount) ? planeSlideCount - 1 : 1000, 0);
  const requestedSlice = typeof props.chosenSlice === 'number' ? props.chosenSlice : 0;
  return Math.min(Math.max(requestedSlice, 0), maxSliceNum);
};

const QuickActionButtonsComponent = (props: QuickActionButtonsProps) => {
  const [displayedSlice, setDisplayedSlice] = React.useState(() => getCurrentSliceFromProps(props));
  const [isDraggingSlice, setIsDraggingSlice] = React.useState(false);

  const handleClickHideShow = React.useCallback(() => {
    if (props.showRegions) {
      ViewerManager.hideRegions();
    } else {
      ViewerManager.toggleAreaDisplay();
    }
  }, [props.showRegions]);

  const handleLayerEnabledChange = React.useCallback(
    (layerid: string, opacity: number, event: React.ChangeEvent<HTMLInputElement>) => {
      ViewerManager.changeLayerOpacity(layerid, event.target.checked, opacity);
    },
    [],
  );

  const onShiftToSlice = React.useCallback((increment: number) => {
    ViewerManager.shiftToSlice(increment);
  }, []);

  const handleSliceChange = React.useCallback((sliceNum: number) => {
    setDisplayedSlice(sliceNum);
    setIsDraggingSlice(true);
    ViewerManager.goToSlice(sliceNum);
  }, []);

  const handleSliceRelease = React.useCallback((sliceNum: number) => {
    setDisplayedSlice(sliceNum);
    setIsDraggingSlice(false);
  }, []);

  const endSliceSliderInteraction = React.useCallback(() => {
    ViewerManager.setMouseNavigationEnabled(true);
    setIsDraggingSlice(false);
    window.removeEventListener('pointerup', endSliceSliderInteraction, true);
    window.removeEventListener('pointercancel', endSliceSliderInteraction, true);
  }, []);

  const startSliceSliderInteraction = React.useCallback(() => {
    ViewerManager.setMouseNavigationEnabled(false);
    window.addEventListener('pointerup', endSliceSliderInteraction, true);
    window.addEventListener('pointercancel', endSliceSliderInteraction, true);
  }, [endSliceSliderInteraction]);

  React.useEffect(() => endSliceSliderInteraction, [endSliceSliderInteraction]);

  const currentSlice = getCurrentSliceFromProps(props);
  React.useEffect(() => {
    if (!isDraggingSlice && displayedSlice !== currentSlice) {
      setDisplayedSlice(currentSlice);
    }
  }, [currentSlice, displayedSlice, isDraggingSlice]);

  const tracerLayer = Object.values(props.displaySettings ?? {}).find((layer) => layer.isTracer);
  const tourMenu = props.tourMenu;
  const showRegions = Boolean(props.showRegions);
  const tracerLayerEnabled = Boolean(tracerLayer?.enabled);
  const tracerLayerOpacity = typeof tracerLayer?.opacity === 'number' ? tracerLayer.opacity : 0;

  const activePlane = getActivePlaneFromProps(props);
  const planeSlideCount =
    props.config && ViewerManager.config ? (ViewerManager.getPlaneSlideCount(activePlane) ?? 1001) : 1001;
  const maxSliceNum = Math.max(Number.isFinite(planeSlideCount) ? planeSlideCount - 1 : 1000, 0);
  const clampedCurrentSlice = Math.min(Math.max(currentSlice, 0), maxSliceNum);
  const clampedDisplayedSlice = Math.min(
    Math.max(Number.isFinite(displayedSlice) ? displayedSlice : clampedCurrentSlice, 0),
    maxSliceNum,
  );

  return (
    <>
      <PopoverNext
        interactionKind={PopoverInteractionKind.HOVER}
        content={tourMenu ? <div>{tourMenu}</div> : undefined}
        placement={popoverPositionToNextPlacement(Position.LEFT_BOTTOM)}
      >
        <div title="Help and guided tours!">
          <Icon
            icon="help"
            color="#FFF"
            style={{
              margin: '18px 0px 20px 0px',
            }}
          />
        </div>
      </PopoverNext>

      {props.config?.dataset_info ? (
        <PopoverNext
          content={
            <div style={{ width: '70vw', maxWidth: 850, height: '90vh', overflowY: 'auto' }}>
              <MetadataView infoDataset={props.config.dataset_info} includeThumbnail={true} />
            </div>
          }
          placement={popoverPositionToNextPlacement(Position.LEFT)}
          interactionKind={PopoverInteractionKind.HOVER}
        >
          <div title="display dataset informations">
            <Icon
              icon="info-sign"
              color="#FFF"
              style={{
                margin: '6px 0px 10px 0px',
              }}
            />
          </div>
        </PopoverNext>
      ) : null}

      <div
        className="zav-QuickActionPanel"
        style={{
          height: '100%',
        }}
      >
        <div className="zav-ActionContainer"></div>

        {props.hasDelineation ? (
          <div className="zav-ActionContainer zav-QuickToogleDelineationButton" title="toggle display of regions">
            <Switch checked={showRegions} onChange={handleClickHideShow} />
          </div>
        ) : null}

        {props.config && props.config.getTotalSlidesCount() > 1 ? (
          <div className="zav-QuickNavButtons">
            <div className="zav-ActionContainer">
              <AnchorButton
                icon="double-chevron-right"
                small
                title="go to 10 slices forward"
                onClick={() => onShiftToSlice(10)}
              />
            </div>
            <div className="zav-ActionContainer">
              <AnchorButton icon="chevron-right" small title="go to next slice" onClick={() => onShiftToSlice(1)} />
            </div>

            <div
              className="zav-ActionContainer"
              title={`slice #${clampedCurrentSlice} of ${maxSliceNum}`}
              style={{ paddingTop: 14 }}
            >
              <PopoverNext
                interactionKind={PopoverInteractionKind.HOVER}
                placement={popoverPositionToNextPlacement(Position.LEFT)}
                rootBoundary="viewport"
                lazy
                content={
                  <div style={{ padding: '14px 10px 8px 10px' }}>
                    <Icon
                      icon="chevron-left"
                      title="go to previous slice"
                      style={{ paddingRight: 10, verticalAlign: 'top' }}
                      onClick={() => onShiftToSlice(-1)}
                    />
                    <div
                      className="zav-QActSlicePopupSlider"
                      onPointerDownCapture={startSliceSliderInteraction}
                      onPointerUpCapture={endSliceSliderInteraction}
                      onPointerCancelCapture={endSliceSliderInteraction}
                    >
                      <Slider
                        className="zav-Slider zav-QActSliceSlider"
                        min={0}
                        max={maxSliceNum}
                        stepSize={1}
                        onChange={handleSliceChange}
                        onRelease={handleSliceRelease}
                        value={clampedDisplayedSlice}
                        showTrackFill={false}
                        labelStepSize={maxSliceNum}
                        labelRenderer={(value) => String(value)}
                      />
                    </div>
                    <Icon
                      icon="chevron-right"
                      title="go to next slice"
                      style={{ paddingLeft: 10, verticalAlign: 'top' }}
                      onClick={() => onShiftToSlice(1)}
                    />
                  </div>
                }
              >
                <AnchorButton icon="multi-select" small />
              </PopoverNext>
              <div
                style={{
                  color: '#FFF',
                  fontSize: '12px',
                  lineHeight: '13px',
                  padding: '4px 14px 4px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
                <span>{clampedCurrentSlice}</span>
                <span
                  style={{
                    textDecoration: 'overline',
                    textDecorationColor: '#137cbd',
                  }}
                >
                  {maxSliceNum}
                </span>
              </div>
            </div>

            <div className="zav-ActionContainer">
              <AnchorButton icon="chevron-left" small title="go to previous slice" onClick={() => onShiftToSlice(-1)} />
            </div>
            <div className="zav-ActionContainer">
              <AnchorButton
                icon="double-chevron-left"
                small
                title="go to 10 slices backward"
                onClick={() => onShiftToSlice(-10)}
              />
            </div>
          </div>
        ) : null}

        {tracerLayer ? (
          <div
            className="zav-ActionContainer"
            title="toggle tracer mask visibility"
            style={{ margin: '20px 0 10px 0' }}
          >
            <Switch
              checked={tracerLayerEnabled}
              onChange={(event) => handleLayerEnabledChange(tracerLayer.key, tracerLayerOpacity, event)}
            />
          </div>
        ) : null}
      </div>
    </>
  );
};

const QuickActionButtons = React.memo(
  QuickActionButtonsComponent,
  (prevProps, nextProps) =>
    prevProps.activePlane === nextProps.activePlane &&
    prevProps.chosenSlice === nextProps.chosenSlice &&
    prevProps.config === nextProps.config &&
    prevProps.showRegions === nextProps.showRegions &&
    prevProps.hasDelineation === nextProps.hasDelineation &&
    prevProps.displaySettings === nextProps.displaySettings &&
    prevProps.tourMenu === nextProps.tourMenu,
);

export default QuickActionButtons;
