import * as React from "react";

import {
  PopoverNext,
  PopoverInteractionKind,
  Position,
  popoverPositionToNextPlacement,
} from "@blueprintjs/core";

import { createBrowserHistory } from 'history';

import { Pane, SplitPane } from 'react-split-pane';

const RegionTreePanel = React.lazy(() => import('./RegionTreePanel'));
import ViewerComposed from './ViewerComposed';
import { DrawerHandle, CollapseDirection } from './Drawer';
import ZAVConfig from '../ZAVConfig';

import RegionsManager, { IRegionsStatus, IRegionsPayload, } from '../RegionsManager';
import ViewerManager from '../ViewerManager';

import { IROIsPayload, RoiInfos } from "../RoiInfo";

import Utils from '../Utils';
import UserSettings from '../UserSettings';

import axios from 'axios';
import { isNotFoundError } from '../common/http';

import "./App.scss";
import "./Themes.scss";

import { TourContext } from "./GuidedTour"

import {
  FocusStyleManager,
} from "@blueprintjs/core";

FocusStyleManager.onlyShowFocusOnTabs();

const publicBaseUrl = import.meta.env.BASE_URL;


const history = createBrowserHistory();
const defaultSplitSize = 350;

type AppProps = {
  configId?: string,
  dataSrc?: string,
  dataVersionTag?: string,
  initConfig?: {},
}

