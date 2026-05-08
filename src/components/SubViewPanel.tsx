// biome-ignore-all lint/a11y/useAltText: The subview imagery is currently treated as a structural viewer surface rather than standalone content during this lint cleanup.
// biome-ignore-all lint/a11y/noSvgWithoutTitle: The subview overlay SVG is currently decorative viewer chrome and will be revisited in a dedicated accessibility pass.

import { Icon, Slider, Switch } from '@blueprintjs/core';
import React from 'react';
import Utils from '../Utils';
import ViewerManager from '../ViewerManager';
import ZAVConfig from '../ZAVConfig';

import './SubViewPanel.scss';

const nullSubviewImageUrl = `${import.meta.env.BASE_URL}img/null.png`;

class AxisArrow extends React.Component {
  render() {
    const arrowHead = { width: 3, length: 8 };
    const _fontSize = 12;

    const { pX, pY, arrowlen, axisLabel } = this.props;
    let arrowPath: React.ReactNode;
    let arrowLabel: React.ReactNode;
    if (this.props.horizontal) {
      arrowPath = (
        <path
          d={`M${pX},${pY} l${arrowlen},0 M${pX},${pY} l${arrowHead.length},-${arrowHead.width} M${pX},${pY} l${arrowHead.length},${arrowHead.width}`}
          stroke="silver"
          strokeWidth={1}
        />
      );
      arrowLabel = (
        <text x={pX - 3} y={pY} textAnchor="end" stroke="silver">
          {axisLabel}
        </text>
      );
    } else {
      arrowPath = (
        <path
          d={`M${pX},${pY} l0,${arrowlen} M${pX},${pY} l-${arrowHead.width},${arrowHead.length} M${pX},${pY} l${arrowHead.width},${arrowHead.length}`}
          stroke="silver"
          strokeWidth={1}
        />
      );
      arrowLabel = (
        <text x={pX} y={pY - 3} textAnchor="middle" stroke="silver">
          {axisLabel}
        </text>
      );
    }

    return (
      <React.Fragment>
        {arrowPath}
        {arrowLabel}
      </React.Fragment>
    );
  }
}

class SubViewOrthoPlanBar extends React.Component {
  constructor(props) {
    super(props);
    this.getPlaneSlicePercentOffset = this.getPlaneSlicePercentOffset.bind(this);
  }

  render() {
    const markerLineWidth = 1;
    const _dragMargin = 3;

    if (this.props.vertical) {
      const orthoVertical = ZAVConfig.getPlaneOrthoVertical(this.props.viewPlane);
      if (this.props.config.hasPlane(orthoVertical)) {
        const orthoVSlicePct = this.getPlaneSlicePercentOffset(orthoVertical);

        const hRange = this.props.config.getSubviewHRange(this.props.viewPlane);
        let hOffset: number;
        if (this.props.config.hasMultiPlanes) {
          //in multi-plane mode, origin of horizontal axis is at the right
          hOffset = this.props.scale * (this.props.config.subviewSize - (hRange.min + hRange.len * orthoVSlicePct));
        } else {
          //in single plane mode, origin of horizontal axis is at the left
          hOffset = this.props.scale * (hRange.min + hRange.len * orthoVSlicePct);
        }
        const verticalLine = (
          <line
            x1={hOffset}
            y1="0"
            x2={hOffset}
            y2={this.props.size}
            stroke={ZAVConfig.getPlaneColor(orthoVertical)}
            strokeWidth={markerLineWidth}
          />
        );
        return verticalLine;
      }
    } else {
      const orthoHorizontal = ZAVConfig.getPlaneOrthoHorizontal(this.props.viewPlane);
      if (this.props.config.hasPlane(orthoHorizontal)) {
        const orthoHSlicePct = this.getPlaneSlicePercentOffset(orthoHorizontal);

        const vRange = this.props.config.getSubviewVRange(this.props.viewPlane);
        //note: origin of vertical axis is at the bottom

        const vOffset = this.props.scale * (this.props.config.subviewSize - (vRange.min + vRange.len * orthoHSlicePct));
        const horizontalLine = (
          <line
            x1="0"
            y1={vOffset}
            x2={this.props.size}
            y2={vOffset}
            stroke={ZAVConfig.getPlaneColor(orthoHorizontal)}
            strokeWidth={markerLineWidth}
          />
        );
        return horizontalLine;
      }
    }
    return null;
  }

  getPlaneSlicePercentOffset(plane) {
    const planeSlideCount = ViewerManager.getPlaneSlideCount(plane);
    if (!Number.isFinite(planeSlideCount) || planeSlideCount <= 1) {
      return 0;
    }
    const chosenSlice = ViewerManager.getPlaneChosenSlice(plane);
    const safeChosenSlice = Number.isFinite(chosenSlice) ? chosenSlice : 0;
    return safeChosenSlice / (planeSlideCount - 1);
  }
}

