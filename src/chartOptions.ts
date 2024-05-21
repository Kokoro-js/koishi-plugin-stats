import { QueryResult } from "./query/types";

// 二分查找函数，寻找最接近target的元素索引
function binarySearchClosest(arr: number[][], target: number): number {
  let low = 0;
  let high = arr.length - 1;
  if (arr.length === 0) return -1; // 空数组处理
  if (target < arr[low][0]) return low; // 目标小于最小元素
  if (target > arr[high][0]) return high; // 目标大于最大元素

  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    if (arr[mid][0] === target) {
      return mid;
    } else if (arr[mid][0] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  // 如果没有找到精确匹配的，返回最接近的较小值
  return arr[low][0] - target < target - arr[high][0] ? low : high;
}

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

  const maxAllowedDifference = (step * 1000) / 2;

  return data.result.map((item) => {
    const values = item.values.map(([timestamp, value]) => [
      timestamp * 1000,
      parseFloat(value),
    ]);
    // 确保数据按时间戳排序
    values.sort((a, b) => a[0] - b[0]);

    const filledValues = timePoints.map((time) => {
      const closestIndex = binarySearchClosest(values, time);
      const closest = values[closestIndex];
      const minDifference = Math.abs(closest[0] - time);

      return [
        time,
        minDifference <= maxAllowedDifference ? Math.round(closest[1]) : 0,
      ];
    });

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
    backgroundColor: "white",
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