/** Main component of the ZAViewer */
const App = (props: AppProps) => {

  const needsExtraInit = React.useRef(true);

  const [config, setConfig] = React.useState(undefined);
  //display region panel expanded if any region selection specified
  const [isRegPanelExpanded, setIsRegPanelExpanded] = React.useState(props?.initConfig?.rs);
  const [splitSize, setSplitSize] = React.useState(defaultSplitSize);

  const [regionsStatus, setRegionsStatus] = React.useState<IRegionsStatus | undefined>(undefined);

  const loadAndInitRegionsTree = (treeDataUrl: string, hasBackend: boolean, hasMultiPlanes: boolean, preselected: string[] | undefined) => {
    axios({
      method: hasBackend ? "POST" : "GET",
      url: treeDataUrl,
    })

      .then(response => {
        const payload: IRegionsPayload = response.data;

        //retrieve region data asynchronously...
        RegionsManager.init(
          payload,
          (newRegionsStatus) => {
            if (needsExtraInit.current && preselected) {

              //Perform the focus on selected region center only once
              needsExtraInit.current = false;

              //Try to switch to center slice of (last) selected region
              const selectedRegion = RegionsManager.getLastSelected()
              if (selectedRegion) {

                const centerSlice = RegionsManager.getRegionCenterSlice(selectedRegion, hasMultiPlanes, ViewerManager.getActivePlane());
                if (typeof centerSlice != 'undefined') {
                  ViewerManager.goToSlice(centerSlice);
                }
                //display at least regions' border, and labels
                if (!ViewerManager.isShowingRegions()) {
                  ViewerManager.setBorderDisplay(true);
                }
                ViewerManager.setLabelDisplay(true);
              }
            }

            //... and update state after region data change
            setRegionsStatus(newRegionsStatus);

          },
          preselected
        );

      })
      .catch(error => {
        // handle error
        console.error(error);
      });

  };

  const resetRegionsTree = (someConfig?, preselected?: string[]) => {
    const usedConfig = someConfig || config;
    //load regions related data
    const treeDataUrl = usedConfig.getTreeDataUrl();
    loadAndInitRegionsTree(treeDataUrl, usedConfig.hasBackend, usedConfig.hasMultiPlanes, preselected);
  }


  React.useEffect(() => {

    //retrieve config asynchronously...
    ZAVConfig.getConfig(props.configId, props.dataSrc, props.dataVersionTag, (newConfig) => {
      console.info("[ZAV debug] Config loaded", {
        configId: props.configId,
        dataSrc: props.dataSrc,
        dataVersionTag: props.dataVersionTag,
        hasBackend: newConfig?.hasBackend,
        hasCOSource: newConfig?.hasCOSource,
        hasMultiPlanes: newConfig?.hasMultiPlanes,
        firstActivePlane: newConfig?.firstActivePlane,
        slideCounts: {
          axial: newConfig?.axialSlideCount,
          coronal: newConfig?.coronalSlideCount,
          sagittal: newConfig?.sagittalSlideCount,
          total: newConfig?.getTotalSlidesCount?.(),
        },
        publishPath: newConfig?.PUBLISH_PATH,
        iipServerPath: newConfig?.IIPSERVER_PATH,
        volumeUrl: newConfig?.volumeUrl,
        layers: Object.keys(newConfig?.layers || {}),
      });

      setConfig(newConfig);

      //preselected regions (specified on opening URL)
      const preselected = (props?.initConfig?.rs) ? String(props?.initConfig?.rs).split(',') : undefined;
      resetRegionsTree(newConfig, preselected);

      //load regions of interest related data
      const roiInfoUrl = Utils.makePath(
        newConfig.PUBLISH_PATH, newConfig.svgFolerName,
        "rois.json" + (newConfig.dataVersionTag ? newConfig.dataVersionTag : ''))

      axios.request<IROIsPayload>({
        method: "GET",
        url: roiInfoUrl,
      })
        .then(response => {
          RoiInfos.init(response.data);
          if (UserSettings.getBoolItem(UserSettings.SettingsKeys.ShowOverlayROI, null) == null) {
            ViewerManager.setROIDisplay(response.data.displayRoi);
          }
        })
        .catch(error => {
          if (!isNotFoundError(error)) {
            console.error(error);
          }
        });


    });

  }, [props.configId, props.dataSrc]);


  //
  const currentTourStep = React.useContext(TourContext).stepContext?.currentStep;
  const isRegionPanelExpanded = ['_init_', 'mainImagePanel'].includes(currentTourStep)
    ? false
    : currentTourStep === 'expandedRegionPanel'
      ? true
      : isRegPanelExpanded;

  const containerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div
      className="App"
      ref={containerRef}
    >
      <SplitPane
        direction="horizontal"
        onResize={([primaryPaneSize]) => {
          if (isRegionPanelExpanded) {
            setSplitSize(primaryPaneSize)
          }
        }}
      >
        <Pane size={isRegionPanelExpanded ? splitSize : 0} defaultSize={defaultSplitSize}>
          <div className="secondaryRegionTreePane" style={{ height: "100%", overflow: "hidden" }}>
            <div id="zav_logoPlaceHolder">
              <div id="zav_logoContainer">
                <div>
                  <a id="bm_logo" href="https://dataportal.brainminds.jp/" title="Click to go to Brain/MINDS dataportal">
                    <img src={`${publicBaseUrl}img/brain-minds_borderlogo.svg`} height={32} />
                  </a>
                </div>
                <div><img id="zav_logo" src={`${publicBaseUrl}img/logo.png`} height={23} draggable="false" /></div>
                <div style={{ verticalAlign: 'bottom' }}>
                  <div id="zav_BrandingPlaceHolder" style={{ maxWidth: 280, height: 32, overflow: 'clip' }}>
                  </div>
                </div>
              </div>
            </div>
            <div id="zav_licensecontainer">
              {config?.extra?.termsOfUse ?
                <div><a href={config?.extra?.termsOfUse} target="_blank">
                  <span className="zav_miscLinks">terms of use</span>
                </a></div>
                :
                null
              }
              <PopoverNext
                interactionKind={PopoverInteractionKind.CLICK}
                hasBackdrop={true}
                placement={popoverPositionToNextPlacement(Position.BOTTOM_RIGHT)}
                shouldReturnFocusOnClose={false}
                content={
                  <div style={{ width: '40vw', padding: 20, }}>
                    <h2>Licenses</h2>
                    <p>
                      ZAViewer (this webapp) is licensed under the <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank">Apache License, Version 2.0</a>
                    </p>
                    <br />
                    <p>
                      This software contains code derived from <a href="http://openseadragon.github.io" target="_blank">Openseadragon</a> v2.4.2 released under the New BSD license.
                    </p>
                    {config?.extra?.hasIIPserver ?
                      <p>
                        Brain images are served by <a href="https://iipimage.sourceforge.io/" target="_blank">IIPImage server</a>, licensed under version 3 of the GNU General Public License.
                      </p>
                      :
                      null
                    }
                  </div>
                }
              >
                <div><span className="zav_miscLinks">licenses</span></div>
              </PopoverNext>
            </div>

            {
              RegionsManager.isReady()
                ? <React.Suspense fallback={<div>Loading...</div>} >
                  <RegionTreePanel regionsStatus={regionsStatus} hasMultiPlanes={config?.hasMultiPlanes} />
                </React.Suspense>
                : null
            }
          </div>
        </Pane>
        <Pane>
          <div className="primaryViewerPane" style={{ height: "100%" }}>
            {
              RegionsManager.isReady()
                ? <DrawerHandle
                  collapseDirection={CollapseDirection.LEFT}
                  isExpanded={isRegionPanelExpanded}
                  onClick={() => setIsRegPanelExpanded(!isRegionPanelExpanded)}
                />
                : null
            }

            <div style={{ position: "absolute", left: 13, width: "calc( 100% - 13px )", height: "100%" }}>
              <ViewerComposed
                containerRef={containerRef}
                config={config}
                regionsStatus={regionsStatus}
                resetRegionsTree={resetRegionsTree}
                history={history}
              />
            </div>
          </div>
        </Pane>
      </SplitPane>
    </div >
  );

};

export default App;
