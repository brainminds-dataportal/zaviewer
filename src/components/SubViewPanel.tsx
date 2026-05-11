import { Slider, Switch } from '@blueprintjs/core';
import React from 'react';
import Utils from '../Utils';
import ViewerManager from '../ViewerManager';
import ZAVConfig from '../ZAVConfig';
import type { ViewerRange, ZAViewerConfig } from './ViewerPanelTypes';

import './SubViewPanel.scss';

const nullSubviewImageUrl = `${import.meta.env.BASE_URL}img/null.png`;
type Plane = Parameters<typeof ZAVConfig.getPlaneLabel>[0];
const AXIAL_PLANE = ZAVConfig.AXIAL as Plane;
const CORONAL_PLANE = ZAVConfig.CORONAL as Plane;
const SAGITTAL_PLANE = ZAVConfig.SAGITTAL as Plane;

type AxisArrowProps = {
  pX: number;
  pY: number;
  arrowlen: number;
  axisLabel: string;
  horizontal: boolean;
};

type SubViewOrthoPlanBarProps = {
  vertical: boolean;
  viewPlane: Plane;
  size: number;
  scale: number;
  config: ZAViewerConfig;
};

type SubViewProps = {
  activePlane?: Plane;
  viewPlane: Plane;
  config: ZAViewerConfig;
  size?: number;
};

type SubViewPanelProps = {
  activePlane?: Plane;
  chosenSlice?: number;
  isToolbarExpanded?: boolean;
  config?: ZAViewerConfig;
};

const getPlaneSlicePercentOffset = (plane: Plane) => {
  const planeSlideCount = ViewerManager.getPlaneSlideCount(plane) ?? 0;
  if (!Number.isFinite(planeSlideCount) || planeSlideCount <= 1) {
    return 0;
  }
  const chosenSlice = ViewerManager.getPlaneChosenSlice(plane);
  const safeChosenSlice = typeof chosenSlice === 'number' && Number.isFinite(chosenSlice) ? chosenSlice : 0;
  return safeChosenSlice / (planeSlideCount - 1);
};