class SubView extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      dragging: false, //true when dragging is on
      bbox: null, //bounding box of subview
    };
    this.svgRef = React.createRef();
    this.getSliceForWidgetPos = this.getSliceForWidgetPos.bind(this);
  }

  render() {
    //bounding box of the subview widget
    const size = this.props.size ? this.props.size : 200;

    //thicker border for active plane (but don't change widget bounding box size when changing border size)
    const border = this.props.activePlane && this.props.activePlane === this.props.viewPlane ? 3 : 1;
    const gap = this.props.activePlane && this.props.activePlane === this.props.viewPlane ? 1 : 3;
    const margin = 2 * border + 2 * gap;

    let horizontalLine: React.ReactNode = null;
    let verticalLine: React.ReactNode = null;
    let horizontalArrow: React.ReactNode = null;
    let verticalArrow: React.ReactNode = null;
    let imageUrl: string | undefined;
    const arrowLen = (size * 1) / 3 - 6;
    if (this.props.config && this.props.activePlane) {
      // scaling factor when widget size is different from subview image size (image range are proportional to subview image size),
      const scale = size / this.props.config.subviewSize;

      //line marker for orthogonal plane crossing the subview plane horizontally
      horizontalLine = (
        <SubViewOrthoPlanBar
          vertical={false}
          viewPlane={this.props.viewPlane}
          size={size}
          scale={scale}
          config={this.props.config}
        />
      );
      const vArrow = {
        pX: size - 6,
        pY: (size * 2) / 3,
        arrowlen: arrowLen,
        axisLabel: ZAVConfig.getPlaneVerticalAxis(this.props.viewPlane),
      };
      verticalArrow = <AxisArrow horizontal={false} {...vArrow} />;

      //line marker for orthogonal plane crossing the subview plane vertically
      verticalLine = (
        <SubViewOrthoPlanBar
          vertical={true}
          viewPlane={this.props.viewPlane}
          size={size}
          scale={scale}
          config={this.props.config}
        />
      );
      const hArrow = {
        pX: (size * 2) / 3,
        pY: size - 6,
        arrowlen: arrowLen,
        axisLabel: ZAVConfig.getPlaneHorizontalAxis(this.props.viewPlane),
      };
      horizontalArrow = <AxisArrow horizontal={true} {...hArrow} />;

      if (this.props.config.subviewFolderName) {
        //in single plane mode, only 1 image for the subview, but one for each slice in multiplane
        //FIXME introduce a specific parameter for this feature
        if (this.props.config.hasMultiPlanes) {
          imageUrl = Utils.makePath(
            this.props.config.PUBLISH_PATH,
            this.props.config.subviewFolderName,
            ZAVConfig.getPlaneName(this.props.viewPlane),
            `${ViewerManager.getPlaneChosenSlice(this.props.viewPlane)}.jpg`,
          );
        } else {
          imageUrl = Utils.makePath(
            this.props.config.PUBLISH_PATH,
            this.props.config.subviewFolderName,
            '/subview.jpg',
          );
        }
      } else {
        imageUrl = nullSubviewImageUrl;
      }
    }

    return (
      <div
        className="subview_holder"
        style={{
          position: 'relative',
          height: size + margin,
          width: size + margin,
          borderColor: ZAVConfig.getPlaneColor(this.props.viewPlane),
          borderStyle: 'solid',
          borderWidth: border,
        }}
      >
        <img
          className="subview_image"
          style={{ position: 'absolute', top: gap, left: gap }}
          width={size}
          height={size}
          src={imageUrl}
        />
        <svg
          ref={this.svgRef}
          width={size}
          style={{
            position: 'absolute',
            top: gap,
            left: gap,
            cursor: 'crosshair',
          }}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          onPointerDown={this.onDragStart.bind(this)}
          onPointerUp={this.onDragEnd.bind(this)}
          onPointerMove={this.onPointerMove.bind(this)}
        >
          {horizontalLine}
          {verticalLine}
          {horizontalArrow}
          {verticalArrow}
        </svg>
      </div>
    );
  }

  onDragStart(e) {
    const bbox = this.svgRef.current ? this.svgRef.current.getBoundingClientRect() : null;
    this.setState({
      dragging: true,
      bbox: bbox,
    });
    this.setOrthoSlices(e.clientX, e.clientY, bbox);
  }

  onPointerMove(e) {
    if (this.state.dragging && this.state.bbox) {
      //check that left button is still pressed, as an untracked pointerUp might have happened outside the subview
      if ((e.buttons & 1) !== 1) {
        this.setState({ dragging: false });
        return;
      }
      this.setOrthoSlices(e.clientX, e.clientY, this.state.bbox);
    }
  }

  onDragEnd(_e) {
    if (this.state.dragging) {
      this.setState({ dragging: false });
    }
  }

  setOrthoSlices(clientX, clientY, bnds) {
    if (bnds) {
      const newSlices = {};
      const size = this.props.size ? this.props.size : 200;
      const scale = size / this.props.config.subviewSize;

      const subviewY = clientY - bnds.top;
      const orthoHorizontal = ZAVConfig.getPlaneOrthoHorizontal(this.props.viewPlane);
      if (this.props.config.hasPlane(orthoHorizontal)) {
        const vRange = this.props.config.getSubviewVRange(this.props.viewPlane);
        const vSliceNum = this.getSliceForWidgetPos(
          orthoHorizontal,
          vRange,
          this.props.config.subviewSize,
          scale,
          subviewY,
        );
        newSlices[orthoHorizontal] = vSliceNum;
      }

      const subviewX = clientX - bnds.left;
      const orthoVertical = ZAVConfig.getPlaneOrthoVertical(this.props.viewPlane);
      if (this.props.config.hasPlane(orthoVertical)) {
        const hRange = this.props.config.getSubviewHRange(this.props.viewPlane);
        const hSliceNum = this.getSliceForWidgetPos(
          orthoVertical,
          hRange,
          this.props.config.subviewSize,
          scale,
          subviewX,
          !this.props.config.hasMultiPlanes,
        );
        newSlices[orthoVertical] = hSliceNum;
      }

      ViewerManager.changeSlices(newSlices);
    }
  }

  getSliceForWidgetPos(plane, range, subviewSize, scale, pos, invertedSliceIndex) {
    const maxSlideNum = ViewerManager.getPlaneSlideCount(plane);
    const percentOffset = invertedSliceIndex
      ? (pos / scale - range.min) / range.len
      : (subviewSize - pos / scale - range.min) / range.len;

    if (percentOffset <= 0) {
      return 0;
    } else if (percentOffset >= 1) {
      return maxSlideNum;
    } else {
      return Math.round(maxSlideNum * percentOffset);
    }
  }
}

