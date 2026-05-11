import {
  Classes,
  Collapse,
  HotkeysTarget,
  Icon,
  Overlay2,
  PopoverInteractionKind,
  PopoverNext,
  Position,
  popoverPositionToNextPlacement,
} from '@blueprintjs/core';
import classNames from 'classnames';
import type { BrowserHistory } from 'history';
import React from 'react';
import ReactDOM from 'react-dom';
import RegionsManager, { type IRegionsStatus } from '../RegionsManager';
import RoiInfo from '../RoiInfo';
import ViewerManager from '../ViewerManager';
import ZAVConfig from '../ZAVConfig';
import Drawer, { CollapseDirection } from './Drawer';
import { TourContext } from './GuidedTour';
import MeasureInfoPanel from './MeasureInfoPanel';
import MetadataView from './MetadataView';
import OSDMain from './OSDMain';
import ProcessingPanel from './ProcessingPanel';
import QuickActionButtons from './QuickActionButtons';
import RegionEditPanel from './RegionEditPanel';
import RegionOptions from './RegionOptions';
import ROIOptions from './ROIOptions';
import SliderNavigatorPanel from './SliderNavigatorPanel';
import SubViewPanel from './SubViewPanel';
import type { BrandingInfo, LayerDisplaySettings, ZAViewerConfig } from './ViewerPanelTypes';

import './ViewerComposed.scss';

const VolumeView = React.lazy(() => import('./VolumeView'));
type Plane = Parameters<typeof ZAVConfig.getPlaneLabel>[0];

type TitledCardProps = {
  className?: string;
  header: React.ReactNode;
  isCollapsible?: boolean;
  collapsed?: boolean;
  children?: React.ReactNode;
};

type BrandingMarkProps = {
  brandingInfo?: BrandingInfo;
};

type ViewerComposedProps = {
  containerRef?: React.RefObject<HTMLDivElement>;
  config?: ZAViewerConfig;
  regionsStatus?: IRegionsStatus;
  resetRegionsTree?: () => void;
  history: BrowserHistory;
};

type ViewerComposedState = {
  showRegions: boolean;
  displayAreas: boolean;
  displayBorders: boolean;
  displayLabels: boolean;
  displayROIs: boolean;
  hasRegionLabels: boolean;
  initRegionsOpacity: number;
  regionsOpacity: number;
  pos?: unknown;
  position?: unknown;
  initExpanded: boolean;
  isToolbarExpanded: boolean;
  activePlane?: number;
  chosenSlice?: number;
  layerDisplaySettings?: LayerDisplaySettings;
  hoveredRegion?: string | null;
  hoveredRegionSide?: string | null;
  hoveredROI?: string | null;
  hoveredROILabel?: string | null;
  longRunningMessage?: string | null;
  editModeOn?: boolean;
  editingActive?: boolean;
  editPathId?: string | null;
  editPathFillColor?: string | null;
  editingTool?: string;
  editingToolRadius?: number;
  lastSelectedPath?: string | null;
  hasROIs?: boolean;
  markedPos?: { x: number; y: number }[];
  markedPosColors?: string[];
  useCustomBorders?: boolean;
  customBorderColor?: string;
  customBorderWidth?: number;
  [key: string]: unknown;
};

type HotkeyConfig = {
  combo: string;
  global: boolean;
  label: string;
  onKeyDown: () => void;
};

const TitledCard = (props: TitledCardProps) => {
  const isCollapsible = props.collapsed || Boolean(props.isCollapsible);
  const [isOpen, setIsOpen] = React.useState(!props.collapsed);

  return (
    <div className={`zav-TitledCard${props.className ? ` ${props.className}` : ''}`}>
      <div className={'zav-TitledCardHead'}>
        {isCollapsible ? (
          <button
            type="button"
            className="zav-TitledCardHeadExpColButton"
            onClick={() => setIsOpen((current) => !current)}
            aria-label={isOpen ? 'Collapse section' : 'Expand section'}
          >
            <Icon icon={isOpen ? 'chevron-up' : 'chevron-down'} size={12} />
          </button>
        ) : null}
        <div style={isCollapsible ? {} : { gridColumn: '1/3' }} className="zav-TitledCardTitle">
          {props.header}
        </div>
      </div>
      <Collapse isOpen={isOpen}>
        <div className="zav-TitledCardBody">{props.children}</div>
      </Collapse>
    </div>
  );
};

