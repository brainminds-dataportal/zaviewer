import { Menu, MenuDivider, MenuItem } from '@blueprintjs/core';
import { type Middleware, offset } from '@floating-ui/react';
import * as React from 'react';
import { ACTIONS, type ButtonType, EVENTS, type EventData, Joyride, STATUS, type Step } from 'react-joyride';

import './GuidedTour.scss';

const TOUR_OVERLAY_COLOR = 'rgba(68, 82, 155, 0.50)';
const TOUR_VIEWPORT_PADDING = 24;
const TOUR_BUTTONS: ButtonType[] = ['back', 'close', 'primary', 'skip'];
const TOUR_PROGRESS_LABEL = 'Next ({current} of {total})';
const TOUR_MAX_WIDTH = `calc(100vw - ${TOUR_VIEWPORT_PADDING * 2}px)`;

const getClampedTooltipWidth = (width: number | string) =>
  typeof width === 'number' ? `min(${width}px, ${TOUR_MAX_WIDTH})` : `min(${width}, ${TOUR_MAX_WIDTH})`;

const createTooltipStyles = (width: number | string): Step['styles'] => ({
  tooltip: {
    width: getClampedTooltipWidth(width),
  },
});

const GuideStepStyles = {
  overview: createTooltipStyles('40vw'),
  medium: createTooltipStyles(500),
  large: createTooltipStyles(600),
  extraLarge: createTooltipStyles(700),
};

const GuidedStepOffsetAdjustment: (factor: number) => Middleware = (factor) => {
  return {
    name: 'guidedStepOffsetAdjustment',
    options: {},
    fn: (state) => {
      // adjust vertical offset to better position the tooltip in the center of the screen, since the target is the whole viewer and not a specific element
      const { height } = state.elements.reference.getBoundingClientRect();
      const ret = offset(-height / factor);
      return ret.fn(state);
    },
  };
};

const SharedTourStyles: Step['styles'] = {
  floater: {
    maxWidth: TOUR_MAX_WIDTH,
  },
  tooltip: {
    maxWidth: TOUR_MAX_WIDTH,
  },
  buttonPrimary: {
    backgroundColor: '#ff0044',
    borderRadius: 4,
  },
  buttonBack: {
    color: '#ff0044',
  },
};

