import { Icon } from '@blueprintjs/core';
import * as React from 'react';

import './Drawer.scss';

export enum CollapseDirection {
  LEFT = 'left',
  RIGHT = 'right',
}

type DrawerHandleProps = {
  collapseDirection: CollapseDirection;
  isExpanded: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement> | undefined;
};

export const DrawerHandle = (props: DrawerHandleProps) => {
  const pointToRight = props.collapseDirection === CollapseDirection.RIGHT ? props.isExpanded : !props.isExpanded;
  return (
    <button type="button" className="zav-Drawer_handle" onClick={props.onClick} aria-label="Toggle drawer">
      <Icon icon={pointToRight ? 'caret-right' : 'caret-left'} iconSize={22} />
    </button>
  );
};

type DrawerProps = {
  id: string;
  collapseDirection: CollapseDirection;
  initExpanded: boolean;
  forceExpanded?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement> | undefined;
  onExpandCollapse: (isExpanded: boolean) => void;
  quickactions: React.ReactNode;
  children: React.ReactNode;
};

export const Drawer = (props: DrawerProps) => {
  const [isExpanded, setIsExpanded] = React.useState(props.initExpanded);
  const [scrollTop, setScrollTop] = React.useState(0);
  const scrollContRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!(props.forceExpanded === undefined)) {
      setIsExpanded(props.forceExpanded);
    }
  }, [props.forceExpanded]);

  let [moreUp, moreDown] = [false, false];
  if (scrollContRef.current) {
    const hiddenHeight = scrollContRef.current.scrollHeight - scrollContRef.current.clientHeight;
    moreDown = Math.abs(hiddenHeight - scrollTop) > 1;
    moreUp = hiddenHeight > 0 && Math.abs(scrollTop) > 1;
  }

  return (
    <div id={props.id} className="zav-Drawer" data-isexpanded={isExpanded}>
      <DrawerHandle
        collapseDirection={CollapseDirection.RIGHT}
        isExpanded={isExpanded}
        onClick={() => {
          setIsExpanded(!isExpanded);
          props.onExpandCollapse?.(!isExpanded);
        }}
      />
      <div className="zav-Drawer_collapsedCont">{props.quickactions}</div>
      <div
        ref={scrollContRef}
        className={
          'zav-Drawer_expandedCont' +
          (moreUp && moreDown ? ' zav-moreBoth' : (moreUp ? ' zav-moreUp' : '') + (moreDown ? ' zav-moreDown' : ''))
        }
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div className="zav-Drawer_expandedContWrapper">{props.children}</div>
      </div>
    </div>
  );
};

export default Drawer;
