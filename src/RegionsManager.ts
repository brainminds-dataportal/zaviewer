// biome-ignore-all lint/suspicious/useIterableCallbackReturn: Existing collection traversal uses concise return expressions and is preserved during lint cleanup.
export interface IRegionsPayload {
  regions: IRegion[];
  groupings: { g116: IGroupingDef };
}

export interface IGroupingDef {
  grouping: string;
  name: string;
  groups: IGroupDef[];
}

export interface IGroupDef {
  id: string;
  name: string;
  members: string[];
}

export interface IGroupings {
  g116: string;
}

interface IIndexedGroups {
  name: string;
  groups: Map<string, string>;
}

interface IRegionData {
  regionById: Map<string, IRegion>;
  root: string;
  groupsById: Map<string, IIndexedGroups>;
  lineage: object;
}

export interface IRegion {
  id: number;
  abb: string; // region's abbreviation. MUST be unique as it is actually used as region identifier.
  parent: string | null; // abbreviation of the parent region, null for the unique root region.
  name: string; // long name of the region.
  exists: number; // indicates if the region is identified in at least one slice (value 1, 0 otherwise)
  color: string; // RGB hex value of the color associated to the region
  children?: string[]; // [optional] list of abbreviation of sub-regions
  groups?: IGroupings; //
  slices?: number[]; //FIXME Useless (not referenced, only support single axis, and slice's regions loaded from SVG)
  centerSlice?: number; //on single axis mode
  centerSlices?: {
    a: number;
    c: number;
    s: number;
  }; //on multi-plane mode, center slice numbers are indexed by axis shortnames
  trail?: string[];
  nameupper?: string;
  abbupper?: string;
}

export interface IRegionsStatus {
  /** currently selected regions */
  selected: Set<string>;
  /** last selected regions (since multi-select is allowed) */
  lastSelected: string | undefined;

  /** true when higlighting is currently on (e.g. searching for regions using a text pattern) */
  isHighlightingOn: boolean;
  /** true when higlighting won't be reset unless explicitely unlocked */
  highlightingLocked: boolean;

  /** true when automatic higlighting of regions found in current slice is on */
  autoHighlightingOn: boolean;

  /** list of regions present in current slice */
  currentSliceRegions: string[];

  /** grouping scheme name which is currently highlighted */
  highlightedGrouping: string | undefined;

  /** currently highlighted regions (i.e. result of text search) */
  highlighted: Set<string>;
  /** parents region of highlighted regions, necessary to display tree */
  filtered: Set<string>;

  /** expanded status of regions tree items */
  expanded: Map<string, boolean>;

  /** source of the last modification  */
  lastActionSource: string;

  loadedRegions: boolean;
}

export type ICallbackWhenChanged = (status: IRegionsStatus) => void;

/** Class in charge of managing regions */
// biome-ignore lint/complexity/noStaticOnlyClass: RegionsManager is intentionally a static facade for shared atlas-region state.
class RegionsManager {
  static status: IRegionsStatus;
  private static regionsData: IRegionData;
  private static listeners: ICallbackWhenChanged[];
  private static isHighlightingOn: boolean;
  private static highlightingLocked: boolean;

  /**
   * Retrieve region data associated to a configuration
   * @param {string} config -
   * @param {function} callbackWhenChanged - function asynchronously invoked to signal that the region data have changed
   */

  static init(
    data: IRegionsPayload,
    callbackWhenChanged: ICallbackWhenChanged,
    initSelectedRegion: string[] | undefined,
  ) {
    RegionsManager.addListeners(callbackWhenChanged);

    RegionsManager.status = {
      selected: new Set<string>(),
      lastSelected: undefined,
      isHighlightingOn: false,
      highlightingLocked: false,
      autoHighlightingOn: false,
      currentSliceRegions: [],
      highlightedGrouping: undefined,
      highlighted: new Set<string>(),
      filtered: new Set<string>(),
      expanded: new Map<string, boolean>(),
      lastActionSource: 'init',
      loadedRegions: false,
    };

    RegionsManager.prepareData(data, initSelectedRegion);
  }

  /** @private */

