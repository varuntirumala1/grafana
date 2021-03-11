import React from 'react';
import { Portal } from '../../Portal/Portal';
import { usePlotContext } from '../context';
import { CursorPlugin } from './CursorPlugin';
import { SeriesTable, SeriesTableRowProps } from '../../Graph/GraphTooltip/SeriesTable';
import {
  DataFrame,
  FieldType,
  formattedValueToString,
  getDisplayProcessor,
  getFieldDisplayName,
  TimeZone,
} from '@grafana/data';
import { TooltipContainer } from '../../Chart/TooltipContainer';
import { TooltipMode } from '../../Chart/Tooltip';
import { useGraphNGContext } from '../../GraphNG/hooks';

interface TooltipPluginProps {
  mode?: TooltipMode;
  timeZone: TimeZone;
  data: DataFrame[];
}

/**
 * @alpha
 */
export const TooltipPlugin: React.FC<TooltipPluginProps> = ({ mode = 'single', timeZone, ...otherProps }) => {
  const pluginId = 'PlotTooltip';
  const plotContext = usePlotContext();
  const graphContext = useGraphNGContext();

  let xField = graphContext.getXAxisField(otherProps.data);
  if (!xField) {
    return null;
  }

  const xFieldFmt = xField.display || getDisplayProcessor({ field: xField, timeZone });

  return (
    <CursorPlugin id={pluginId}>
      {({ focusedSeriesIdx, focusedPointIdx, coords }) => {
        if (!plotContext.getPlotInstance()) {
          return null;
        }
        let tooltip = null;

        // when no no cursor interaction
        if (focusedPointIdx === null) {
          return null;
        }

        const xVal = xFieldFmt(xField!.values.get(focusedPointIdx)).text;

        // origin field/frame indexes for inspecting the data
        const originFieldIndex = focusedSeriesIdx
          ? graphContext.mapSeriesIndexToDataFrameFieldIndex(focusedSeriesIdx)
          : null;

        // when interacting with a point in single mode
        if (mode === 'single' && originFieldIndex !== null) {
          const field = otherProps.data[originFieldIndex.frameIndex].fields[originFieldIndex.fieldIndex];
          const plotSeries = plotContext.getSeries();

          const fieldFmt = field.display || getDisplayProcessor({ field, timeZone });
          tooltip = (
            <SeriesTable
              series={[
                {
                  // TODO: align with uPlot typings
                  color: (plotSeries[focusedSeriesIdx!].stroke as any)(),
                  label: getFieldDisplayName(field, otherProps.data[originFieldIndex.frameIndex]),
                  value: fieldFmt(field.values.get(focusedPointIdx)).text,
                },
              ]}
              timestamp={xVal}
            />
          );
        }

        if (mode === 'multi') {
          const plotSeries = plotContext.getSeries();

          let series: SeriesTableRowProps[] = [];

          let frames = otherProps.data;

          for (let i = 0; i < frames.length; i++) {
            let fields = frames[i].fields;

            for (let j = 0; j < fields.length; j++) {
              let f = fields[j];

              // skipping xField, time fields, non-numeric, and hidden fields
              if (
                f === xField ||
                f.type === FieldType.time ||
                f.type !== FieldType.number ||
                f.config.custom?.hideFrom?.tooltip
              ) {
                continue;
              }

              series.push({
                // TODO: align with uPlot typings
                color: (plotSeries[j].stroke as any)!(),
                label: getFieldDisplayName(f, otherProps.data[i]),
                value: formattedValueToString(f.display!(f.values.get(focusedPointIdx!))),
                isActive: originFieldIndex
                  ? originFieldIndex.frameIndex === i && originFieldIndex.fieldIndex === j
                  : false,
              });
            }
          }

          tooltip = <SeriesTable series={series} timestamp={xVal} />;
        }

        if (!tooltip) {
          return null;
        }

        return (
          <Portal>
            <TooltipContainer position={{ x: coords.viewport.x, y: coords.viewport.y }} offset={{ x: 10, y: 10 }}>
              {tooltip}
            </TooltipContainer>
          </Portal>
        );
      }}
    </CursorPlugin>
  );
};
