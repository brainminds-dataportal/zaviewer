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
  onBulletMouseEnter?: React.MouseEventHandler<HTMLSpanElement>;
  onBulletMouseLeave?: React.MouseEventHandler<HTMLSpanElement>;
};

type RegionItemProps = {
  regionId: string;
  regionsStatus?: IRegionsStatus;
  lastChild: boolean;
  isRoot?: boolean;
  requestScrollIntoView: (itemRect: DOMRect) => void;
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

const RegionItemLabel = (props: RegionItemLabelProps) => {
  const { region } = props;
  return (
    <span className="zav-TreeItemLabel">
      <span
        className="zav-TreeItemLabelBullet"
        data-exists={1 === region.exists}
        style={{
          backgroundColor: props.region.color ? (region.exists ? region.color : `${region.color}30`) : 'transparent',
        }}
        onMouseEnter={props.onBulletMouseEnter}
        onMouseLeave={props.onBulletMouseLeave}
        aria-hidden="true"
      />
      <b>{region.abb}</b> <span>{region.name}</span>
    </span>
  );
};

const RegionItem = (props: RegionItemProps) => {
  const treeItemRef = React.useRef<HTMLDivElement>(null);
  const regionActionner = React.useMemo(() => RegionsManager.getActionner(TREE_ACTIONSOURCEID), []);
  const [isHovered, setIsHovered] = React.useState(false);

  const region = RegionsManager.getRegion(props.regionId);
  const highlightStatus = region ? RegionsManager.getHighlightStatus(region.abb) : '0';
  const isExpanded = region ? RegionsManager.isExpanded(region.abb) : false;

  React.useEffect(() => {
    if (
      !region ||
      RegionsManager.getLastSelected() !== region.abb ||
      !regionActionner.lastActionInitiatedByOther() ||
      highlightStatus === '0'
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (treeItemRef.current) {
        props.requestScrollIntoView(treeItemRef.current.getBoundingClientRect());
      }
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [highlightStatus, props, region, regionActionner]);

  const regionClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>, includeChildren: boolean) => {
      if (event.ctrlKey) {
        if (RegionsManager.isSelected(props.regionId)) {
          regionActionner.unSelect(props.regionId, includeChildren);
        } else {
          regionActionner.addToSelection(props.regionId, includeChildren);
        }
      } else {
        regionActionner.replaceSelected(props.regionId, includeChildren);
      }
    },
    [props.regionId, regionActionner],
  );

  const expandCollapseClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      regionActionner.toogleExpanded(props.regionId);
    },
    [props.regionId, regionActionner],
  );

  const expandCollapseDblClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      regionActionner.toogleExpandedAllFrom(props.regionId);
    },
    [props.regionId, regionActionner],
  );

  if (!region) {
    return null;
  }

  let subregions: React.ReactNode = null;
  if (region.children) {
    const subItems: React.ReactNode[] = region.children.map((childId) => (
      <RegionItem
        key={`ri-${childId}`}
        lastChild={RegionsManager.isLastVisibleChild(childId)}
        isRoot={false}
        regionsStatus={props.regionsStatus}
        regionId={childId}
        requestScrollIntoView={props.requestScrollIntoView}
      />
    ));
    subregions = (
      <ul className="zav-TreeSubItems" data-ishovered={isHovered}>
        {subItems}
      </ul>
    );
  }

  return (
    <li
      className="zav-TreeItemCont"
      data-isexpanded={isExpanded}
      data-islastchild={props.lastChild}
      data-isroot={props.isRoot}
      data-highlight={highlightStatus}
    >
      <div
        ref={treeItemRef}
        className="zav-TreeItem"
        data-highlight={highlightStatus}
        data-isselected={RegionsManager.isSelected(region.abb)}
        data-exists={1 === region.exists}
      >
        <span className="zav-TreeItemLink" data-islastchild={props.lastChild} />
        <div className="zav-TreeItemHeader" style={{ borderColor: region.color ? `${region.color}20` : '#80808024' }}>
          <button
            type="button"
            className="zav-TreeItemHandle"
            data-haschild={null != subregions}
            data-isexpanded={isExpanded}
            onClick={expandCollapseClick}
            aria-label={isExpanded ? `Collapse ${region.abb}` : `Expand ${region.abb}`}
          >
            <span className="zav-TreeItemHandleText" />
          </button>
          <button
            type="button"
            className="zav-TreeItemHeaderButton"
            onClick={region.exists ? (event) => regionClick(event, false) : undefined}
            onDoubleClick={expandCollapseDblClick}
            disabled={!region.exists}
            aria-label={`Select region ${region.abb}`}
          >
            <RegionItemLabel
              region={region}
              onBulletMouseEnter={() => setIsHovered(true)}
              onBulletMouseLeave={() => setIsHovered(false)}
            />
          </button>
        </div>
      </div>
      {subregions}
    </li>
  );
};