class SubViewPanel extends React.Component {
  constructor(props) {
    super(props);
    this.state = { displayedSlice: this.getCurrentSliceFromProps(props), isDraggingSlice: false };
    this.handleSliceChange = this.handleSliceChange.bind(this);
    this.handleSliceRelease = this.handleSliceRelease.bind(this);
    this.endSliceSliderInteraction = this.endSliceSliderInteraction.bind(this);
  }

  componentDidUpdate(prevProps) {
    const prevSlice = this.getCurrentSliceFromProps(prevProps);
    const nextSlice = this.getCurrentSliceFromProps(this.props);
    if (!this.state.isDraggingSlice && prevSlice !== nextSlice && this.state.displayedSlice !== nextSlice) {
      this.setState({ displayedSlice: nextSlice });
    }
  }

  componentWillUnmount() {
    this.endSliceSliderInteraction();
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.activePlane !== this.props.activePlane ||
      nextProps.chosenSlice !== this.props.chosenSlice ||
      nextProps.isToolbarExpanded !== this.props.isToolbarExpanded ||
      nextProps.config !== this.props.config ||
      nextState.displayedSlice !== this.state.displayedSlice ||
      nextState.isDraggingSlice !== this.state.isDraggingSlice
    );
  }

  render() {
    const currentSlice = this.getCurrentSliceFromProps(this.props);
    const planeSlideCount = this.props.config ? ViewerManager.getPlaneSlideCount(this.props.activePlane) : 1001;
    const maxSliceNum = Math.max(Number.isFinite(planeSlideCount) ? planeSlideCount - 1 : 1000, 0);
    const displayedSlice = Math.min(
      Math.max(Number.isFinite(this.state.displayedSlice) ? this.state.displayedSlice : currentSlice, 0),
      maxSliceNum,
    );
    const rawSliceStep = this.props.config ? ViewerManager.getPlaneSliceStep(this.props.activePlane) : 1;
    const sliceStep = Number.isFinite(rawSliceStep) ? rawSliceStep : 1;

    const subviews = [];
    let justifyMode: React.CSSProperties['justifyContent'];
    if (this.props.config && this.props.activePlane) {
      this.config = this.props.config;

      if (this.props.config.hasMultiPlanes) {
        const subViewSize = 64;
        const subViewLabelWidth = subViewSize - 22;

        subviews.push(
          <div key={ZAVConfig.AXIAL}>
            <Switch
              className="zav-SubViewSwitch"
              style={{ width: subViewSize }}
              checked={ZAVConfig.AXIAL === this.props.activePlane}
              innerLabel={
                <span style={{ display: 'inline-block', width: subViewLabelWidth }}>
                  {ZAVConfig.getPlaneLabel(ZAVConfig.AXIAL)}
                </span>
              }
              onChange={this.onChangePlane.bind(this, ZAVConfig.AXIAL)}
            />
            <SubView
              activePlane={this.props.activePlane}
              viewPlane={ZAVConfig.AXIAL}
              config={this.props.config}
              size={subViewSize}
            />
          </div>,
        );

        subviews.push(
          <div key={ZAVConfig.CORONAL}>
            <Switch
              className="zav-SubViewSwitch"
              style={{ width: subViewSize }}
              checked={ZAVConfig.CORONAL === this.props.activePlane}
              innerLabel={
                <span style={{ display: 'inline-block', width: subViewLabelWidth }}>
                  {ZAVConfig.getPlaneLabel(ZAVConfig.CORONAL)}
                </span>
              }
              onChange={this.onChangePlane.bind(this, ZAVConfig.CORONAL)}
            />

            <SubView
              activePlane={this.props.activePlane}
              viewPlane={ZAVConfig.CORONAL}
              config={this.props.config}
              size={subViewSize}
            />
          </div>,
        );

        subviews.push(
          <div key={ZAVConfig.SAGITTAL}>
            <Switch
              className="zav-SubViewSwitch"
              style={{ width: subViewSize }}
              checked={ZAVConfig.SAGITTAL === this.props.activePlane}
              innerLabel={
                <span style={{ display: 'inline-block', width: subViewLabelWidth }}>
                  {ZAVConfig.getPlaneLabel(ZAVConfig.SAGITTAL)}
                </span>
              }
              onChange={this.onChangePlane.bind(this, ZAVConfig.SAGITTAL)}
            />
            <SubView
              activePlane={this.props.activePlane}
              viewPlane={ZAVConfig.SAGITTAL}
              config={this.props.config}
              size={subViewSize}
            />
          </div>,
        );
        justifyMode = 'space-between';
      } else {
        const subviewPlane = ZAVConfig.getPreferredSubviewForPlane(this.props.activePlane);
        subviews.push(
          <SubView
            key={subviewPlane}
            activePlane={this.props.activePlane}
            viewPlane={subviewPlane}
            config={this.props.config}
          />,
        );
        justifyMode = 'center';
      }
    }

    return (
      <React.Fragment>
        <div>
          <div className="zav-SubViewSlider">
            <Icon
              className="zav-SubViewSliderChevron"
              icon="chevron-left"
              title="go to previous slice"
              onClick={this.onGoToSlice.bind(this, currentSlice - 1)}
            />

            <div
              className="zav-SubViewSliderTrack"
              onPointerDownCapture={this.startSliceSliderInteraction.bind(this)}
              onPointerUpCapture={this.endSliceSliderInteraction}
              onPointerCancelCapture={this.endSliceSliderInteraction}
            >
              <Slider
                key={`${this.props.activePlane}-${this.props.isToolbarExpanded ? 'expanded' : 'collapsed'}`}
                className="zav-Slider zav-SubVSliceSlider"
                min={0}
                max={maxSliceNum}
                stepSize={1}
                labelStepSize={Math.max(maxSliceNum, 1)}
                onChange={this.handleSliceChange}
                onRelease={this.handleSliceRelease}
                value={displayedSlice}
                showTrackFill={false}
                labelRenderer={(value) => value * sliceStep}
              />
            </div>
            <Icon
              className="zav-SubViewSliderChevron"
              icon="chevron-right"
              title="go to next slice"
              onClick={this.onGoToSlice.bind(this, currentSlice + 1)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: justifyMode }}>{subviews}</div>
      </React.Fragment>
    );
  }

  onGoToSlice(sliceNum) {
    this.setState({ displayedSlice: sliceNum });
    ViewerManager.goToSlice(sliceNum);
  }

  handleSliceChange(sliceNum) {
    this.setState({ displayedSlice: sliceNum, isDraggingSlice: true });
    ViewerManager.goToSlice(sliceNum);
  }

  handleSliceRelease(sliceNum) {
    this.setState({ displayedSlice: sliceNum, isDraggingSlice: false });
  }

  getCurrentSliceFromProps(props) {
    const planeSlideCount = props.config ? ViewerManager.getPlaneSlideCount(props.activePlane) : 1001;
    const maxSliceNum = Math.max(Number.isFinite(planeSlideCount) ? planeSlideCount - 1 : 1000, 0);
    const requestedSlice = Number.isFinite(props.chosenSlice) ? props.chosenSlice : 0;
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

  onChangePlane(plane) {
    if (plane !== this.props.activePlane) {
      ViewerManager.activatePlane(plane);
    }
  }
}

export default SubViewPanel;