const BrandingMark = (props: BrandingMarkProps) => {
  const [placeHolder, setPlaceHolder] = React.useState<HTMLElement | null>(null);
  const portalRef = React.useRef<HTMLDivElement | null>(null);

  if (!portalRef.current) {
    portalRef.current = document.createElement('div');
  }

  React.useEffect(() => {
    const nextPlaceHolder = document.getElementById('zav_BrandingPlaceHolder');
    const portalElement = portalRef.current;
    setPlaceHolder(nextPlaceHolder);

    if (!nextPlaceHolder || !portalElement) {
      return;
    }

    nextPlaceHolder.appendChild(portalElement);
    return () => {
      if (portalElement.parentNode === nextPlaceHolder) {
        nextPlaceHolder.removeChild(portalElement);
      }
    };
  }, []);

  const portalElement = portalRef.current;
  return placeHolder && portalElement
    ? ReactDOM.createPortal(
        <div style={{ color: '#E1E1E1', verticalAlign: 'middle', fontSize: '10px' }}>
          {props.brandingInfo?.short && <span>{props.brandingInfo.short} </span>}
          {props.brandingInfo?.descr && (
            <PopoverNext
              content={
                <div style={{ maxWidth: '50vw', maxHeight: '50vh', overflowY: 'auto', padding: 10, fontSize: '12px' }}>
                  <p>
                    <br />
                    {props.brandingInfo.descr.split('\n').reduce<React.ReactNode[]>((nodes, line) => {
                      const occurrenceCount = nodes.filter(
                        (node) =>
                          React.isValidElement(node) && typeof node.key === 'string' && node.key.startsWith(`${line}-`),
                      ).length;
                      nodes.push(<p key={`${line}-${occurrenceCount}`}>{line}</p>);
                      return nodes;
                    }, [])}
                  </p>
                </div>
              }
              placement={popoverPositionToNextPlacement(Position.RIGHT_BOTTOM)}
              interactionKind={PopoverInteractionKind.HOVER}
            >
              <span style={{ color: '#E1E1E1', backgroundColor: '#515151', borderRadius: 2, padding: '0 2px' }}>
                <Icon icon="more" size={12} />
              </span>
            </PopoverNext>
          )}
        </div>,
        portalElement,
      )
    : null;
};