const RegionDetail = (props: RegionDetailProps) => {
  const region = RegionsManager.getRegion(props.regionId);

  const showRegions = React.useCallback(() => {
    ViewerManager.toggleAreaDisplay();
  }, []);

  const goToCenterSlice = React.useCallback(
    (centerOnRegion: boolean) => {
      const centerSlice = RegionsManager.getRegionCenterSlice(
        props.regionId,
        props.hasMultiPlanes,
        ViewerManager.getActivePlane(),
      );
      const regionsToCenterOn = centerOnRegion ? [props.regionId] : null;
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
              onClick: showRegions,
            },
          });
        });
      }
    },
    [props.hasMultiPlanes, props.regionId, showRegions],
  );

  if (!region) {
    return null;
  }

  let grouping: React.ReactNode = null;
  if (region.groups) {
    const groupingInfo: React.ReactNode[] = [];
    _.chain(region.groups)
      .pairs()
      .groupBy((sgPair) => sgPair[1])
      .each((sgPairs, groupid) => {
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

  const hasCenterSliceInfo = region.centerSlices || typeof region.centerSlice !== 'undefined';
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
              <AnchorButton icon="compass" minimal fill onClick={() => goToCenterSlice(false)}>
                Go to slice containing region center
              </AnchorButton>
            </div>
            <div>
              <AnchorButton icon="locate" minimal fill onClick={() => goToCenterSlice(true)}>
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
};

const RegionTree = (props: RegionTreeProps) => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const onRequestScrollIntoView = React.useCallback((itemRect: DOMRect) => {
    const itemHeight = 22;
    if (!scrollContainerRef.current) {
      return;
    }
    const contRect = scrollContainerRef.current.getBoundingClientRect();

    let desiredScrollY: number | null = null;
    if (itemRect.top < contRect.top) {
      desiredScrollY = scrollContainerRef.current.scrollTop + itemRect.top - contRect.top - itemHeight / 2;
      if (desiredScrollY < 0) {
        desiredScrollY = 0;
      }
    } else if (itemRect.bottom > contRect.height) {
      desiredScrollY = scrollContainerRef.current.scrollTop + itemRect.bottom - contRect.height + itemHeight / 2;
    }

    let desiredScrollX: number | null = null;
    if (itemRect.left < contRect.left) {
      desiredScrollX = scrollContainerRef.current.scrollLeft + itemRect.left - contRect.left;
      if (desiredScrollX < 0) {
        desiredScrollX = 0;
      }
    } else if (itemRect.right > contRect.width) {
      desiredScrollX = scrollContainerRef.current.scrollLeft + itemRect.left - contRect.left;
    }

    if (desiredScrollY || desiredScrollX) {
      const scrollArg: ScrollToOptions = { behavior: 'smooth' };
      if (desiredScrollY) {
        scrollArg.top = desiredScrollY;
      }
      if (desiredScrollX) {
        scrollArg.left = desiredScrollX;
      }
      scrollContainerRef.current.scrollTo(scrollArg);
    }
  }, []);

  return (
    <div
      ref={scrollContainerRef}
      className="zav-Tree"
      data-hasselectedregion={props.regionsStatus && props.regionsStatus.lastSelected != null}
    >
      <ul className="zav-TreeSubItems zav-TreeSubItemsRoot">
        {props.regionsStatus && RegionsManager.getRoot() ? (
          <RegionItem
            regionsStatus={props.regionsStatus}
            regionId={RegionsManager.getRoot() as string}
            lastChild={true}
            isRoot={true}
            requestScrollIntoView={onRequestScrollIntoView}
          />
        ) : null}
      </ul>
    </div>
  );
};

const RegionTreeSearch = (_props: RegionTreeSearchProps) => {
  const [pattern, setPattern] = React.useState('');
  const [, forceUpdate] = React.useReducer((value) => value + 1, 0);
  const regionActionner = React.useMemo(() => RegionsManager.getActionner(TREE_ACTIONSOURCEID), []);

  React.useEffect(() => {
    if (
      pattern &&
      !RegionsManager.hasHighlighting() &&
      RegionsManager.lastActionInitiatedByOther(TREE_ACTIONSOURCEID)
    ) {
      setPattern('');
    }
  });

  const searchPattern = React.useCallback(
    (nextPattern: string) => {
      setPattern(nextPattern);
      regionActionner.higlightByName(nextPattern);
    },
    [regionActionner],
  );

  const onPatternChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      searchPattern(event.target.value);
    },
    [searchPattern],
  );

  const onOnlySlicesChange = React.useCallback(
    (_event: React.FormEvent<HTMLInputElement>) => {
      regionActionner.toggleAutoHighlighting();
      forceUpdate();
    },
    [regionActionner],
  );

  const onOnlyGroupingChange = React.useCallback(
    (scheme: string, event: React.FormEvent<HTMLInputElement>) => {
      regionActionner.higlightByGrouping(scheme, event.currentTarget.checked);
      forceUpdate();
    },
    [regionActionner],
  );

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
          onChange={(event) => onOnlyGroupingChange(groupingId, event)}
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
            value={pattern}
            onChange={onPatternChange}
            rightElement={
              <AnchorButton
                icon="eraser"
                minimal
                onClick={() => searchPattern('')}
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
              onChange={onOnlySlicesChange}
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
};

