import {
  AnchorButton,
  Classes,
  FormGroup,
  Icon,
  InputGroup,
  OverlayToaster,
  PopoverInteractionKind,
  PopoverNext,
  Position,
  popoverPositionToNextPlacement,
  Switch,
} from '@blueprintjs/core';
import React from 'react';
import _ from 'underscore';

import RegionsManager, { type IRegion, type IRegionsStatus } from '../RegionsManager';
import ViewerManager from '../ViewerManager';

import './RegionTreePanel.scss';

const TREE_ACTIONSOURCEID = 'TREE';
const RegionDetailToaster = OverlayToaster.create({
  className: 'zav-RegionToaster',
  position: Position.TOP,
});

type RegionItemLabelProps = {
  region: IRegion;
  onBulletMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
  onBulletMouseLeave?: React.MouseEventHandler<HTMLButtonElement>;
  onBulletClick?: React.MouseEventHandler<HTMLButtonElement>;
};

type RegionItemProps = {
  regionId: string;
  regionsStatus?: IRegionsStatus;
  lastChild: boolean;
  requestScrollIntoView: (itemRect: DOMRect) => void;
};

type RegionItemState = {
  isHovered: boolean;
};

type RegionDetailProps = {
  regionId: string;
  hasMultiPlanes?: boolean;
};

type RegionTreeProps = {
  regionsStatus?: IRegionsStatus;
};

type RegionTreeSearchProps = {
  regionsStatus?: IRegionsStatus;
};

type RegionTreeSearchState = {
  pattern: string;
};

type RegionTreeStatusProps = {
  regionsStatus?: IRegionsStatus;
};

type RegionDetailPaneProps = {
  regionsStatus?: IRegionsStatus;
  hasMultiPlanes?: boolean;
};

type RegionTreePanelProps = {
  regionsStatus?: IRegionsStatus;
  hasMultiPlanes?: boolean;
};

class RegionItemLabel extends React.Component<RegionItemLabelProps> {
  render() {
    const region = this.props.region;
    return (
      <span className="zav-TreeItemLabel">
        <button
          type="button"
          className="zav-TreeItemLabelBullet"
          data-exists={1 === region.exists}
          style={{
            backgroundColor: this.props.region.color
              ? region.exists
                ? region.color
                : `${region.color}30`
              : 'transparent',
          }}
          onMouseEnter={this.props.onBulletMouseEnter}
          onMouseLeave={this.props.onBulletMouseLeave}
          onClick={this.props.onBulletClick}
          aria-label={`${region.abb} region color`}
        />
        <b>{region.abb}</b> <span>{region.name}</span>
      </span>
    );
  }
}

class RegionItem extends React.Component<RegionItemProps, RegionItemState> {
  private treeItemRef: React.RefObject<HTMLDivElement>;
  private regionActionner: ReturnType<typeof RegionsManager.getActionner>;
  private selectRegionClick: React.MouseEventHandler<HTMLButtonElement>;

  constructor(props: RegionItemProps) {
    super(props);
    this.treeItemRef = React.createRef<HTMLDivElement>();

    this.state = { isHovered: false };

    this.selectRegionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      this.regionClick(event, false);
    };
    this.expandCollapseClick = this.expandCollapseClick.bind(this);
    this.expandCollapseDblClick = this.expandCollapseDblClick.bind(this);

