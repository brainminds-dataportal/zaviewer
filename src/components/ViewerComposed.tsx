import {
  Classes,
  Collapse,
  HotkeysTarget2,
  Icon,
  Overlay,
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

type TitledCardState = {
  isCollapsible: boolean;
  isOpen: boolean;
};

type BrandingMarkProps = {
  brandingInfo?: BrandingInfo;
};

type ViewerPositionInfo = {
  c: number;
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
  position?: ViewerPositionInfo[];
  initExpanded: boolean;
  isToolbarExpanded: boolean;
  activePlane?: Plane;
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

class TitledCard extends React.Component<TitledCardProps, TitledCardState> {
  constructor(props: TitledCardProps) {
    super(props);
    this.state = {
      isCollapsible: props.collapsed || Boolean(props.isCollapsible),
      isOpen: !props.collapsed,
    };
  }

  render() {
    return (
      <div className={`zav-TitledCard${this.props.className ? ` ${this.props.className}` : ''}`}>
        <div className={'zav-TitledCardHead'}>
          {this.state.isCollapsible ? (
            <button
              type="button"
              className="zav-TitledCardHeadExpColButton"
              onClick={() => this.setState((_state) => ({ isOpen: !this.state.isOpen }))}
              aria-label={this.state.isOpen ? 'Collapse section' : 'Expand section'}
            >
              <Icon icon={this.state.isOpen ? 'chevron-up' : 'chevron-down'} size={12} />
            </button>
          ) : null}
          <div style={this.state.isCollapsible ? {} : { gridColumn: '1/3' }} className="zav-TitledCardTitle">
            {this.props.header}
          </div>
        </div>
        <Collapse isOpen={this.state.isOpen}>{this.props.children}</Collapse>
      </div>
    );
  }
}

class BrandingMark extends React.Component<BrandingMarkProps> {
  private readonly el: HTMLDivElement;
  private placeHolder: HTMLElement | null = null;

  constructor(props: BrandingMarkProps) {
    super(props);
    this.el = document.createElement('div');
  }
  componentDidMount() {
    this.placeHolder = document.getElementById('zav_BrandingPlaceHolder');
    this.placeHolder?.appendChild(this.el);
  }
  componentWillUnmount() {
    this.placeHolder?.removeChild(this.el);
  }
  render() {
    return this.placeHolder
      ? ReactDOM.createPortal(
          <div style={{ color: '#E1E1E1', verticalAlign: 'middle', fontSize: '10px' }}>
            {this.props.brandingInfo?.short && <span>{this.props.brandingInfo.short} </span>}
            {this.props.brandingInfo?.descr && (
              <PopoverNext
                content={
                  <div
                    style={{ maxWidth: '50vw', maxHeight: '50vh', overflowY: 'auto', padding: 10, fontSize: '12px' }}
                  >
                    <p>
                      <br />
                      {this.props.brandingInfo.descr.split('\n').reduce<React.ReactNode[]>((nodes, line) => {
                        const occurrenceCount = nodes.filter(
                          (node) =>
                            React.isValidElement(node) &&
                            typeof node.key === 'string' &&
                            node.key.startsWith(`${line}-`),
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
                <span
                  style={{ color: '#E1E1E1', backgroundColor: '#515151', borderRadius: 2, padding: '0 2px' }}
                  //title="more info here!"
                >
                  <Icon icon="more" size={12} />
                </span>
              </PopoverNext>
            )}
          </div>,
          this.el,
        )
      : null;
  }
}

//props.containerRef: React.RefObject<HTMLDivElement>,

class ViewerComposed extends React.Component<ViewerComposedProps, ViewerComposedState> {
  static contextType = TourContext;
  declare context: React.ContextType<typeof TourContext>;
  private initialized: boolean;

  hotkeys: HotkeyConfig[] = [
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
  ];

  constructor(props: ViewerComposedProps) {
    super(props);
    this.initialized = false;
    this.state = {
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
    };
  }

  initializeViewerIfNeeded() {
    if (!this.props.config || this.initialized) {
      return;
    }

    ViewerManager.init(
      this.props.config,
      (osdstatus) => {
        this.setState((_state) => ({ ...osdstatus }));
      },
      this.props.history,
    );
    this.initialized = true;

    if (this.props.config.branding?.theme) {
      const appElement = document.getElementsByClassName('App').item(0);
      if (appElement) {
        appElement.className += this.props.config.branding.theme === 'light' ? ' theme-light' : '';
      }
    }
  }

  componentDidMount() {
    this.initializeViewerIfNeeded();
  }

  componentDidUpdate() {
    this.initializeViewerIfNeeded();
  }

  render() {
    const classes = classNames(Classes.CARD, Classes.ELEVATION_4);

    const datasetDetails = this.props.config?.dataset_info ? (
      <div className="zav-QuickDatasetInfoButton">
        <PopoverNext
          content={
            <div style={{ width: '70vw', maxWidth: 850, height: '90vh', overflowY: 'auto' }}>
              <MetadataView infoDataset={this.props.config.dataset_info} includeThumbnail={true} />
            </div>
          }
          placement={popoverPositionToNextPlacement(Position.LEFT)}
          interactionKind={PopoverInteractionKind.HOVER}
        >
          <div title="display dataset informations" className="zav-TitledCardButton">
            <Icon icon="info-sign" color="#FFF" />
          </div>
        </PopoverNext>
      </div>
    ) : null;

    const globalHeaderText = `${this.props.config?.datasetId ? `${this.props.config.datasetId} — ` : ''}Global view`;
    const globalDatasetVersion = this.props.config?.datasetVersion ? (
      <a href={this.props.config.datasetVersion.uri} target="_blank" rel="noopener">
        {this.props.config.datasetVersion.label}
      </a>
    ) : null;

    const globalHeader = (
      <>
        <PopoverNext
          interactionKind={PopoverInteractionKind.HOVER}
          content={this.context.tourMenu}
          placement={popoverPositionToNextPlacement(Position.LEFT)}
        >
          <div title="Help and guided tours!" className="zav-TitledCardButton">
            <Icon icon="help" color="#FFF" />
          </div>
        </PopoverNext>

        {globalHeaderText}
        {datasetDetails}
      </>
    );

    const region = this.state.hoveredRegion ? RegionsManager.getRegion(this.state.hoveredRegion) : null;
    const regionName = region ? region.name : '';

    const subviewTitleSuffix =
      this.props.config && !this.props.config.hasMultiPlanes && typeof this.state.activePlane === 'number'
        ? ` — ${ZAVConfig.getPlaneLabel(ZAVConfig.getPreferredSubviewForPlane(this.state.activePlane))} view`
        : '';

    const currentTourStep = this.context.stepContext?.currentStep;
    const tourSpecificInit = {
      controlPanelExpanded:
        currentTourStep && ['mainImagePanel', 'collapsedControlPanel', 'expandedRegionPanel'].includes(currentTourStep)
          ? false
          : currentTourStep && ['expandedControlPanel', 'navigatorPanel'].includes(currentTourStep)
            ? true
            : undefined,
    };
    if (currentTourStep === '_init_') {
      (ViewerManager.goHome as (zoomout: boolean) => void)(true);
    } else if (currentTourStep === 'navigatorPanel') {
      (ViewerManager.setZoomFactor as (zf: number) => void)(50);
    }

    //url of repo from where source images can be retrieved
    const ginRepoBaseUrl = this.props.config?.dataset_info ? this.props.config.dataset_info.ginRepoBaseUrl : null;
    const layerFolderMap = ginRepoBaseUrl ? (this.props.config?.dataset_info?.layerFolderMap ?? null) : null;

    return (
      <HotkeysTarget2 hotkeys={this.hotkeys}>
        <div style={{ height: '100%' }}>
          <BrandingMark brandingInfo={this.props.config?.branding} />

          <div className="zav-StatusBar">
            <div
              className={
                'zav-StatusBarContent' +
                (this.state.hoveredRegion || this.state.hoveredROI ? ' hasStatus' : '') +
                (this.state.hoveredROI ? ' isROI' : '')
              }
            >
              {this.state.hoveredRegion ? (
                <React.Fragment>
                  <span>
                    <b>{this.state.hoveredRegion}</b> {regionName} {this.state.hoveredRegionSide}
                  </span>
                  {!this.props.config?.hasDelineation || this.state.showRegions ? null : (
                    <span className="zav-StatusBarHint">[Shift]+Click on the image to reveal the border</span>
                  )}
                </React.Fragment>
              ) : this.state.hoveredROI ? (
                <span>
                  <b>{this.state.hoveredROI}</b> {this.state.hoveredROILabel}
                </span>
              ) : null}
            </div>
          </div>

          <OSDMain />
          <Overlay className={Classes.OVERLAY_SCROLL_CONTAINER} isOpen={Boolean(this.state.longRunningMessage)}>
            <div style={{ left: 'calc(50vw - 200px)', margin: '10vh 0', top: 0, width: 400 }} className={classes}>
              <h3>
                <Icon icon="pulse" />
                {' Please wait'}
              </h3>
              <p>{this.state.longRunningMessage}</p>
            </div>
          </Overlay>

          <Drawer
            id="ZAV-rightPanel"
            collapseDirection={CollapseDirection.RIGHT}
            initExpanded={this.state.initExpanded}
            forceExpanded={
              Boolean((tourSpecificInit as { controlPanelExpanded?: boolean }).controlPanelExpanded) ||
              this.state.initExpanded
            }
            onClick={undefined}
            onExpandCollapse={this.onToolbarExpandCollapse.bind(this)}
            quickactions={
              <QuickActionButtons
                hasDelineation={this.props.config?.hasDelineation}
                displaySettings={this.state.layerDisplaySettings}
                showRegions={this.state.showRegions}
                activePlane={this.state.activePlane}
                chosenSlice={this.state.chosenSlice}
                config={this.props.config}
                tourMenu={this.context.tourMenu}
              />
            }
          >
            <TitledCard className="zav-controlPanel_Navigator" header={globalHeader}>
              <div className="navigatorParentClass">
                <div id={ViewerManager.NAVIGATOR_ID} className="navigatorChildClass"></div>
                <div className="zav-DatasetVersion">{globalDatasetVersion}</div>
              </div>
            </TitledCard>

            {this.props.config && this.props.config.getTotalSlidesCount() > 1 ? (
              <TitledCard
                className="zav-controlPanel_SliceNav"
                header={
                  this.props.config.volumeUrl ? (
                    <div
                      style={{ width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}
                    >
                      <PopoverNext
                        interactionKind={PopoverInteractionKind.CLICK}
                        content={
                          <div style={{ width: '70vw', maxWidth: 850, height: '90vh', overflowY: 'auto' }}>
                            <React.Suspense fallback={<div>Loading...</div>}>
                              <VolumeView url={this.props.config.volumeUrl} />
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
                  activePlane={this.state.activePlane}
                  chosenSlice={this.state.chosenSlice}
                  isToolbarExpanded={this.state.isToolbarExpanded}
                  config={this.props.config}
                />
              </TitledCard>
            ) : null}

            <TitledCard className="zav-controlPanel_Layers" header={'Layers control'} isCollapsible={true}>
              <SliderNavigatorPanel
                hasDelineation={this.props.config?.hasDelineation}
                displaySettings={this.state.layerDisplaySettings}
                ginRepoBaseUrl={ginRepoBaseUrl}
                layerFolderMap={layerFolderMap}
                chosenSlice={ginRepoBaseUrl ? this.state.chosenSlice : -1}
              />
            </TitledCard>

            {ViewerManager.hasProcessingsModule() ? (
              <TitledCard header={'Processing'} isCollapsible={true}>
                <ProcessingPanel posCount={this.state.position?.[0]?.c ?? 0} pos={this.state.pos} />
              </TitledCard>
            ) : null}

            {this.props.config?.hasDelineation ? (
              <TitledCard className="zav-controlPanel_Regions" header={'Atlas regions'} isCollapsible={true}>
                <RegionOptions
                  currentAtlas={this.props.config.currentAtlas}
                  atlases={this.props.config.atlases}
                  resetRegionsTree={this.props.resetRegionsTree}
                  showRegions={this.state.showRegions}
                  regionsOpacity={this.state.regionsOpacity}
                  initRegionsOpacity={this.state.initRegionsOpacity}
                  displayAreas={this.state.displayAreas}
                  displayBorders={this.state.displayBorders}
                  hasRegionLabels={this.state.hasRegionLabels}
                  displayLabels={this.state.displayLabels}
                  useCustomBorders={Boolean(this.state.useCustomBorders)}
                  customBorderColor={this.state.customBorderColor ?? '#ffffff'}
                  customBorderWidth={this.state.customBorderWidth ?? 1}
                />
                {this.state.editModeOn ? (
                  <React.Fragment>
                    <div style={{ borderBottom: 'dotted 1px #8a8a8a', margin: '3px 0' }} />
                    <RegionEditPanel
                      lastSelectedPath={this.state.lastSelectedPath}
                      editModeOn={this.state.editModeOn}
                      editingActive={this.state.editingActive}
                      editPathId={this.state.editPathId}
                      editPathFillColor={this.state.editPathFillColor}
                      editingTool={this.state.editingTool ?? 'pen'}
                      editingToolRadius={this.state.editingToolRadius ?? 10}
                    />
                  </React.Fragment>
                ) : null}
              </TitledCard>
            ) : null}

            {this.props.config && RoiInfo.hasROI ? (
              <TitledCard className="zav-controlPanel_ROIs" header={'ROIs'} isCollapsible={true}>
                <ROIOptions sliceHasROI={Boolean(this.state.hasROIs)} displayROIs={this.state.displayROIs} />
              </TitledCard>
            ) : null}

            {this.props.config?.matrix ? (
              <TitledCard
                className="zav-controlPanel_Distance"
                header={'Distance measurement'}
                isCollapsible={true}
                collapsed={true}
              >
                <MeasureInfoPanel
                  posCount={this.state.position?.[0]?.c ?? 0}
                  markedPos={this.state.markedPos ?? []}
                  markedPosColors={this.state.markedPosColors ?? []}
                />
              </TitledCard>
            ) : null}
          </Drawer>
        </div>
      </HotkeysTarget2>
    );
  }

  onToolbarExpandCollapse(isExpanded: boolean) {
    if (isExpanded) {
      ViewerManager.refreshNavigator();
    }
    this.setState((_state) => ({ isToolbarExpanded: isExpanded }));
  }
}

export default ViewerComposed;