const OwerviewTourSteps: ExtendedStep[] = [
  {
    stepContext: '_init_',
    target: '.App',
    skipBeacon: true,
    offset: 50,
    title: 'ZAViewer - Zooming Atlas Viewer',
    content: (
      <div className="zav_guideContent">
        <p>
          ZAViewer is a web-based 2D high-resolution image viewer that was designed to explore data produced for the
          marmoset brain in the Brain/MINDS project.
        </p>
        <p>
          This viewer allows the user to browse large images of brain slices in the standard orthogonal anatomical views
          (Axial, Coronal, Sagittal depending on the data provided).
          <br />
          Each slice view may contains several raster images layers with atlas regions overlaid on top of them.
        </p>
        <br />
        <p>
          Click <span className="zav_keyboardkey">Next</span> to follow a quick guided tour of the viewer's main
          features!
        </p>
      </div>
    ),
    placement: 'center',
    styles: GuideStepStyles.overview,
  },

  {
    stepContext: 'mainImagePanel',
    target: '#svgDelineationOverlay',
    skipBeacon: true,
    title: 'Deeply zoomable high resolution images',
    content: (
      <div className="zav_guideContent">
        <p>
          By default, the zoomable brain image shown in the center uses most of the screen space, with both side panels
          collapsed on the left and right.
        </p>
      </div>
    ),
    placement: 'bottom',
    styles: GuideStepStyles.medium,
    floatingOptions: {
      middleware: [GuidedStepOffsetAdjustment(3)],
    },
  },

  {
    stepContext: 'collapsedControlPanel',
    target: '#ZAV-rightPanel>.zav-Drawer_collapsedCont',
    skipBeacon: true,
    title: 'Quick navigation buttons',
    content: (
      <div className="zav_guideContent">
        <p>
          When the right panel is collapsed, a minimal set of buttons allows the user to quickly change the viewed slice
          along the current axis
        </p>
      </div>
    ),
    placement: 'left-start',
    styles: GuideStepStyles.medium,
  },

  {
    stepContext: 'collapsedControlPanel',
    target: '#ZAV-rightPanel>.zav-Drawer_handle',
    skipBeacon: true,
    title: 'Collapsible main control panel',
    content: (
      <div className="zav_guideContent">
        <p>Clicking on the vertical bar on the right triggers the opening/closing of the detailed control panel...</p>
      </div>
    ),
    placement: 'left',
    styles: GuideStepStyles.medium,
  },

  {
    stepContext: 'expandedControlPanel',
    target: '#ZAV-rightPanel .zav-Drawer_expandedContWrapper',
    skipBeacon: true,
    title: 'Main control panel',
    content: (
      <div className="zav_guideContent">
        <p>
          When the right panel is expanded, a wide range of controls are available for managing the visibility of layers
          and overlays, navigate the slices, change axis, and others...
        </p>
      </div>
    ),
    placement: 'left',
    styles: GuideStepStyles.medium,
  },

  {
    stepContext: 'collapsedRegionPanel',
    target: '.primaryViewerPane>.zav-Drawer_handle',
    skipBeacon: true,
    title: 'Collapsible region panel',
    content: (
      <div className="zav_guideContent">
        <p>Clicking on the vertical bar on the left triggers the opening/closing of the region panel.</p>
      </div>
    ),
    placement: 'right',
    styles: GuideStepStyles.medium,
  },

  {
    stepContext: 'expandedRegionPanel',
    target: '.secondaryRegionTreePane',
    skipBeacon: true,
    title: 'Region panel',
    content: (
      <div className="zav_guideContent">
        <p>
          This panel allows to select brain region(s) by navigating in the hierarchical representation of the Atlas
          brain regions or by performing simple text search of region name.
        </p>
      </div>
    ),
    placement: 'right',
    styles: GuideStepStyles.medium,
  },
];

