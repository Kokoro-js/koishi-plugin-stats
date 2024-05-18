import { QueryResult } from "./query/types";

export function autoFormatDataToSeries(
  data: QueryResult,
  startTime: number,
  endTime: number,
  step: number,
) {
  const timePoints = [];
  for (let time = startTime; time <= endTime; time += step * 1000) {
    timePoints.push(time);
  }

  return data.result.map((item) => {
    const valuesMap = new Map(
      item.values.map((value) => [value[0] * 1000, parseFloat(value[1])]),
    );

    const filledValues = timePoints.map((time) => [
      time,
      valuesMap.get(time) || 0,
    ]);

    return {
      name: `${item.metric.guildId}`,
      type: "line",
      data: filledValues,
    };
  });
}

export function generateChartOptions(
  data: QueryResult,
  name: string,
  startTime: number,
  endTime: number,
  step: number,
) {
  return {
    title: {
      text: name,
    },
    tooltip: {
      trigger: "axis",
    },
    xAxis: {
      type: "time",
      min: startTime,
      max: endTime,
    },
    yAxis: {
      type: "value",
    },
    series: autoFormatDataToSeries(data, startTime, endTime, step),
  };
}