    this.regionActionner = RegionsManager.getActionner(TREE_ACTIONSOURCEID);
  }

  render() {
    const region = RegionsManager.getRegion(this.props.regionId);
    if (!region) {
      return null;
    }

    const _paddedLinks = [];

    // children regions
    let subregions: React.ReactNode = null;
    if (region.children) {
      const subItems: React.ReactNode[] = region.children.map((childId) => (
        <RegionItem
          key={`ri-${childId}`}
          lastChild={RegionsManager.isLastVisibleChild(childId)}
          regionsStatus={this.props.regionsStatus}
          regionId={childId}
          requestScrollIntoView={this.props.requestScrollIntoView}
        />
      ));
      subregions = (
        <ul className="zav-TreeSubItems" data-ishovered={this.state.isHovered}>
          {subItems}
        </ul>
      );
    }
    const highlightStatus = RegionsManager.getHighlightStatus(region.abb);
    const isExpanded = RegionsManager.isExpanded(region.abb);

    // ensure visibility of last selected region when selection performed via other component (e.g. Viewer)
    if (
      RegionsManager.getLastSelected() === region.abb &&
      this.regionActionner.lastActionInitiatedByOther() &&
      //prevent scrolling if region is hidden due to filtering
      RegionsManager.getHighlightStatus(region.abb) !== '0'
    ) {
      setTimeout(() => {
        //20200518 FF76 : Can't directly use this.treeItemRef.current.scrollIntoView(), because can make above components dissappearing...
        if (this.treeItemRef.current) {
          this.props.requestScrollIntoView(this.treeItemRef.current.getBoundingClientRect());
        }
      }, 400);
    }

    return (
      <li
        className="zav-TreeItemCont"
        data-isexpanded={isExpanded}
        data-islastchild={this.props.lastChild}
        data-highlight={highlightStatus}
      >
        <div
          ref={this.treeItemRef}
          className="zav-TreeItem"
          data-highlight={highlightStatus}
          data-isselected={RegionsManager.isSelected(region.abb)}
          data-exists={1 === region.exists}
        >
          <span className="zav-TreeItemLink" data-islastchild={this.props.lastChild} />
          <div
            className="zav-TreeItemHeader"
            //append low opacity to specified region color for border
            style={{ borderColor: region.color ? `${region.color}20` : '#80808024' }}
          >
            <button
              type="button"
              className="zav-TreeItemHandle"
              data-haschild={null != subregions}
              data-isexpanded={isExpanded}
              onClick={this.expandCollapseClick}
              aria-label={isExpanded ? `Collapse ${region.abb}` : `Expand ${region.abb}`}
            >
              <span className="zav-TreeItemHandleText" />
            </button>
            <button
              type="button"
              className="zav-TreeItemHeaderButton"
              onClick={region.exists ? this.selectRegionClick : undefined}
              onDoubleClick={this.expandCollapseDblClick}
              disabled={!region.exists}
              aria-label={`Select region ${region.abb}`}
            >
              <RegionItemLabel
                region={region}
                //to trigger visually highlighting of region and its descendants
                onBulletMouseEnter={(_e) => this.setState((_state) => ({ isHovered: true }))}
                onBulletMouseLeave={(_e) => this.setState((_state) => ({ isHovered: false }))}
              />
            </button>
          </div>
        </div>
        {subregions}
      </li>
    );
  }

  regionClick(event: React.MouseEvent<HTMLElement>, includeChildren: boolean) {
    if (event.ctrlKey) {
      //when Ctrl key is pressed, allow multi-select or toogle of currently selected region
      if (RegionsManager.isSelected(this.props.regionId)) {
        this.regionActionner.unSelect(this.props.regionId, includeChildren);
      } else {
        this.regionActionner.addToSelection(this.props.regionId, includeChildren);
      }
    } else {
      this.regionActionner.replaceSelected(this.props.regionId, includeChildren);
    }
  }

  expandCollapseClick(event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation();
    this.regionActionner.toogleExpanded(this.props.regionId);
  }

  expandCollapseDblClick(event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation();
    this.regionActionner.toogleExpandedAllFrom(this.props.regionId);
  }
}