const ViewerComposed = (props: ViewerComposedProps) => {
  const [viewerState, setViewerState] = React.useState<ViewerComposedState>(() => ({
    showRegions: props.config?.showRegions ?? false,
    displayAreas: props.config?.displayAreas ?? false,
    displayBorders: props.config?.displayBorders ?? false,
    displayLabels: props.config?.displayLabels ?? false,
    displayROIs: props.config?.displayROIs ?? false,
    hasRegionLabels: false,
    initRegionsOpacity: 0.4,
    regionsOpacity: 0.4,
    pos: undefined,
    initExpanded: false,
    isToolbarExpanded: false,
  }));
  const initialized = React.useRef(false);
  const tourContext = React.useContext(TourContext);

  const hotkeys = React.useMemo<HotkeyConfig[]>(
    () => [
      {
        combo: 'ctrl + left',
        global: true,
        label: 'Go to the previous slice',
        onKeyDown: () => ViewerManager.shiftToSlice(-1),
      },
      {
        combo: 'meta + left',
        global: true,
        label: 'Go to the previous slice',
        onKeyDown: () => ViewerManager.shiftToSlice(-1),
      },
      {
        combo: 'ctrl + right',
        global: true,
        label: 'Go to the next slice',
        onKeyDown: () => ViewerManager.shiftToSlice(1),
      },
      {
        combo: 'meta + right',
        global: true,
        label: 'Go to the next slice',
        onKeyDown: () => ViewerManager.shiftToSlice(1),
      },
    ],
    [],
  );

  React.useEffect(() => {
    if (!props.config || initialized.current) {
      return;
    }

    ViewerManager.init(
      props.config,
      (osdstatus) => {
        setViewerState((currentState) => ({ ...currentState, ...osdstatus }));
      },
      props.history,
    );
    initialized.current = true;

    if (props.config.branding?.theme === 'light') {
      document.getElementsByClassName('App').item(0)?.classList.add('theme-light');
    }
  }, [props.config, props.history]);

  const currentTourStep = tourContext.stepContext?.currentStep;
  React.useEffect(() => {
    if (currentTourStep === '_init_') {
      (ViewerManager.goHome as (zoomout: boolean) => void)(true);
    } else if (currentTourStep === 'navigatorPanel') {
      (ViewerManager.setZoomFactor as (zf: number) => void)(50);
    }
  }, [currentTourStep]);

  const onToolbarExpandCollapse = React.useCallback((isExpanded: boolean) => {
    if (isExpanded) {
      ViewerManager.refreshNavigator();
    }
    setViewerState((currentState) => ({ ...currentState, isToolbarExpanded: isExpanded }));
  }, []);

  const classes = classNames(Classes.CARD, Classes.ELEVATION_4);
  const positionCount =
    Array.isArray(viewerState.position) &&
    typeof viewerState.position[0] === 'object' &&
    viewerState.position[0] !== null &&
    'c' in viewerState.position[0] &&
    typeof viewerState.position[0].c === 'number'
      ? viewerState.position[0].c
      : 0;

  const datasetDetails = props.config?.dataset_info ? (
    <div className="zav-QuickDatasetInfoButton">
      <PopoverNext
        content={
          <div style={{ width: '70vw', maxWidth: 850, height: '90vh', overflowY: 'auto' }}>
            <MetadataView infoDataset={props.config.dataset_info} includeThumbnail={true} />
          </div>
        }
        placement={popoverPositionToNextPlacement(Position.LEFT)}
        interactionKind={PopoverInteractionKind.HOVER}
      >
        <div title="display dataset information" className="zav-TitledCardButton">
          <Icon icon="info-sign" color="#FFF" />
        </div>
      </PopoverNext>
    </div>
  ) : null;

  const globalHeaderText = `${props.config?.datasetId ? `${props.config.datasetId} — ` : ''}Global view`;
  const globalDatasetVersion = props.config?.datasetVersion ? (
    <a href={props.config.datasetVersion.uri} target="_blank" rel="noopener">
      {props.config.datasetVersion.label}
    </a>
  ) : null;

  const globalHeader = (
    <>
      <PopoverNext
        interactionKind={PopoverInteractionKind.HOVER}
        content={tourContext.tourMenu}
        placement={popoverPositionToNextPlacement(Position.LEFT)}
      >
        <div title="Help and guided tours!" className="zav-TitledCardButton" style={{ borderColor: 'transparent' }}>
          <Icon icon="help" color="#FFF" />
        </div>
      </PopoverNext>

      {globalHeaderText}
      {datasetDetails}
    </>
  );

  const region = viewerState.hoveredRegion ? RegionsManager.getRegion(viewerState.hoveredRegion) : null;
  const regionName = region ? region.name : '';

  const subviewTitleSuffix =
    props.config && !props.config.hasMultiPlanes && typeof viewerState.activePlane === 'number'
      ? ` — ${ZAVConfig.getPlaneLabel(ZAVConfig.getPreferredSubviewForPlane(viewerState.activePlane as Plane))} view`
      : '';

  const tourSpecificInit = {
    controlPanelExpanded:
      currentTourStep && ['mainImagePanel', 'collapsedControlPanel', 'expandedRegionPanel'].includes(currentTourStep)
        ? false
        : currentTourStep && ['expandedControlPanel', 'navigatorPanel'].includes(currentTourStep)
          ? true
          : undefined,
  };

  const ginRepoBaseUrl = props.config?.dataset_info ? props.config.dataset_info.ginRepoBaseUrl : null;
  const layerFolderMap = ginRepoBaseUrl ? (props.config?.dataset_info?.layerFolderMap ?? null) : null;

  return (
    <HotkeysTarget hotkeys={hotkeys}>
      <div style={{ height: '100%' }}>
        <BrandingMark brandingInfo={props.config?.branding} />

        <div className="zav-StatusBar">
          <div
            className={
              'zav-StatusBarContent' +
              (viewerState.hoveredRegion || viewerState.hoveredROI ? ' hasStatus' : '') +
              (viewerState.hoveredROI ? ' isROI' : '')
            }
          >
            {viewerState.hoveredRegion ? (
              <React.Fragment>
                <span>
                  <b>{viewerState.hoveredRegion}</b> {regionName} {viewerState.hoveredRegionSide}
                </span>
                {!props.config?.hasDelineation || viewerState.showRegions ? null : (
                  <span className="zav-StatusBarHint">[Shift]+Click on the image to reveal the border</span>
                )}
              </React.Fragment>
            ) : viewerState.hoveredROI ? (
              <span>
                <b>{viewerState.hoveredROI}</b> {viewerState.hoveredROILabel}
              </span>
            ) : null}
          </div>
        </div>

        <OSDMain />
        <Overlay2 className={Classes.OVERLAY_SCROLL_CONTAINER} isOpen={Boolean(viewerState.longRunningMessage)}>
          <div style={{ left: 'calc(50vw - 200px)', margin: '10vh 0', top: 0, width: 400 }} className={classes}>
            <h3>
              <Icon icon="pulse" />
              {' Please wait'}
            </h3>
            <p>{viewerState.longRunningMessage}</p>
          </div>
        </Overlay2>

        <Drawer
          id="ZAV-rightPanel"
          collapseDirection={CollapseDirection.RIGHT}
          initExpanded={viewerState.initExpanded}
          forceExpanded={Boolean(tourSpecificInit.controlPanelExpanded) || viewerState.initExpanded}
          onClick={undefined}
          onExpandCollapse={onToolbarExpandCollapse}
          quickactions={
            <QuickActionButtons
              hasDelineation={props.config?.hasDelineation}
              displaySettings={viewerState.layerDisplaySettings}
              showRegions={viewerState.showRegions}
              activePlane={viewerState.activePlane}
              chosenSlice={viewerState.chosenSlice}
              config={props.config}
              tourMenu={tourContext.tourMenu}
            />
          }
        >
          <TitledCard className="zav-controlPanel_Navigator" header={globalHeader}>
            <div className="navigatorParentClass">
              <div id={ViewerManager.NAVIGATOR_ID} className="navigatorChildClass"></div>
              <div className="zav-DatasetVersion">{globalDatasetVersion}</div>
            </div>
          </TitledCard>

          {props.config && props.config.getTotalSlidesCount() > 1 ? (
            <TitledCard
              className="zav-controlPanel_SliceNav"
              header={
                props.config.volumeUrl ? (
                  <div
                    style={{ width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}
                  >
                    <PopoverNext
                      interactionKind={PopoverInteractionKind.CLICK}
                      content={
                        <div style={{ width: '70vw', maxWidth: 850, height: '90vh', overflowY: 'auto' }}>
                          <React.Suspense fallback={<div>Loading...</div>}>
                            <VolumeView url={props.config.volumeUrl} />
                          </React.Suspense>
                        </div>
                      }
                      placement={popoverPositionToNextPlacement(Position.LEFT)}
                      shouldReturnFocusOnClose={false}
                    >
                      <button
                        type="button"
                        title="display 3D volume"
                        className="zav-TitledCardButton"
                        style={{ background: 'none', border: 0, padding: 0 }}
                      >
                        <Icon icon="cube" color="#FFF" />
                      </button>
                    </PopoverNext>
                    <span>{`Slices navigation${subviewTitleSuffix}`}</span>
                  </div>
                ) : (
                  <span>{`Slices navigation${subviewTitleSuffix}`}</span>
                )
              }
            >
              <SubViewPanel
                activePlane={viewerState.activePlane as Plane | undefined}
                chosenSlice={viewerState.chosenSlice}
                isToolbarExpanded={viewerState.isToolbarExpanded}
                config={props.config}
              />
            </TitledCard>
          ) : null}

          <TitledCard className="zav-controlPanel_Layers" header={'Layers control'} isCollapsible={true}>
            <SliderNavigatorPanel
              hasDelineation={props.config?.hasDelineation}
              displaySettings={viewerState.layerDisplaySettings}
              ginRepoBaseUrl={ginRepoBaseUrl}
              layerFolderMap={layerFolderMap}
              chosenSlice={ginRepoBaseUrl ? viewerState.chosenSlice : -1}
            />
          </TitledCard>

          {ViewerManager.hasProcessingsModule() ? (
            <TitledCard header={'Processing'} isCollapsible={true}>
              <ProcessingPanel posCount={positionCount} pos={viewerState.pos} />
            </TitledCard>
          ) : null}

          {props.config?.hasDelineation ? (
            <TitledCard className="zav-controlPanel_Regions" header={'Atlas regions'} isCollapsible={true}>
              <RegionOptions
                currentAtlas={props.config.currentAtlas}
                atlases={props.config.atlases}
                resetRegionsTree={props.resetRegionsTree}
                showRegions={viewerState.showRegions}
                regionsOpacity={viewerState.regionsOpacity}
                initRegionsOpacity={viewerState.initRegionsOpacity}
                displayAreas={viewerState.displayAreas}
                displayBorders={viewerState.displayBorders}
                hasRegionLabels={viewerState.hasRegionLabels}
                displayLabels={viewerState.displayLabels}
                useCustomBorders={Boolean(viewerState.useCustomBorders)}
                customBorderColor={viewerState.customBorderColor ?? '#ffffff'}
                customBorderWidth={viewerState.customBorderWidth ?? 1}
              />
              {viewerState.editModeOn ? (
                <React.Fragment>
                  <div style={{ borderBottom: 'dotted 1px #8a8a8a', margin: '3px 0' }} />
                  <RegionEditPanel
                    lastSelectedPath={viewerState.lastSelectedPath}
                    editModeOn={viewerState.editModeOn}
                    editingActive={viewerState.editingActive}
                    editPathId={viewerState.editPathId}
                    editPathFillColor={viewerState.editPathFillColor}
                    editingTool={viewerState.editingTool ?? 'pen'}
                    editingToolRadius={viewerState.editingToolRadius ?? 10}
                  />
                </React.Fragment>
              ) : null}
            </TitledCard>
          ) : null}

          {props.config && RoiInfo.hasROI ? (
            <TitledCard className="zav-controlPanel_ROIs" header={'ROIs'} isCollapsible={true}>
              <ROIOptions sliceHasROI={Boolean(viewerState.hasROIs)} displayROIs={viewerState.displayROIs} />
            </TitledCard>
          ) : null}

          {props.config?.matrix ? (
            <TitledCard
              className="zav-controlPanel_Distance"
              header={'Distance measurement'}
              isCollapsible={true}
              collapsed={true}
            >
              <MeasureInfoPanel
                posCount={positionCount}
                markedPos={viewerState.markedPos ?? []}
                markedPosColors={viewerState.markedPosColors ?? []}
              />
            </TitledCard>
          ) : null}
        </Drawer>
      </div>
    </HotkeysTarget>
  );
};

export default ViewerComposed;
