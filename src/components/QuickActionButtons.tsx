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

type QuickActionButtonsState = {
  displayedSlice: number;
  isDraggingSlice: boolean;
};

class QuickActionButtons extends React.Component<QuickActionButtonsProps, QuickActionButtonsState> {
  constructor(props: QuickActionButtonsProps) {
    super(props);
    this.state = { displayedSlice: this.getCurrentSliceFromProps(props), isDraggingSlice: false };
    this.handleClickHideShow = this.handleClickHideShow.bind(this);
    this.handleSliceChange = this.handleSliceChange.bind(this);
    this.handleSliceRelease = this.handleSliceRelease.bind(this);
    this.endSliceSliderInteraction = this.endSliceSliderInteraction.bind(this);
    this.onShiftToSlice = this.onShiftToSlice.bind(this);
    this.onGoToSlice = this.onGoToSlice.bind(this);
  }

  componentDidUpdate(prevProps: QuickActionButtonsProps) {
    const prevSlice = this.getCurrentSliceFromProps(prevProps);
    const nextSlice = this.getCurrentSliceFromProps(this.props);
    if (!this.state.isDraggingSlice && prevSlice !== nextSlice && this.state.displayedSlice !== nextSlice) {
      this.setState({ displayedSlice: nextSlice });
    }
  }

  componentWillUnmount() {
    this.endSliceSliderInteraction();
  }

  shouldComponentUpdate(nextProps: QuickActionButtonsProps, nextState: QuickActionButtonsState) {
    return (
      nextProps.activePlane !== this.props.activePlane ||
      nextProps.chosenSlice !== this.props.chosenSlice ||
      nextProps.config !== this.props.config ||
      nextProps.showRegions !== this.props.showRegions ||
      nextProps.hasDelineation !== this.props.hasDelineation ||
      nextProps.displaySettings !== this.props.displaySettings ||
      nextProps.tourMenu !== this.props.tourMenu ||
      nextState.displayedSlice !== this.state.displayedSlice ||
      nextState.isDraggingSlice !== this.state.isDraggingSlice
    );
  }