const NavigationTourSteps: ExtendedStep[] = [
  {
    stepContext: 'mainImagePanel',
    target: '#svgDelineationOverlay',
    skipBeacon: true,
    title: 'Deeply zoomable high resolution image',
    content: (
      <div className="zav_guideContent">
        <p>The brain slice images can be deeply zoomed-in to explore their fine details.</p>
        <ul>
          <li>
            Zoom in and out using the mouse wheel,
            <br />
            or zoom gestures on a notebook touchpad,
            <br />
            (or <span className="zav_keyboardkey">Shift</span>+<span className="zav_keyboardkey">↑</span> and{' '}
            <span className="zav_keyboardkey">Shift</span>+<span className="zav_keyboardkey">↓</span> on the keyboard)
          </li>
          <li>
            Scroll the image using click and drag gestures,
            <br />
            (or keyboard's arrows : <span className="zav_keyboardkey">←</span>{' '}
            <span className="zav_keyboardkey">↑</span> <span className="zav_keyboardkey">→</span>{' '}
            <span className="zav_keyboardkey">↓</span>)
          </li>
          <li>
            Go to to next or previous slice using <span className="zav_keyboardkey">Ctrl</span>+
            <span className="zav_keyboardkey">→</span> or <span className="zav_keyboardkey">Ctrl</span>+
            <span className="zav_keyboardkey">←</span> respectively
            <br />
            (or <span className="zav_keyboardkey">Command</span>+<span className="zav_keyboardkey">→</span> or{' '}
            <span className="zav_keyboardkey">Command</span>+<span className="zav_keyboardkey">←</span> on MacOS)
          </li>
        </ul>
      </div>
    ),
    placement: 'bottom',
    styles: GuideStepStyles.large,
    floatingOptions: {
      middleware: [GuidedStepOffsetAdjustment(2)],
    },
  },

  {
    stepContext: 'collapsedControlPanel',
    target: '.zav-QuickActionPanel .zav-QuickNavButtons',
    skipBeacon: true,
    title: 'Quick navigation buttons',
    content: (
      <div className="zav_guideContent">
        <p>Change the viewed slice by clicking these buttons to navigate along the active axis.</p>
        <p>Current position and zoom factor are preserved when changing slices.</p>
      </div>
    ),
    placement: 'left-start',
    styles: GuideStepStyles.large,
  },

  {
    stepContext: 'collapsedControlPanel',
    target: '.zav-QuickActionPanel .zav-QuickToogleDelineationButton',
    skipBeacon: true,
    content: (
      <div className="zav_guideContent">
        <p>This switch allows to toggle Atlas region overlay visibility.</p>
      </div>
    ),
    placement: 'left',
  },

  {
    stepContext: 'expandedControlPanel',
    target: '#ZAV-rightPanel .zav-controlPanel_Layers',
    skipBeacon: true,
    title: 'Layers control',
    content: (
      <div className="zav_guideContent">
        <p>This sub-panel displays the layer stack, with the foreground layer at the top.</p>
        <p>
          <br />
          Below the layer's name, a visibility switch and an opacity slider allow to control the corresponding layer.
          <br />
          Also, contrast and gamma correction can be performed independently for each layers
        </p>
      </div>
    ),
    placement: 'left',
    styles: GuideStepStyles.medium,
  },

  {
    stepContext: 'expandedControlPanel',
    target: '#ZAV-rightPanel .zav-controlPanel_Regions',
    skipBeacon: true,
    title: 'Atlas regions control',
    content: (
      <div className="zav_guideContent">
        <p>
          Use this sub-panel to control Atlas regions which are represented by colored shapes overlaid on top of slice
          images.
        </p>
        <p>
          <br />
          Region areas and borders can be independently hidden thanks to these switches, and areas opacity can be finely
          adjusted.
        </p>
      </div>
    ),
    placement: 'left',
    styles: GuideStepStyles.medium,
  },

  {
    stepContext: 'navigatorPanel',
    target: '#ZAV-rightPanel .zav-controlPanel_Navigator',
    skipBeacon: true,
    title: 'Global view',
    content: (
      <div className="zav_guideContent">
        <p>
          This thumbnail displays a global view of the slice image. When zoomed-in, a red bordered rectangle is drawn to
          figure which portion of the image is currently displayed on screen.
        </p>
        <p>
          <br />
          Dragging the rectangle is another convenient way to scroll the image.
        </p>
      </div>
    ),
    placement: 'left',
    styles: GuideStepStyles.medium,
  },

  {
    stepContext: 'expandedControlPanel',
    target: '#ZAV-rightPanel .zav-QuickDatasetInfoButton',
    skipBeacon: true,
    content: (
      <div className="zav_guideContent">
        <p>Clicking on this icon will display the detailed dataset's information.</p>
      </div>
    ),
    placement: 'left-start',
  },

  {
    stepContext: 'expandedControlPanel',
    target: '#ZAV-rightPanel .zav-controlPanel_SliceNav',
    skipBeacon: true,
    title: 'Slice navigation',
    content: (
      <div className="zav_guideContent">
        <p>This sub-panel helps to locate the currently displayed brain slice within available slice series.</p>
        <p>
          The active navigation axis (perpendicular to the slice's plane) is indicated, alongside the viewed slice's
          numeric index and the total number of slices in the current ordered set of slices.
          <br />
          Current slice's location is also figured by the position of the slider handle, and by a colored line on top of
          the brain section thumbnail image.
        </p>
        <p>
          <br />
          At any time, there is a single active navigation axis, and if the viewed dataset contains slices along more
          than 1 axis, several brain section thumbnails are shown, with switches on top of them to change the navigation
          axis.
        </p>
        <p>
          Navigating amongst slices can be done in many ways: clicking on the slider track, dragging the slider handle,
          clicking on left and right chevron or clicking on thumbnail brain section image.
        </p>
      </div>
    ),
    placement: 'left',
    styles: GuideStepStyles.extraLarge,
  },
  {
    stepContext: 'expandedControlPanel',
    target: '#ZAV-rightPanel .zav-controlPanel_Distance',
    skipBeacon: true,
    title: 'Distance measurement',
    content: (
      <div className="zav_guideContent">
        <p>This tool is provided to measure distance in physical space units between points on the slice image.</p>

        <p>
          <br />
          Clicking on the button will switch to measurement mode, then:
        </p>
        <ul>
          <li>Mark the first point by clicking on the slice image,</li>
          <li>Choose a second point by clicking again on the image: the distance is then displayed.</li>
          <li>Clicking a third time will reset the ruler to make other measurements.</li>
        </ul>
        <p>Measurement mode is deactivated by clicking the button again.</p>
      </div>
    ),
    placement: 'left',
    styles: GuideStepStyles.medium,
  },
];

const RegionsTourSteps: ExtendedStep[] = [
  {
    stepContext: 'mainImagePanel',
    target: '#svgDelineationOverlay',
    skipBeacon: true,
    title: 'Atlas regions',
    content: (
      <div className="zav_guideContent">
        <p>Atlas regions overlayed on top of slice image are a great help to locate the viewed portion of the slice.</p>
        <p>
          <br />
          The full name of the atlas region located under the mouse cursor is always indicated at the bottom of the
          screen.
          <br />
          Region(s) can be selected by directly clicking on them in the image; then they become outlined by a
          distinctive blue border.
        </p>
      </div>
    ),
    placement: 'bottom',
    styles: GuideStepStyles.extraLarge,
    floatingOptions: {
      middleware: [GuidedStepOffsetAdjustment(2)],
    },
  },

  {
    stepContext: 'expandedRegionPanel',
    target: '.secondaryRegionTreePane .zav-Tree',
    skipBeacon: true,
    title: 'Region panel',
    content: (
      <div className="zav_guideContent">
        <p>And the regions selection is synchronized between the region tree view and the slice image overlay.</p>
        <p>
          <br />
          In the hierarchical representation of the Atlas brain regions, selection is performed by clicking on a
          region's name.
        </p>

        <p>
          To explore the tree, expand/collapse the level below a region by clicking on the +/- square at the left of the
          region name,
          <br />
          (and double-click to fully expand/collapse all levels of the sub-tree).
        </p>
      </div>
    ),
    placement: 'right',
    styles: GuideStepStyles.large,
  },

  {
    stepContext: 'expandedRegionPanel',
    target: '.secondaryRegionTreePane .zav-regions_searchinput ',
    skipBeacon: true,
    title: 'Region search',
    content: (
      <div className="zav_guideContent">
        <p>Quickly find regions by typing their name in this text box.</p>
        <p>
          <br />
          The tree will be pruned to only display regions whose name contains the text pattern (their name will be
          displayed in red, and necessary parent regions in grey).
        </p>
      </div>
    ),
    placement: 'right',
    styles: GuideStepStyles.medium,
  },
];

interface ExtendedStep extends Step {
  stepContext?: string;
}

type ToursMenuProps = {
  setTourSteps: (tourSteps: ExtendedStep[]) => void;
  setGuidedTourOn: (run: boolean) => void;
};

const ToursMenu = (props: ToursMenuProps) => {
  return (
    <Menu>
      <MenuItem
        icon="taxi"
        text="Overview Guided Tour"
        onClick={() => {
          props.setTourSteps(OwerviewTourSteps);
          props.setGuidedTourOn(true);
        }}
      />
      <MenuDivider title="Tours by topics..." />
      <MenuItem
        text="Navigation"
        icon="compass"
        onClick={() => {
          props.setTourSteps(NavigationTourSteps);
          props.setGuidedTourOn(true);
        }}
      />
      <MenuItem
        text="Atlas regions"
        icon="heatmap"
        onClick={() => {
          props.setTourSteps(RegionsTourSteps);
          props.setGuidedTourOn(true);
        }}
      />
    </Menu>
  );
};

type StepTransitionCallback = (stepContext: string) => void;

type TourOperatorProps = {
  children?: React.ReactNode;

  tourSteps: ExtendedStep[];
  tourStepIndex: number | undefined;
  guidedTourOn: boolean;
  setTourStepIndex: (index: number) => void;
  setGuidedTourOn: (run: boolean) => void;

  onUpdateStepContext: StepTransitionCallback;
};

export const TourOperator = (props: TourOperatorProps) => {
  return (
    <Joyride
      steps={props.tourSteps}
      stepIndex={props.tourStepIndex}
      run={props.guidedTourOn}
      continuous={true}
      options={{
        buttons: TOUR_BUTTONS,
        overlayColor: TOUR_OVERLAY_COLOR,
        showProgress: true,
      }}
      locale={{
        nextWithProgress: TOUR_PROGRESS_LABEL,
      }}
      styles={SharedTourStyles}
      floatingOptions={{
        strategy: 'fixed',
        flipOptions: {
          padding: TOUR_VIEWPORT_PADDING,
        },
        shiftOptions: {
          padding: TOUR_VIEWPORT_PADDING,
        },
      }}
      onEvent={(data: EventData, _controls) => {
        const { action, index, status, type } = data;

        //update context with next to come step (works only from second steps onwards, since triggered on STEP_AFTER event)
        if (type === EVENTS.STEP_AFTER) {
          if (props.onUpdateStepContext) {
            //have to use info of the step after to update Tour context

            if (action === ACTIONS.NEXT && props.tourSteps.length > index + 1) {
              const followingExtStep = props.tourSteps[index + 1] as ExtendedStep;
              if (followingExtStep.stepContext) {
                props.onUpdateStepContext(followingExtStep.stepContext);
              }
            } else if (action === ACTIONS.PREV && props.tourSteps.length > index - 1) {
              const followingExtStep = props.tourSteps[index - 1] as ExtendedStep;
              if (followingExtStep.stepContext) {
                props.onUpdateStepContext(followingExtStep.stepContext);
              }
            }
          }
        }

        if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
          // Update state to advance the tour
          props.setTourStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
        }

        //Reset tour if:
        // * it was followed to the end
        // * skip button was clicked
        // * And also when close button was click (to prevent restarting at next step)
        if (
          status === STATUS.FINISHED ||
          status === STATUS.SKIPPED ||
          (type === EVENTS.STEP_AFTER && action === ACTIONS.CLOSE)
        ) {
          //reset from start for next run of the tour
          props.setTourStepIndex(0);
          props.setGuidedTourOn(false);
        }
      }}
    />
  );
};