class RegionDetail extends React.Component<RegionDetailProps> {
  render() {
    const region = RegionsManager.getRegion(this.props.regionId);

    let grouping: React.ReactNode = null;
    if (region) {
      if (region.groups) {
        const groupingInfo: React.ReactNode[] = [];
        //Note: groups id are unique and can be found in several grouping schemes
        _.chain(region.groups)
          .pairs()
          .groupBy((sgPair) => sgPair[1])
          .each((sgPairs, groupid) => {
            const _partOf = sgPairs
              .map((sgPair) => RegionsManager.getGrouping(sgPair[0])?.name ?? '')
              .filter(Boolean)
              .join(', ');
            const firstGrouping = sgPairs[0][0];
            groupingInfo.push(
              <div key={groupid} className="zav-RegionDetailGroupings">
                <div>
                  <Icon icon="search-around" />
                  <span style={{ fontStyle: 'italic', fontSize: 12, marginLeft: 16 }}>part of </span>
                  <b>{RegionsManager.getGroupName(firstGrouping, groupid) ?? groupid}</b>
                </div>
                {`in grouping${sgPairs.length > 1 ? 's' : ''} :`}
                <ul>
                  {sgPairs.map((sgPair) => (
                    <li key={`${groupid}-${sgPair[0]}`}>{RegionsManager.getGrouping(sgPair[0])?.name ?? sgPair[0]}</li>
                  ))}
                </ul>
              </div>,
            );
          });
        grouping = groupingInfo.length ? (
          <PopoverNext
            interactionKind={PopoverInteractionKind.HOVER}
            popoverClassName={Classes.POPOVER_CONTENT_SIZING}
            placement={popoverPositionToNextPlacement(Position.RIGHT)}
            rootBoundary="viewport"
          >
            <span>
              <Icon icon="search-around" size={12} className="zav-RegionGrpngsTarget" />
            </span>
            <div>{groupingInfo}</div>
          </PopoverNext>
        ) : null;
      }

      const hasCenterSliceInfo = region?.centerSlices || typeof region?.centerSlice !== 'undefined';
      const crumbs: React.ReactNode[] = [];
      region.trail?.forEach((rId) => {
        crumbs.push(<Icon key={`i-${rId}`} style={{ color: 'white' }} icon="slash" />);
        crumbs.push(
          <span key={`s-${rId}`} style={{ fontWeight: 'bold' }}>
            {rId}
          </span>,
        );
      });

      const trail = (
        <div style={{ fontSize: 10 }}>
          {crumbs}
          {grouping}
        </div>
      );

      return (
        <div className="zav-RegionDetailContent">
          {trail}
          <div style={{ marginTop: 8 }}>
            <RegionItemLabel region={region} />
          </div>
          <div style={{ marginTop: 12, marginLeft: 10 }}>
            {hasCenterSliceInfo ? (
              <React.Fragment>
                <div>
                  <AnchorButton icon="compass" minimal fill onClick={this.goToCenterSlice.bind(this, false)}>
                    Go to slice containing region center
                  </AnchorButton>
                </div>
                <div>
                  <AnchorButton icon="locate" minimal fill onClick={this.goToCenterSlice.bind(this, true)}>
                    Go to slice and focus on region center
                  </AnchorButton>
                </div>
              </React.Fragment>
            ) : region.exists ? null : (
              <span style={{ fontStyle: 'italic' }}>This region has not been identified in this dataset</span>
            )}
          </div>
        </div>
      );
    } else {
      return null;
    }
  }

  goToCenterSlice(centerOnRegion: boolean) {
    const centerSlice = RegionsManager.getRegionCenterSlice(
      this.props.regionId,
      this.props.hasMultiPlanes,
      ViewerManager.getActivePlane(),
    );
    const regionsToCenterOn = centerOnRegion ? [this.props.regionId] : null;
    void regionsToCenterOn;
    if (typeof centerSlice === 'number') {
      ViewerManager.goToSlice(centerSlice);
    }
    if (!ViewerManager.isShowingRegions()) {
      RegionDetailToaster.then((toaster) => {
        toaster.show({
          message: 'Do you want to show Atlas regions?',
          action: {
            text: 'show',
            icon: 'flash',
            onClick: this.showRegions,
          },
        });
      });
    }
  }

  showRegions() {
    ViewerManager.toggleAreaDisplay();
  }
}

/** Container of the regions display as a treeview */
class RegionTree extends React.Component<RegionTreeProps> {
  private scrollContainerRef: React.RefObject<HTMLDivElement>;

