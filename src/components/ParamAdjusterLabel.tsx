import {
  Icon,
  PopoverInteractionKind,
  PopoverNext,
  Position,
  popoverPositionToNextPlacement,
  Slider,
} from '@blueprintjs/core';
import type React from 'react';

import './ParamAdjusterLabel.scss';

type ParamAdjusterLabelProps = {
  icon?: React.ComponentProps<typeof Icon>['icon'] | React.ReactNode;
  label: React.ReactNode;
  min: number;
  max: number;
  stepSize: number;
  onChange: (value: number) => void;
  value: number;
  defaultValue?: number;
  labelRenderer?: (value: number) => string | JSX.Element;
  enabled?: boolean;
  noAdjust?: boolean;
};

const ParamAdjusterLabel = (props: ParamAdjusterLabelProps) => {
  const icon =
    typeof props.icon === 'string' ? (
      <Icon icon={props.icon as React.ComponentProps<typeof Icon>['icon']} style={{ marginRight: 10 }} />
    ) : (
      props.icon
    );

  const renderedValue: React.ReactNode = props.labelRenderer ? props.labelRenderer(props.value) : props.value;
  const adjLabel = (
    <span className="zav-AdjusterLabel" data-disabled={!props.enabled}>
      {icon}
      {renderedValue}
    </span>
  );

  const handleClickDown = () => {
    const newVal = props.value - props.stepSize;
    if (newVal >= props.min) {
      props.onChange(newVal);
    }
  };

  const handleClickUp = () => {
    const newVal = props.value + props.stepSize;
    if (newVal <= props.max) {
      props.onChange(newVal);
    }
  };

  const defaultValue = props.defaultValue;
  const resetEnabled = typeof defaultValue !== 'undefined' && defaultValue !== props.value;
  return props.enabled && !props.noAdjust ? (
    <PopoverNext
      interactionKind={PopoverInteractionKind.HOVER}
      placement={popoverPositionToNextPlacement(Position.BOTTOM_RIGHT)}
      rootBoundary="viewport"
      content={
        <div style={{ padding: '12px 6px 0 6px' }}>
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
            <span>
              {icon}
              {props.label}
            </span>
            {typeof props.defaultValue !== 'undefined' ? (
              <span title={'click to reset to default value'}>
                <button
                  type="button"
                  style={{
                    marginLeft: 10,
                    color: resetEnabled ? undefined : 'silver',
                    cursor: resetEnabled ? 'pointer' : 'default',
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                  }}
                  onClick={
                    resetEnabled && typeof defaultValue !== 'undefined' ? () => props.onChange(defaultValue) : undefined
                  }
                >
                  ↺
                </button>
              </span>
            ) : null}
          </div>
          <div style={{ padding: 10 }}>
            <Icon
              icon="chevron-left"
              title="go to previous slice"
              style={{ paddingRight: 10, verticalAlign: 'top' }}
              onClick={handleClickDown}
            />
            <Slider
              className="zav-Slider zav-OpacitySlider"
              min={props.min}
              max={props.max}
              stepSize={props.stepSize}
              labelStepSize={props.max}
              onChange={props.onChange}
              value={props.value}
              showTrackFill={false}
              labelRenderer={props.labelRenderer ? (value) => props.labelRenderer?.(value) ?? String(value) : undefined}
              disabled={!props.enabled}
            />
            <Icon
              icon="chevron-right"
              title="go to next slice"
              style={{ paddingLeft: 10, verticalAlign: 'top' }}
              onClick={handleClickUp}
            />
          </div>
        </div>
      }
    >
      {adjLabel}
    </PopoverNext>
  ) : (
    adjLabel
  );
};

export default ParamAdjusterLabel;