  static prepareData(data: IRegionsPayload, initSelectedRegion: string[] | undefined) {
    const root = data.regions.find((r) => null === r.parent);
    RegionsManager.regionsData = {
      regionById: new Map(data.regions.map((r) => [r.abb, r])),

      root: root?.abb,

      groupsById: new Map(
        Object.entries(data.groupings).map(([k, v], _i) => [
          k,
          {
            name: v.name,
            groups: new Map(v.groups.map((g) => [g.id, g.name])),
          },
        ]),
      ),
      lineage: {},
    };

    const that = RegionsManager;
    /** add trail of ancestors to each region */
    const addTrailToRegion = (regionId: string, trail: string[]) => {
      const currRegion = that.regionsData.regionById.get(regionId);
      if (currRegion) {
        currRegion.trail = Array.from(trail);
        if (currRegion.children?.length) {
          trail.push(regionId);
          currRegion.children.forEach((childId) => addTrailToRegion(childId, trail));
          trail.pop();
        }
      }
    };

    RegionsManager.regionsData.regionById.forEach((region) => {
      region.nameupper = region.name.toUpperCase();
      region.abbupper = region.abb.toUpperCase();
    });

    addTrailToRegion(RegionsManager.regionsData.root, []);

    RegionsManager.status.loadedRegions = true;

    if (initSelectedRegion) {
      //initial selection of region(s)
      const validRegions = initSelectedRegion.filter((r) => RegionsManager.regionsData.regionById.has(r));

      const regionsAndLeaves = validRegions
        .flatMap((r) => {
          const region = RegionsManager.getRegion(r);
          return [r, ...(region?.children?.length ? RegionsManager._getLeafChildrenRegions(r) : [])];
        })
        .reverse();

      RegionsManager._replaceAllSelected(RegionsManager.status.lastActionSource, regionsAndLeaves, true);
      //treeview needs to be expanded to display selection
      regionsAndLeaves.forEach((r) => RegionsManager._expandFromRootTo(r));
    } else {
      /** only first level expanded at startup */
      RegionsManager._collapseAll();
      RegionsManager._setExpanded(RegionsManager.status.lastActionSource, RegionsManager.regionsData.root, true);
    }
  }

  static setExistingRegions(existingRegions: string[]) {
    if (RegionsManager.status) {
      //parents of existing regions will be tagged as existing as well
      const existsOrParent = new Set<string>();
      existingRegions.forEach((regionId) => {
        const regionInfo = RegionsManager.regionsData.regionById.get(regionId);
        if (regionInfo) {
          existsOrParent.add(regionInfo.abb);
          regionInfo.trail?.forEach((rid) => existsOrParent.add(rid));
        }
      });
      //reset all regions
      RegionsManager.regionsData.regionById.forEach((regionInfo, regionId) => {
        if (regionInfo) {
          regionInfo.exists = existsOrParent.has(regionId) ? 1 : 0;
        }
      });

      RegionsManager.signalListeners();
    }
  }

  private static signalListeners() {
    RegionsManager.status = { ...RegionsManager.status };
    RegionsManager.listeners.forEach((listener) => listener(RegionsManager.status));
  }

  static addListeners(callbackWhenChanged: ICallbackWhenChanged) {
    if (!RegionsManager.listeners) {
      RegionsManager.listeners = [];
    }

    if (callbackWhenChanged && typeof callbackWhenChanged === 'function') {
      try {
        RegionsManager.listeners.push(callbackWhenChanged);
      } catch (_ex) {}
    }
  }

  static isReady() {
    return typeof RegionsManager.status !== 'undefined' && Boolean(RegionsManager.regionsData);
  }

  static getActionner(actionGroupId: string) {
    return new Actionner(actionGroupId);
  }

  static getLastActionSource() {
    return RegionsManager.status ? RegionsManager.status.lastActionSource : null;
  }

  static _setLastActionSource(actionGroupId: string) {
    RegionsManager.status.lastActionSource = actionGroupId;
  }

  static lastActionInitiatedByOther(actionGroupId: string) {
    return RegionsManager.getLastActionSource() && RegionsManager.getLastActionSource() !== actionGroupId;
  }

  static getGroupings() {
    return RegionsManager.regionsData ? RegionsManager.regionsData.groupsById : undefined;
  }

