<template>
  <div>
    <v-chart
      :option="chartOptions"
      style="width: 100%; height: 400px"
    ></v-chart>
  </div>
</template>

<script lang="ts">
import { use } from "echarts/core";
import VChart from "vue-echarts";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from "echarts/components";
import { QueryResult } from "../../src/query/types";
import { generateChartOptions } from "../../src/chartOptions";

// 注册 ECharts 组件
use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
]);

export default {
  components: {
    VChart,
  },
  props: {
    data: {
      type: QueryResult,
      required: true,
    },
    name: { type: String, required: true },
    startTime: {
      type: Number,
      required: true,
    },
    endTime: {
      type: Number,
      required: true,
    },
    step: {
      type: Number,
      required: true,
    },
  },
  computed: {
    chartOptions() {
      const { data, startTime, endTime, name, step } = this;
      return generateChartOptions(data, name, startTime, endTime, step);
    },
  },
};
</script>