  constructor(props: RegionTreeProps) {
    super(props);
    this.scrollContainerRef = React.createRef<HTMLDivElement>();

    this.state = { showRegionDetail: false };

    this.onRequestScrollIntoView = this.onRequestScrollIntoView.bind(this);
  }
  render() {
    return (
      <div
        ref={this.scrollContainerRef}
        className="zav-Tree"
        data-hasselectedregion={this.props.regionsStatus && this.props.regionsStatus.lastSelected != null}
      >
        <ul className="zav-TreeSubItems" style={{ marginLeft: -15 }}>
          {this.props.regionsStatus && RegionsManager.getRoot() ? (
            <RegionItem
              regionsStatus={this.props.regionsStatus}
              regionId={RegionsManager.getRoot() as string}
              lastChild={true}
              requestScrollIntoView={this.onRequestScrollIntoView}
            />
          ) : null}
        </ul>
      </div>
    );
  }

  handleInteraction(nextOpenState: boolean) {
    this.setState({ showRegionDetail: nextOpenState });
  }

  onRequestScrollIntoView(itemRect: DOMRect) {
    const itemHeight = 22;
    if (!this.scrollContainerRef.current) {
      return;
    }
    const contRect = this.scrollContainerRef.current.getBoundingClientRect();

    /** vertical scroll only if region item is not already in view */
    let desiredScrollY: number | null = null;
    if (itemRect.top < contRect.top) {
      desiredScrollY = this.scrollContainerRef.current.scrollTop + itemRect.top - contRect.top - itemHeight / 2;
      if (desiredScrollY < 0) {
        desiredScrollY = 0;
      }
    } else if (itemRect.bottom > contRect.height) {
      desiredScrollY = this.scrollContainerRef.current.scrollTop + itemRect.bottom - contRect.height + itemHeight / 2;
    }

    let desiredScrollX: number | null = null;
    if (itemRect.left < contRect.left) {
      desiredScrollX = this.scrollContainerRef.current.scrollLeft + itemRect.left - contRect.left;
      if (desiredScrollX < 0) {
        desiredScrollX = 0;
      }
    } else if (itemRect.right > contRect.width) {
      desiredScrollX = this.scrollContainerRef.current.scrollLeft + itemRect.left - contRect.left;
    }

    if (desiredScrollY || desiredScrollX) {
      const scrollArg: ScrollToOptions = { behavior: 'smooth' };
      if (desiredScrollY) {
        scrollArg.top = desiredScrollY;
      }
      if (desiredScrollX) {
        scrollArg.left = desiredScrollX;
      }

      this.scrollContainerRef.current.scrollTo(scrollArg);
    }
  }
}

/** component to receive user's input trigerring region search */
class RegionTreeSearch extends React.Component<RegionTreeSearchProps, RegionTreeSearchState> {
  private regionActionner: ReturnType<typeof RegionsManager.getActionner>;

  constructor(props: RegionTreeSearchProps) {
    super(props);
    this.state = { pattern: '' };
    this.onPatternChange = this.onPatternChange.bind(this);
    this.searchPattern = this.searchPattern.bind(this);
    this.onOnlySlicesChange = this.onOnlySlicesChange.bind(this);

    this.regionActionner = RegionsManager.getActionner(TREE_ACTIONSOURCEID);
  }

  static getDerivedStateFromProps(_props: RegionTreeSearchProps, state: RegionTreeSearchState) {
    if (
      state.pattern &&
      !RegionsManager.hasHighlighting() &&
      RegionsManager.lastActionInitiatedByOther(TREE_ACTIONSOURCEID)
    ) {
      return { pattern: '' };
    } else {
      return state;
    }
  }