  static getGrouping(groupingScheme: string) {
    return RegionsManager.regionsData?.groupsById.has(groupingScheme)
      ? RegionsManager.regionsData.groupsById.get(groupingScheme)
      : null;
  }

  static getGroupName(groupingScheme: string, groupId: string) {
    return RegionsManager.regionsData?.groupsById.get(groupingScheme)?.groups
      ? RegionsManager.regionsData?.groupsById?.get(groupingScheme)?.groups?.get(groupId)
      : undefined;
  }

  static getRoot() {
    return RegionsManager.regionsData ? RegionsManager.regionsData.root : undefined;
  }

  static getRegion(regionId: string): IRegion | undefined {
    return RegionsManager.regionsData ? RegionsManager.regionsData.regionById.get(regionId) : undefined;
  }

  static getRegionCenterSlice(
    regionId: string,
    hasMultiPlanes: boolean = false,
    activePlane: number = 0,
  ): number | undefined {
    const AXIAL = 1;
    const CORONAL = 2;
    const SAGITTAL = 3;

    const region = RegionsManager.getRegion(regionId);
    let sliceNum: number | undefined;
    if (hasMultiPlanes) {
      if (activePlane) {
        if (region?.centerSlices) {
          sliceNum =
            activePlane === AXIAL
              ? region?.centerSlices?.a
              : activePlane === CORONAL
                ? region?.centerSlices?.c
                : activePlane === SAGITTAL
                  ? region?.centerSlices?.s
                  : undefined;
        }
      } else {
        //activeplane should be specified
      }
    } else {
      sliceNum = region?.centerSlice;
    }
    return sliceNum;
  }

  static isSelected(regionId: string | undefined): boolean {
    return regionId && RegionsManager.status ? RegionsManager.status.selected.has(regionId) : false;
  }

  static getLastSelected(): string | undefined {
    return RegionsManager.status ? RegionsManager.status.lastSelected : undefined;
  }

  static getSelectedRegions(): string[] {
    if (RegionsManager.status?.selected) {
      return Array.from(RegionsManager.status.selected.values());
    } else {
      return [];
    }
  }

  static _replaceAllSelected(actionGroupId: string, regionIds: string[], _includeChildren: boolean) {
    RegionsManager.status.selected.clear();
    regionIds.forEach((regionId) => {
      RegionsManager.status.selected.add(regionId);
      RegionsManager.status.lastSelected = regionId;
    });
    RegionsManager._setLastActionSource(actionGroupId);
    RegionsManager.signalListeners();
  }

  static _replaceSelected(actionGroupId: string, regionId: string, includeChildren: boolean) {
    RegionsManager.status.selected.clear();
    RegionsManager._addToSelection(actionGroupId, regionId, includeChildren);
  }

  static _addToSelection(actionGroupId: string, regionId: string, _includeChildren: boolean) {
    RegionsManager.status.selected.add(regionId);
    RegionsManager.status.lastSelected = regionId;
    //do not change expand/collapse state while an highlighting is locked
    if (!RegionsManager.isHighlightingLocked()) {
      if (RegionsManager.getLastActionSource() !== actionGroupId) {
        RegionsManager._clearHighlighting(actionGroupId);
        RegionsManager._collapseAll();
      }
      RegionsManager._expandFromRootTo(regionId);
    }
    RegionsManager._setLastActionSource(actionGroupId);
    RegionsManager.signalListeners();
  }

  static _unSelect(actionGroupId: string, regionId: string, _includeChildren: boolean) {
    RegionsManager.status.selected.delete(regionId);
    RegionsManager.status.lastSelected = Array.from(RegionsManager.status.selected).pop();
    RegionsManager._setLastActionSource(actionGroupId);
    RegionsManager.signalListeners();
  }

  static _unSelectAll(actionGroupId: string) {
    RegionsManager.status.selected.clear();
    RegionsManager.status.lastSelected = undefined;
    RegionsManager._setLastActionSource(actionGroupId);
    RegionsManager.signalListeners();
  }

  static _setExpanded(actionGroupId: string, regionId: string, expanded: boolean, silent?: boolean) {
    RegionsManager.status.expanded.set(regionId, Boolean(expanded));
    if (!silent) {
      RegionsManager._setLastActionSource(actionGroupId);
      RegionsManager.signalListeners();
    }
  }