const AxisArrow = ({ pX, pY, arrowlen, axisLabel, horizontal }: AxisArrowProps) => {
  const arrowHead = { width: 3, length: 8 };

  let arrowPath: React.ReactNode;
  let arrowLabel: React.ReactNode;
  if (horizontal) {
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
};

const SubViewOrthoPlanBar = ({ vertical, viewPlane, size, scale, config }: SubViewOrthoPlanBarProps) => {
  const markerLineWidth = 1;

  if (vertical) {
    const orthoVertical = ZAVConfig.getPlaneOrthoVertical(viewPlane);
    if (config.hasPlane(orthoVertical)) {
      const orthoVSlicePct = getPlaneSlicePercentOffset(orthoVertical);
      const hRange = config.getSubviewHRange(viewPlane);
      const hOffset = config.hasMultiPlanes
        ? scale * (config.subviewSize - (hRange.min + hRange.len * orthoVSlicePct))
        : scale * (hRange.min + hRange.len * orthoVSlicePct);
      return (
        <line
          x1={hOffset}
          y1="0"
          x2={hOffset}
          y2={size}
          stroke={ZAVConfig.getPlaneColor(orthoVertical)}
          strokeWidth={markerLineWidth}
        />
      );
    }
  } else {
    const orthoHorizontal = ZAVConfig.getPlaneOrthoHorizontal(viewPlane);
    if (config.hasPlane(orthoHorizontal)) {
      const orthoHSlicePct = getPlaneSlicePercentOffset(orthoHorizontal);
      const vRange = config.getSubviewVRange(viewPlane);
      const vOffset = scale * (config.subviewSize - (vRange.min + vRange.len * orthoHSlicePct));
      return (
        <line
          x1="0"
          y1={vOffset}
          x2={size}
          y2={vOffset}
          stroke={ZAVConfig.getPlaneColor(orthoHorizontal)}
          strokeWidth={markerLineWidth}
        />
      );
    }
  }

  return null;
};

const SubView = (props: SubViewProps) => {
  const [dragging, setDragging] = React.useState(false);
  const [bbox, setBbox] = React.useState<DOMRect | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const getSliceForWidgetPos = React.useCallback(
    (plane: Plane, range: ViewerRange, subviewSize: number, scale: number, pos: number, invertedSliceIndex = false) => {
      const maxSlideNum = ViewerManager.getPlaneSlideCount(plane) ?? 0;
      const percentOffset = invertedSliceIndex
        ? (pos / scale - range.min) / range.len
        : (subviewSize - pos / scale - range.min) / range.len;

      if (percentOffset <= 0) {
        return 0;
      }
      if (percentOffset >= 1) {
        return maxSlideNum;
      }
      return Math.round(maxSlideNum * percentOffset);
    },
    [],
  );

  const setOrthoSlices = React.useCallback(
    (clientX: number, clientY: number, bounds: DOMRect | null) => {
      if (!bounds) {
        return;
      }

      const newSlices: Record<number, number> = {};
      const size = props.size ?? 200;
      const scale = size / props.config.subviewSize;

      const subviewY = clientY - bounds.top;
      const orthoHorizontal = ZAVConfig.getPlaneOrthoHorizontal(props.viewPlane);
      if (props.config.hasPlane(orthoHorizontal)) {
        const vRange = props.config.getSubviewVRange(props.viewPlane);
        const vSliceNum = getSliceForWidgetPos(orthoHorizontal, vRange, props.config.subviewSize, scale, subviewY);
        newSlices[orthoHorizontal] = vSliceNum;
      }

      const subviewX = clientX - bounds.left;
      const orthoVertical = ZAVConfig.getPlaneOrthoVertical(props.viewPlane);
      if (props.config.hasPlane(orthoVertical)) {
        const hRange = props.config.getSubviewHRange(props.viewPlane);
        const hSliceNum = getSliceForWidgetPos(
          orthoVertical,
          hRange,
          props.config.subviewSize,
          scale,
          subviewX,
          !props.config.hasMultiPlanes,
        );
        newSlices[orthoVertical] = hSliceNum;
      }

      ViewerManager.changeSlices(newSlices);
    },
    [getSliceForWidgetPos, props.config, props.size, props.viewPlane],
  );

  const onDragStart = React.useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const nextBbox = svgRef.current ? svgRef.current.getBoundingClientRect() : null;
      setDragging(true);
      setBbox(nextBbox);
      setOrthoSlices(event.clientX, event.clientY, nextBbox);
    },
    [setOrthoSlices],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging || !bbox) {
        return;
      }

      if ((event.buttons & 1) !== 1) {
        setDragging(false);
        return;
      }

      setOrthoSlices(event.clientX, event.clientY, bbox);
    },
    [bbox, dragging, setOrthoSlices],
  );

  const onDragEnd = React.useCallback(() => {
    if (dragging) {
      setDragging(false);
    }
  }, [dragging]);

  const size = props.size ?? 200;
  const border = props.activePlane && props.activePlane === props.viewPlane ? 3 : 1;
  const gap = props.activePlane && props.activePlane === props.viewPlane ? 1 : 3;
  const margin = 2 * border + 2 * gap;

  let horizontalLine: React.ReactNode = null;
  let verticalLine: React.ReactNode = null;
  let horizontalArrow: React.ReactNode = null;
  let verticalArrow: React.ReactNode = null;
  let imageUrl: string | undefined;
  const arrowLen = size / 3 - 6;
  if (props.activePlane) {
    const scale = size / props.config.subviewSize;
    horizontalLine = (
      <SubViewOrthoPlanBar
        vertical={false}
        viewPlane={props.viewPlane}
        size={size}
        scale={scale}
        config={props.config}
      />
    );
    verticalArrow = (
      <AxisArrow
        horizontal={false}
        pX={size - 6}
        pY={(size * 2) / 3}
        arrowlen={arrowLen}
        axisLabel={ZAVConfig.getPlaneVerticalAxis(props.viewPlane)}
      />
    );

    verticalLine = (
      <SubViewOrthoPlanBar
        vertical={true}
        viewPlane={props.viewPlane}
        size={size}
        scale={scale}
        config={props.config}
      />
    );
    horizontalArrow = (
      <AxisArrow
        horizontal={true}
        pX={(size * 2) / 3}
        pY={size - 6}
        arrowlen={arrowLen}
        axisLabel={ZAVConfig.getPlaneHorizontalAxis(props.viewPlane)}
      />
    );

    if (props.config.subviewFolderName) {
      if (props.config.hasMultiPlanes) {
        imageUrl = Utils.makePath(
          props.config.PUBLISH_PATH,
          props.config.subviewFolderName,
          ZAVConfig.getPlaneName(props.viewPlane),
          `${ViewerManager.getPlaneChosenSlice(props.viewPlane)}.jpg`,
        );
      } else {
        imageUrl = Utils.makePath(props.config.PUBLISH_PATH, props.config.subviewFolderName, '/subview.jpg');
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
        borderColor: ZAVConfig.getPlaneColor(props.viewPlane),
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
        alt={`${ZAVConfig.getPlaneLabel(props.viewPlane)} subview`}
      />
      <svg
        ref={svgRef}
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
        onPointerDown={onDragStart}
        onPointerUp={onDragEnd}
        onPointerMove={onPointerMove}
      >
        <title>{`${ZAVConfig.getPlaneLabel(props.viewPlane)} subview overlay`}</title>
        {horizontalLine}
        {verticalLine}
        {horizontalArrow}
        {verticalArrow}
      </svg>
    </div>
  );
};

const getActivePlaneFromProps = (props: SubViewPanelProps): Plane =>
  (props.activePlane ?? ViewerManager.getActivePlane()) as Plane;

const getCurrentSliceFromProps = (props: SubViewPanelProps) => {
  const activePlane = getActivePlaneFromProps(props);
  const planeSlideCount = props.config ? (ViewerManager.getPlaneSlideCount(activePlane) ?? 1001) : 1001;
  const maxSliceNum = Math.max(Number.isFinite(planeSlideCount) ? planeSlideCount - 1 : 1000, 0);
  const requestedSlice =
    typeof props.chosenSlice === 'number' && Number.isFinite(props.chosenSlice) ? props.chosenSlice : 0;
  return Math.min(Math.max(requestedSlice, 0), maxSliceNum);
};

const SubViewPanelComponent = (props: SubViewPanelProps) => {
  const [displayedSlice, setDisplayedSlice] = React.useState(() => getCurrentSliceFromProps(props));
  const [isDraggingSlice, setIsDraggingSlice] = React.useState(false);

  const currentSlice = getCurrentSliceFromProps(props);
  React.useEffect(() => {
    if (!isDraggingSlice && displayedSlice !== currentSlice) {
      setDisplayedSlice(currentSlice);
    }
  }, [currentSlice, displayedSlice, isDraggingSlice]);

  const endSliceSliderInteraction = React.useCallback(() => {
    ViewerManager.setMouseNavigationEnabled(true);
    setIsDraggingSlice(false);
    window.removeEventListener('pointerup', endSliceSliderInteraction, true);
    window.removeEventListener('pointercancel', endSliceSliderInteraction, true);
  }, []);

  React.useEffect(() => endSliceSliderInteraction, [endSliceSliderInteraction]);

  const startSliceSliderInteraction = React.useCallback(() => {
    ViewerManager.setMouseNavigationEnabled(false);
    window.addEventListener('pointerup', endSliceSliderInteraction, true);
    window.addEventListener('pointercancel', endSliceSliderInteraction, true);
  }, [endSliceSliderInteraction]);

  const onGoToSlice = React.useCallback((sliceNum: number) => {
    setDisplayedSlice(sliceNum);
    ViewerManager.goToSlice(sliceNum);
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

  const onChangePlane = React.useCallback(
    (plane: Plane) => {
      if (plane !== props.activePlane) {
        ViewerManager.activatePlane(plane);
      }
    },
    [props.activePlane],
  );

  const activePlane = getActivePlaneFromProps(props);
  const planeSlideCount = props.config ? (ViewerManager.getPlaneSlideCount(activePlane) ?? 1001) : 1001;
  const maxSliceNum = Math.max(Number.isFinite(planeSlideCount) ? planeSlideCount - 1 : 1000, 0);
  const clampedDisplayedSlice = Math.min(
    Math.max(Number.isFinite(displayedSlice) ? displayedSlice : currentSlice, 0),
    maxSliceNum,
  );
  const rawSliceStep = props.config ? ViewerManager.getPlaneSliceStep(activePlane) : 1;
  const sliceStep = typeof rawSliceStep === 'number' && Number.isFinite(rawSliceStep) ? rawSliceStep : 1;

  const subviews: React.ReactNode[] = [];
  let justifyMode: React.CSSProperties['justifyContent'];
  if (props.config && props.activePlane) {
    if (props.config.hasMultiPlanes) {
      const subViewSize = 64;
      subviews.push(
        <div key={AXIAL_PLANE}>
          <Switch
            className="zav-SubViewSwitch"
            style={{ width: subViewSize }}
            checked={AXIAL_PLANE === props.activePlane}
            innerLabel={ZAVConfig.getPlaneLabel(AXIAL_PLANE)}
            innerLabelChecked={ZAVConfig.getPlaneLabel(AXIAL_PLANE)}
            onChange={() => onChangePlane(AXIAL_PLANE)}
          />
          <SubView activePlane={props.activePlane} viewPlane={AXIAL_PLANE} config={props.config} size={subViewSize} />
        </div>,
      );

      subviews.push(
        <div key={CORONAL_PLANE}>
          <Switch
            className="zav-SubViewSwitch"
            style={{ width: subViewSize }}
            checked={CORONAL_PLANE === props.activePlane}
            innerLabel={ZAVConfig.getPlaneLabel(CORONAL_PLANE)}
            innerLabelChecked={ZAVConfig.getPlaneLabel(CORONAL_PLANE)}
            onChange={() => onChangePlane(CORONAL_PLANE)}
          />

          <SubView activePlane={props.activePlane} viewPlane={CORONAL_PLANE} config={props.config} size={subViewSize} />
        </div>,
      );

      subviews.push(
        <div key={SAGITTAL_PLANE}>
          <Switch
            className="zav-SubViewSwitch"
            style={{ width: subViewSize }}
            checked={SAGITTAL_PLANE === props.activePlane}
            innerLabel={ZAVConfig.getPlaneLabel(SAGITTAL_PLANE)}
            innerLabelChecked={ZAVConfig.getPlaneLabel(SAGITTAL_PLANE)}
            onChange={() => onChangePlane(SAGITTAL_PLANE)}
          />
          <SubView
            activePlane={props.activePlane}
            viewPlane={SAGITTAL_PLANE}
            config={props.config}
            size={subViewSize}
          />
        </div>,
      );
      justifyMode = 'space-between';
    } else {
      const subviewPlane = ZAVConfig.getPreferredSubviewForPlane(props.activePlane);
      subviews.push(
        <SubView key={subviewPlane} activePlane={props.activePlane} viewPlane={subviewPlane} config={props.config} />,
      );
      justifyMode = 'center';
    }
  }

  return (
    <div className="zav-SubViewPanel">
      <div className="zav-SubViewSlider">
        <div
          className="zav-SubViewSliderTrack"
          onPointerDownCapture={startSliceSliderInteraction}
          onPointerUpCapture={endSliceSliderInteraction}
          onPointerCancelCapture={endSliceSliderInteraction}
        >
          <button
            type="button"
            className="zav-SubViewSliderChevron zav-SubViewSliderChevronLeft"
            title="go to previous slice"
            onClick={() => onGoToSlice(currentSlice - 1)}
          >
            {'<'}
          </button>
          <Slider
            key={`${props.activePlane}-${props.isToolbarExpanded ? 'expanded' : 'collapsed'}`}
            className="zav-Slider zav-SubVSliceSlider"
            min={0}
            max={maxSliceNum}
            stepSize={1}
            labelStepSize={Math.max(maxSliceNum, 1)}
            onChange={handleSliceChange}
            onRelease={handleSliceRelease}
            value={clampedDisplayedSlice}
            showTrackFill={false}
            labelRenderer={(value) => String(value * sliceStep)}
          />
          <button
            type="button"
            className="zav-SubViewSliderChevron zav-SubViewSliderChevronRight"
            title="go to next slice"
            onClick={() => onGoToSlice(currentSlice + 1)}
          >
            {'>'}
          </button>
        </div>
      </div>

      <div className="zav-SubViewList" style={{ justifyContent: justifyMode }}>
        {subviews.map((subview) => (
          <div key={(subview as React.ReactElement).key} className="zav-SubViewItem">
            {subview}
          </div>
        ))}
      </div>
    </div>
  );
};

const SubViewPanel = React.memo(
  SubViewPanelComponent,
  (prevProps, nextProps) =>
    prevProps.activePlane === nextProps.activePlane &&
    prevProps.chosenSlice === nextProps.chosenSlice &&
    prevProps.isToolbarExpanded === nextProps.isToolbarExpanded &&
    prevProps.config === nextProps.config,
);

export default SubViewPanel;
