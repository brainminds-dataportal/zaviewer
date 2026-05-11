import {
  Icon,
  PopoverInteractionKind,
  PopoverNext,
  Position,
  popoverPositionToNextPlacement,
  Slider,
} from '@blueprintjs/core';
import React from 'react';

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

class ParamAdjusterLabel extends React.Component<ParamAdjusterLabelProps> {
  render() {
    const icon =
      typeof this.props.icon === 'string' ? (
        <Icon icon={this.props.icon as React.ComponentProps<typeof Icon>['icon']} style={{ marginRight: 10 }} />
      ) : (
        this.props.icon
      );

    const renderedValue: React.ReactNode = this.props.labelRenderer
      ? this.props.labelRenderer(this.props.value)
      : this.props.value;
    const adjLabel = (
      <span className="zav-AdjusterLabel" data-disabled={!this.props.enabled}>
        {icon}
        {renderedValue}
      </span>
    );

    const defaultValue = this.props.defaultValue;
    const resetEnabled = typeof defaultValue !== 'undefined' && defaultValue !== this.props.value;
    return this.props.enabled && !this.props.noAdjust ? (
      <PopoverNext
        interactionKind={PopoverInteractionKind.HOVER}
        placement={popoverPositionToNextPlacement(Position.BOTTOM_RIGHT)}
        rootBoundary="viewport"
        content={
          <div style={{ padding: '12px 6px 0 6px' }}>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
              <span>
                {icon}
                {this.props.label}
              </span>
              {typeof this.props.defaultValue !== 'undefined' ? (
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
                      resetEnabled && typeof defaultValue !== 'undefined'
                        ? () => this.props.onChange(defaultValue)
                        : undefined
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
                onClick={this.handleClickDown.bind(this)}
              />
              <Slider
                className="zav-Slider zav-OpacitySlider"
                min={this.props.min}
                max={this.props.max}
                stepSize={this.props.stepSize}
                labelStepSize={this.props.max}
                onChange={this.props.onChange}
                value={this.props.value}
                showTrackFill={false}
                labelRenderer={
                  this.props.labelRenderer ? (value) => this.props.labelRenderer?.(value) ?? String(value) : undefined
                }
                disabled={!this.props.enabled}
              />
              <Icon
                icon="chevron-right"
                title="go to next slice"
                style={{ paddingLeft: 10, verticalAlign: 'top' }}
                onClick={this.handleClickUp.bind(this)}
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
  }

  handleClickDown() {
    const newVal = this.props.value - this.props.stepSize;
    if (newVal >= this.props.min) {
      this.props.onChange(newVal);
    }
  }

  handleClickUp() {
    const newVal = this.props.value + this.props.stepSize;
    if (newVal <= this.props.max) {
      this.props.onChange(newVal);
    }
  }
}

export default ParamAdjusterLabel;