  static _toogleExpanded(actionGroupId: string, regionId: string) {
    RegionsManager._setExpanded(actionGroupId, regionId, !RegionsManager.isExpanded(regionId));
  }

  static isExpanded(regionId: string) {
    return Boolean(RegionsManager.status.expanded.get(regionId));
  }

  static _expandFromRootTo(regionId: string) {
    const region = RegionsManager.getRegion(regionId);
    if (region?.trail) {
      region.trail.forEach((ancestorId) => RegionsManager.status.expanded.set(ancestorId, true));
    }
  }

  static _expandCollapseAllFrom(actionGroupId: string, regionId: string, expanded: boolean, silent?: boolean) {
    const region = RegionsManager.getRegion(regionId);
    const childrenRegions = region ? region.children : null;
    if (childrenRegions) {
      const that = RegionsManager;
      childrenRegions.forEach((childId) => that._expandCollapseAllFrom(actionGroupId, childId, expanded, true));
    }
    RegionsManager._setExpanded(actionGroupId, regionId, expanded, true);
    if (!silent) {
      RegionsManager._setLastActionSource(actionGroupId);
      RegionsManager.signalListeners();
    }
  }

  static _collapseAll() {
    if (RegionsManager.regionsData) {
      RegionsManager.regionsData.regionById.forEach((_region, regionId) =>
        RegionsManager.status.expanded.set(regionId, false),
      );
    }
  }

  static isLastVisibleChild(regionId: string) {
    const region = RegionsManager.getRegion(regionId);
    const parent = region?.parent ? RegionsManager.getRegion(region.parent) : undefined;
    if (RegionsManager.hasHighlighting()) {
      const followingSiblings = parent?.children?.slice(parent?.children.indexOf(regionId) + 1);
      const nextVisibleSiblingIndex = followingSiblings?.findIndex(
        (siblingId) => RegionsManager.isHighlighted(siblingId) || RegionsManager.isFiltered(siblingId),
      );
      return -1 === nextVisibleSiblingIndex;
    } else {
      const children = parent?.children;
      return children ? regionId === children[children.length - 1] : true;
    }
  }

  static _getLeafChildrenRegions(regionId: string): string[] {
    const region = RegionsManager.getRegion(regionId);
    if (region?.children?.length) {
      return region.children.flatMap((childId) => RegionsManager._getLeafChildrenRegions(childId));
    } else {
      return [regionId];
    }
  }

  static getHighlightStatus(regionId: string | undefined) {
    if (!regionId || !RegionsManager.hasHighlighting()) {
      /** no highlighting */
      return 'no';
    } else if (RegionsManager.isHighlighted(regionId)) {
      /** hightlighted (region of interest) */
      return 'H';
    } else if (RegionsManager.isFiltered(regionId)) {
      /** filtered (supporting region)*/
      return 'F';
    } else {
      /** hidden */
      return '0';
    }
  }

  static hasHighlighting() {
    return RegionsManager.isHighlightingOn;
  }

  static isHighlightingLocked() {
    return RegionsManager.highlightingLocked;
  }

  static _lockHighlighting() {
    RegionsManager.highlightingLocked = true;
  }

  static _unlockHighlighting() {
    RegionsManager.highlightingLocked = false;
  }

  static _clearHighlighting(_actionGroupId: string) {
    if (!RegionsManager.isHighlightingLocked()) {
      RegionsManager.status.highlighted.clear();
      RegionsManager.status.filtered.clear();
      RegionsManager.isHighlightingOn = false;
    }
  }

  static isHighlighted(regionId: string) {
    return RegionsManager.status.highlighted.has(regionId);
  }
  static isFiltered(regionId: string) {
    return RegionsManager.status.filtered.has(regionId);
  }