const RegionTreeStatus = (props: RegionTreeStatusProps) => {
  let content: React.ReactNode = null;
  if (RegionsManager.hasHighlighting()) {
    content = (
      <div style={{ color: '#8b0000', fontSize: 12 }} title="Number of highlighted regions">
        {`(${props.regionsStatus?.highlighted.size ?? 0})`}
      </div>
    );
  }
  return (
    <div className="zav-TreeStatus">
      <div className="zav-TreeStatusContent">{content}</div>
    </div>
  );
};

const RegionDetailPane = (props: RegionDetailPaneProps) => {
  return (
    <div className="zav-RegionDetailPane">
      {props.regionsStatus?.lastSelected ? (
        <RegionDetail regionId={props.regionsStatus.lastSelected} hasMultiPlanes={props.hasMultiPlanes} />
      ) : null}
    </div>
  );
};

const RegionTreePanel = (props: RegionTreePanelProps) => {
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <div style={{ height: '100%', width: '100%', overflow: 'hidden', backgroundColor: '#e1e1e1' }}>
        <RegionTreeSearch regionsStatus={props.regionsStatus} />
        <RegionTree regionsStatus={props.regionsStatus} />
        <RegionDetailPane regionsStatus={props.regionsStatus} hasMultiPlanes={props.hasMultiPlanes} />
        <RegionTreeStatus regionsStatus={props.regionsStatus} />
      </div>
    </div>
  );
};

export default RegionTreePanel;