const deepCloneObject = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

type StepContextValue = {
  currentStep?: string;
};

type TourContextValue = {
  tourMenu?: JSX.Element;
  stepContext: StepContextValue;
};

const EmptyStepContext: StepContextValue = Object.freeze({ currentStep: undefined });
const EmptyTourContext = Object.freeze({
  tourMenu: undefined,
  stepContext: EmptyStepContext,
});
export const TourContext = React.createContext<TourContextValue>(deepCloneObject(EmptyTourContext));

type GuidedTourProps = {
  children?: React.ReactNode;
};

export const GuidedTour = (props: GuidedTourProps) => {
  const [guidedTourOn, setGuidedTourOn] = React.useState(false);
  const [tourSteps, setTourSteps] = React.useState(OwerviewTourSteps);
  const [tourStepIndex, setTourStepIndex] = React.useState(0);

  const [stepContext, setStepContext] = React.useState(deepCloneObject(EmptyStepContext));

  React.useEffect(() => {
    //reset step context when tour ends
    if (!guidedTourOn) {
      setStepContext(deepCloneObject(EmptyStepContext));
    }
  }, [guidedTourOn]);

  const contextValue = {
    tourMenu: (
      <ToursMenu
        setGuidedTourOn={setGuidedTourOn}
        setTourSteps={(tourSteps) => {
          //set first step context
          setStepContext({
            ...deepCloneObject(EmptyStepContext),
            ...{ currentStep: tourSteps[0]?.stepContext },
          });
          setTourSteps(tourSteps);
        }}
      />
    ),
    stepContext: stepContext,
  };

  return (
    <>
      <TourOperator
        tourSteps={tourSteps}
        guidedTourOn={guidedTourOn}
        setGuidedTourOn={setGuidedTourOn}
        tourStepIndex={tourStepIndex}
        setTourStepIndex={setTourStepIndex}
        onUpdateStepContext={(followingStep) => {
          setStepContext((current) => ({ ...current, currentStep: followingStep }));
        }}
      />
      <TourContext.Provider value={contextValue}>{props.children}</TourContext.Provider>
    </>
  );
};