  render() {
    const tracerLayer = Object.values(this.props.displaySettings ?? {}).find((layer) => layer.isTracer);
    const showRegions = Boolean(this.props.showRegions);
    const tracerLayerEnabled = Boolean(tracerLayer?.enabled);
    const tracerLayerOpacity = Number.isFinite(tracerLayer?.opacity) ? tracerLayer.opacity : 0;

    const rawCurrentSlice = this.getCurrentSliceFromProps(this.props);
    const planeSlideCount = this.props.config ? ViewerManager.getPlaneSlideCount(this.props.activePlane) : 1001;
    const maxSliceNum = Math.max(Number.isFinite(planeSlideCount) ? planeSlideCount - 1 : 1000, 0);
    const currentSlice = Math.min(Math.max(rawCurrentSlice, 0), maxSliceNum);
    const displayedSlice = Math.min(
      Math.max(Number.isFinite(this.state.displayedSlice) ? this.state.displayedSlice : currentSlice, 0),
      maxSliceNum,
    );
    return (
      <>
        <PopoverNext
          interactionKind={PopoverInteractionKind.HOVER}
          content={this.props.tourMenu}
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

        {this.props.config?.dataset_info ? (
          <PopoverNext
            content={
              <div style={{ width: '70vw', maxWidth: 850, height: '90vh', overflowY: 'auto' }}>
                <MetadataView infoDataset={this.props.config.dataset_info} includeThumbnail={true} />
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

          {this.props.hasDelineation ? (
            <div className="zav-ActionContainer zav-QuickToogleDelineationButton" title="toggle display of regions">
              <Switch checked={showRegions} onChange={this.handleClickHideShow} />
            </div>
          ) : null}

          {this.props.config && this.props.config.getTotalSlidesCount() > 1 ? (
            <div className="zav-QuickNavButtons">
              <div className="zav-ActionContainer">
                <AnchorButton
                  icon="double-chevron-right"
                  small
                  title="go to 10 slices forward"
                  onClick={this.onShiftToSlice.bind(this, 10)}
                />
              </div>
              <div className="zav-ActionContainer">
                <AnchorButton
                  icon="chevron-right"
                  small
                  title="go to next slice"
                  onClick={this.onShiftToSlice.bind(this, 1)}
                />
              </div>

              <div
                className="zav-ActionContainer"
                title={`slice #${currentSlice} of ${maxSliceNum}`}
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
                        onClick={this.onShiftToSlice.bind(this, -1)}
                      />
                      <div
                        onPointerDownCapture={this.startSliceSliderInteraction.bind(this)}
                        onPointerUpCapture={this.endSliceSliderInteraction}
                        onPointerCancelCapture={this.endSliceSliderInteraction}
                      >
                        <Slider
                          className="zav-Slider zav-QActSliceSlider"
                          min={0}
                          max={maxSliceNum}
                          stepSize={1}
                          onChange={this.handleSliceChange}
                          onRelease={this.handleSliceRelease}
                          value={displayedSlice}
                          showTrackFill={false}
                          labelStepSize={maxSliceNum}
                          labelRenderer={(value) => value}
                        />
                      </div>
                      <Icon
                        icon="chevron-right"
                        title="go to next slice"
                        style={{ paddingLeft: 10, verticalAlign: 'top' }}
                        onClick={this.onShiftToSlice.bind(this, 1)}
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
                  <span>{currentSlice}</span>
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
                <AnchorButton
                  icon="chevron-left"
                  small
                  title="go to previous slice"
                  onClick={this.onShiftToSlice.bind(this, -1)}
                />
              </div>
              <div className="zav-ActionContainer">
                <AnchorButton
                  icon="double-chevron-left"
                  small
                  title="go to 10 slices backward"
                  onClick={this.onShiftToSlice.bind(this, -10)}
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
                onChange={this.handleLayerEnabledChange.bind(this, tracerLayer.key, tracerLayerOpacity)}
              />
            </div>
          ) : null}
        </div>
      </>
    );
  }

  handleClickHideShow() {
    if (this.props.showRegions) {
      ViewerManager.hideRegions();
    } else {
      ViewerManager.toggleAreaDisplay();
    }
  }

  handleLayerEnabledChange(layerid: string, opacity: number, event: React.ChangeEvent<HTMLInputElement>) {
    ViewerManager.changeLayerOpacity(layerid, event.target.checked, opacity);
  }

  onShiftToSlice(increment: number) {
    ViewerManager.shiftToSlice(increment);
  }

  onGoToSlice(sliceNum: number) {
    this.setState({ displayedSlice: sliceNum });
    ViewerManager.goToSlice(sliceNum);
  }

  handleSliceChange(sliceNum: number) {
    this.setState({ displayedSlice: sliceNum, isDraggingSlice: true });
    ViewerManager.goToSlice(sliceNum);
  }

  handleSliceRelease(sliceNum: number) {
    this.setState({ displayedSlice: sliceNum, isDraggingSlice: false });
  }

  getCurrentSliceFromProps(props: QuickActionButtonsProps) {
    const planeSlideCount = props.config ? ViewerManager.getPlaneSlideCount(props.activePlane) : 1001;
    const maxSliceNum = Math.max(Number.isFinite(planeSlideCount) ? planeSlideCount - 1 : 1000, 0);
    const requestedSlice = typeof props.chosenSlice === 'number' ? props.chosenSlice : 0;
    return Math.min(Math.max(requestedSlice, 0), maxSliceNum);
  }

  startSliceSliderInteraction() {
    ViewerManager.setMouseNavigationEnabled(false);
    window.addEventListener('pointerup', this.endSliceSliderInteraction, true);
    window.addEventListener('pointercancel', this.endSliceSliderInteraction, true);
  }

  endSliceSliderInteraction() {
    ViewerManager.setMouseNavigationEnabled(true);
    this.setState({ isDraggingSlice: false });
    window.removeEventListener('pointerup', this.endSliceSliderInteraction, true);
    window.removeEventListener('pointercancel', this.endSliceSliderInteraction, true);
  }
}

export default QuickActionButtons;