  static _higlightByName(actionGroupId: string, pattern: string) {
    if (!RegionsManager.isHighlightingLocked()) {
      RegionsManager._clearHighlighting(actionGroupId);

      if (pattern) {
        const patternupper = pattern.toUpperCase();

        /** highlight regions that match the pattern */
        RegionsManager.regionsData.regionById.forEach((region, _regionId) => {
          if (region.nameupper?.includes(patternupper) || region.abbupper?.includes(patternupper)) {
            RegionsManager.status.highlighted.add(region.abb);
          }
        });
        /** filtered region needed in the tree to display the highlighted ones */
        RegionsManager.status.highlighted.forEach((highId) => {
          //TODO optimize: iterate from leaf to root, stop as soon as a region is already filtered cos its ancestor are also
          if (RegionsManager.regionsData?.regionById.has(highId)) {
            RegionsManager.regionsData?.regionById?.get(highId)?.trail?.forEach((regionId) => {
              if (!RegionsManager.status.highlighted.has(regionId)) {
                RegionsManager.status.filtered.add(regionId);
              }
            });
          }
        });

        /** reset all node to expanded */
        RegionsManager.regionsData.regionById.forEach((_region, regionId) =>
          RegionsManager.status.expanded.set(regionId, true),
        );

        RegionsManager.isHighlightingOn = true;
      }

      RegionsManager._setLastActionSource(actionGroupId);
      RegionsManager.signalListeners();
    }
  }

  static getHighlightingGrouping() {
    return RegionsManager.status ? RegionsManager.status.highlightedGrouping : null;
  }

  static _higlightByGrouping(actionGroupId: string, scheme: string, active: boolean) {
    if (scheme && active) {
      RegionsManager._unlockHighlighting();
      RegionsManager.status.highlightedGrouping = scheme;
      const regionInGrouping: string[] = [];
      RegionsManager.regionsData.regionById.forEach((region, _regionId) => {
        if (region.groups?.[scheme]) {
          regionInGrouping.push(region.abb);
        }
      });
      RegionsManager._higlightRegionSet(actionGroupId, regionInGrouping, true);
    } else {
      RegionsManager._unlockHighlighting();
      RegionsManager.status.highlightedGrouping = undefined;
      RegionsManager._clearHighlighting(actionGroupId);
      RegionsManager.signalListeners();
    }
  }

  static isAutoHighlightingOn() {
    return RegionsManager.status?.autoHighlightingOn;
  }

  static _toggleAutoHighlighting(actionGroupId: string) {
    RegionsManager.status.autoHighlightingOn = !RegionsManager.status.autoHighlightingOn;
    if (RegionsManager.isAutoHighlightingOn()) {
      RegionsManager._higlightCurrentSliceRegions(actionGroupId);
    } else {
      RegionsManager._unlockHighlighting();
      RegionsManager._clearHighlighting(actionGroupId);
      RegionsManager.signalListeners();
    }
  }

  static _higlightCurrentSliceRegions(actionGroupId: string) {
    RegionsManager._unlockHighlighting();
    RegionsManager._higlightRegionSet(actionGroupId, RegionsManager.status.currentSliceRegions);
    RegionsManager._lockHighlighting();
  }

  static _setCurrentSliceRegions(actionGroupId: string, regions: string[]) {
    if (RegionsManager.status) {
      RegionsManager.status.currentSliceRegions = regions;
      if (RegionsManager.isAutoHighlightingOn()) {
        RegionsManager._higlightCurrentSliceRegions(actionGroupId);
      }
    }
  }

  static _higlightRegionSet(actionGroupId: string, regions: string[], andLock?: boolean) {
    if (!RegionsManager.isHighlightingLocked()) {
      RegionsManager._clearHighlighting(actionGroupId);

      if (regions.length) {
        regions.forEach((highId) => {
          const region = RegionsManager.regionsData.regionById.get(highId);
          if (region) {
            /** add specified regions to highlighted set */
            RegionsManager.status.highlighted.add(highId);

            /** add filtered region needed in the tree to display the highlighted ones */
            if (region.trail) {
              region.trail.forEach((regionId) => {
                if (!RegionsManager.status.highlighted.has(regionId)) {
                  RegionsManager.status.filtered.add(regionId);
                }
              });
            }
          }
        }, RegionsManager);

        /** reset all node to expanded */
        RegionsManager.regionsData.regionById.forEach((_region, regionId) =>
          RegionsManager.status.expanded.set(regionId, true),
        );

        RegionsManager.isHighlightingOn = true;
      }

      RegionsManager._setLastActionSource(actionGroupId);
      if (andLock) {
        RegionsManager._lockHighlighting();
      }
      RegionsManager.signalListeners();
    }
  }
}