  render() {
    const groupingSwitches: React.ReactNode[] = [];
    if (RegionsManager.getGroupings()) {
      Object.entries(RegionsManager.getGroupings() ?? {}).forEach(([groupingId, grouping]) => {
        groupingSwitches.push(
          <Switch
            labelElement={
              <span>
                List only the regions present in "<span style={{ fontStyle: 'italic' }}>{grouping.name}</span>"
              </span>
            }
            key={`switch-${groupingId}`}
            onChange={this.onOnlyGroupingChange.bind(this, groupingId)}
            checked={RegionsManager.getHighlightingGrouping() === groupingId}
            disabled={
              RegionsManager.isAutoHighlightingOn() ||
              (RegionsManager.getHighlightingGrouping() != null &&
                RegionsManager.getHighlightingGrouping() !== groupingId)
            }
          />,
        );
      });
    }

    return (
      <div className="zav-SearchBox">
        <div style={{ marginLeft: 5, flexGrow: 1 }}>
          <FormGroup>
            <InputGroup
              className="zav-regions_searchinput"
              placeholder=" Region search "
              disabled={RegionsManager.isHighlightingLocked()}
              value={this.state.pattern}
              onChange={this.onPatternChange}
              rightElement={
                <AnchorButton
                  icon="eraser"
                  minimal
                  onClick={this.searchPattern.bind(this, '')}
                  disabled={RegionsManager.isHighlightingLocked()}
                />
              }
            />
          </FormGroup>
        </div>
        <PopoverNext
          interactionKind={PopoverInteractionKind.HOVER}
          popoverClassName={Classes.POPOVER_CONTENT_SIZING}
          placement={popoverPositionToNextPlacement(Position.BOTTOM)}
          content={
            <div>
              <Switch
                label="List only the regions present in current slice"
                onChange={this.onOnlySlicesChange}
                checked={RegionsManager.isAutoHighlightingOn()}
                disabled={Boolean(RegionsManager.getHighlightingGrouping())}
              />
              {groupingSwitches}
            </div>
          }
        >
          <div style={{ marginLeft: 10, marginRight: 5 }}>
            <AnchorButton icon="cog" />
          </div>
        </PopoverNext>
      </div>
    );
  }

  onPatternChange(event: React.ChangeEvent<HTMLInputElement>) {
    this.searchPattern(event.target.value);
  }

  searchPattern(pattern: string) {
    this.setState({ pattern: pattern });
    this.regionActionner.higlightByName(pattern);
  }

  onOnlySlicesChange(_event: React.FormEvent<HTMLInputElement>) {
    this.regionActionner.toggleAutoHighlighting();
    this.forceUpdate();
  }

  onOnlyGroupingChange(scheme: string, event: React.FormEvent<HTMLInputElement>) {
    this.regionActionner.higlightByGrouping(scheme, event.currentTarget.checked);
    this.forceUpdate();
  }
}

class RegionTreeStatus extends React.Component<RegionTreeStatusProps> {
  render() {
    let content: React.ReactNode = null;
    if (RegionsManager.hasHighlighting()) {
      content = (
        <div style={{ color: '#8b0000', fontSize: 12 }} title="Number of highlighted regions">
          {`(${this.props.regionsStatus?.highlighted.size ?? 0})`}
        </div>
      );
    }
    return (
      <div className="zav-TreeStatus">
        <div className="zav-TreeStatusContent">{content}</div>
      </div>
    );
  }
}

class RegionDetailPane extends React.Component<RegionDetailPaneProps> {
  render() {
    return (
      <div className="zav-RegionDetailPane">
        {this.props.regionsStatus?.lastSelected ? (
          <RegionDetail regionId={this.props.regionsStatus.lastSelected} hasMultiPlanes={this.props.hasMultiPlanes} />
        ) : null}
      </div>
    );
  }
}

class RegionTreePanel extends React.Component<RegionTreePanelProps> {
  render() {
    return (
      <div style={{ height: '100%', width: '100%' }}>
        <div style={{ height: '100%', width: '100%', overflow: 'hidden', backgroundColor: '#e1e1e1' }}>
          <RegionTreeSearch regionsStatus={this.props.regionsStatus} />
          <RegionTree regionsStatus={this.props.regionsStatus} />
          <RegionDetailPane regionsStatus={this.props.regionsStatus} hasMultiPlanes={this.props.hasMultiPlanes} />
          <RegionTreeStatus regionsStatus={this.props.regionsStatus} />
        </div>
      </div>
    );
  }
}

export default RegionTreePanel;