/** Facade used to alter status of RegionManager while keeping track of the source of the modifications */
class Actionner {
  actionGroupId: string;
  debouncedHiglightByName: (actionGroupId: string, pattern: string) => void;

  constructor(actionGroupId: string) {
    this.actionGroupId = actionGroupId;
    this.debouncedHiglightByName = debounce(RegionsManager._higlightByName, 300, false).bind(RegionsManager);
  }

  replaceAllSelected(regionIds: string[], includeChildren: boolean = true) {
    RegionsManager._replaceAllSelected(this.actionGroupId, regionIds, includeChildren);
  }

  replaceSelected(regionId: string, includeChildren: boolean) {
    RegionsManager._replaceSelected(this.actionGroupId, regionId, includeChildren);
  }

  addToSelection(regionId: string, includeChildren: boolean) {
    RegionsManager._addToSelection(this.actionGroupId, regionId, includeChildren);
  }

  unSelect(regionId: string, includeChildren: boolean) {
    RegionsManager._unSelect(this.actionGroupId, regionId, includeChildren);
  }
  unSelectAll() {
    RegionsManager._unSelectAll(this.actionGroupId);
  }

  setExpanded(regionId: string, expanded: boolean) {
    if (RegionsManager.isReady()) {
      RegionsManager._setExpanded(this.actionGroupId, regionId, expanded);
    }
  }

  toogleExpanded(regionId: string) {
    if (RegionsManager.isReady()) {
      RegionsManager._toogleExpanded(this.actionGroupId, regionId);
    }
  }

  toogleExpandedAllFrom(regionId: string) {
    if (RegionsManager.isReady()) {
      RegionsManager._expandCollapseAllFrom(this.actionGroupId, regionId, !RegionsManager.isExpanded(regionId));
    }
  }

  expandCollapseAllFrom(regionId: string, expanded: boolean) {
    if (RegionsManager.isReady()) {
      RegionsManager._expandCollapseAllFrom(this.actionGroupId, regionId, expanded);
    }
  }

  lockHighlighting() {
    if (RegionsManager.isReady()) {
      RegionsManager._lockHighlighting();
    }
  }

  unlockHighlighting() {
    if (RegionsManager.isReady()) {
      RegionsManager._unlockHighlighting();
    }
  }

  higlightByName(pattern: string) {
    if (RegionsManager.isReady()) {
      // even though actual process is debounced, change of Actionner must be recorded immediately
      RegionsManager._setLastActionSource(this.actionGroupId);
      this.debouncedHiglightByName(this.actionGroupId, pattern);
    }
  }

  higlightByGrouping(scheme: string, active: boolean) {
    if (RegionsManager.isReady()) {
      RegionsManager._higlightByGrouping(this.actionGroupId, scheme, active);
    }
  }

  toggleAutoHighlighting() {
    if (RegionsManager.isReady()) {
      RegionsManager._toggleAutoHighlighting(this.actionGroupId);
    }
  }

  higlightRegions(regionSet: string[]) {
    if (RegionsManager.isReady()) {
      RegionsManager._higlightRegionSet(this.actionGroupId, regionSet);
    }
  }

  setCurrentSliceRegions(regions: string[]) {
    if (RegionsManager.isReady()) {
      RegionsManager._setCurrentSliceRegions(this.actionGroupId, regions);
    }
  }

  /** non-operation, just to reset the actionGroupId who takes the initiative (e.g. get focus) */
  nop() {
    RegionsManager._setLastActionSource(this.actionGroupId);
  }

  lastActionInitiatedByOther() {
    if (RegionsManager.isReady()) {
      return RegionsManager.lastActionInitiatedByOther(this.actionGroupId);
    } else {
      return null;
    }
  }
}

export default RegionsManager;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
//Taken from Underscore http://underscorejs.org/#debounce

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce<TArgs extends unknown[], TResult>(
  func: (...args: TArgs) => TResult,
  wait: number,
  immediate: boolean,
) {
  let timeout: NodeJS.Timeout | null = null;
  return function (this: unknown, ...args: TArgs) {
    const later = () => {
      timeout = null;
      if (!immediate) {
        func.apply(this, args);
      }
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) {
      func.apply(this, args);
    }
  };
}
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
