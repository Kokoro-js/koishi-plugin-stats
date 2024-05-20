<template>
  <k-layout>
    <k-card>
      <div class="controls">
        <flat-pickr
          :value="selectedRangeString"
          :config="config"
          @on-change="updateSelectedRange"
        />
        <select v-model="step" class="time-step-select" @change="fetchData">
          <option value="60">1分钟</option>
          <option value="300">5分钟</option>
          <option value="900">15分钟</option>
          <option value="3600">1小时</option>
          <option value="21600">6小时</option>
          <option value="43200">12小时</option>
          <option value="86400">24小时</option>
        </select>
        <input
          v-model="guildId"
          class="guild-id-input"
          placeholder="输入 guildId"
        />
        <button @click="fetchData">获取数据</button>
      </div>
      <k-text>
        <h3>请求URL:</h3>
        <a v-show="isDevelopment" :href="requestUrl" target="_blank">{{
          requestUrl
        }}</a>
        <pre v-show="data">{{
          `数据系数 ${data?.stats?.seriesFetched} | 耗时 ${data?.stats?.executionTimeMsec} ms ${isDevelopment ? "\n" + JSON.stringify(data) : ""}`
        }}</pre>
        <pre v-show="!data">{{ responseData || "未查询到任何数据。" }}</pre>
      </k-text>
    </k-card>
    <k-card>
      <k-text v-if="loading">Loading...</k-text>
      <Chart
        v-else
        name="消息总量(按群组分)"
        :data="data"
        :startTime="startTime"
        :endTime="endTime"
        :step="step"
      />
    </k-card>
  </k-layout>
</template>

<script lang="ts">
import flatPickr from "vue-flatpickr-component";
import "flatpickr/dist/flatpickr.min.css";
import { Mandarin } from "flatpickr/dist/l10n/zh";
import Chart from "./Charts/chart.vue";
import { send } from "@koishijs/client";

export default {
  components: {
    flatPickr,
    Chart,
  },
  data() {
    return {
      isDevelopment: process.env.NODE_ENV === "development",
      data: null,
      startTime: 0,
      endTime: 0,
      guildId: "",
      selectedRangeString: "",
      selectedRange: [],
      requestUrl: "",
      responseData: "",
      step: 900, // 默认15分钟
      loading: true,
      stats: {},
      config: {
        locale: Mandarin,
        mode: "range",
        enableTime: true,
        enableSeconds: true,
        dateFormat: "Y-m-d H:i:S",
        onReady: (selectedDates, dateStr, instance) => {
          instance.calendarContainer.insertAdjacentHTML(
            "beforeend",
            `<div class="flatpickr-shortcuts">
              <button type="button" data-range="0.5">最近 30 分钟</button>
              <button type="button" data-range="1">最近 1 小时</button>
              <button type="button" data-range="6">最近 6 小时</button>
              <button type="button" data-range="24">最近 24 小时</button>
              <button type="button" data-range="72">最近 72 小时</button>
              <button type="button" data-range="168">最近 1 周</button>
            </div>`,
          );
          instance.calendarContainer.addEventListener("click", (event) => {
            if (event.target.tagName === "BUTTON") {
              const range = parseFloat(event.target.dataset.range);
              const end = new Date();
              const start = new Date(end.getTime() - range * 60 * 60 * 1000);
              instance.setDate([start, end], true);
              this.selectedRange = [start, end];
            }
          });
        },
      },
    };
  },
  watch: {
    selectedRange(newValue) {
      if (newValue.length === 2) {
        const [start, end] = newValue;
        this.startTime = start.getTime();
        this.endTime = end.getTime();
        this.fetchData();
      }
    },
  },
  mounted() {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    this.selectedRange = [start, end];
  },
  methods: {
    updateSelectedRange(selectedDates: Date[]) {
      this.selectedRange = selectedDates;
    },
    async fetchData() {
      if (
        this.selectedRange.length !== 2 ||
        !this.selectedRange.every((date) => date instanceof Date)
      ) {
        alert("请选择有效的时间范围！");
        return;
      }

      const query = `count(message_length${this.guildId ? `{guildId="${this.guildId}"}` : ""}) by (guildId)`;
      this.loading = true;
      this.requestUrl = `http://localhost:8428/api/v1/query_range?query=${encodeURIComponent(query)}&start=${this.startTime}&end=${this.endTime}&step=${this.step}`;
      try {
        const data = await send(
          "rangeQuery",
          query,
          this.startTime,
          this.endTime,
          this.step,
        );
        this.data = { ...data }; // 复制对象，以确保响应式更新
        if (data.result.length === 0) {
          this.data.result = []; // 赋值为空数组，而不是 null
        }
        this.responseData = JSON.stringify(data, null, 2);
      } catch (error) {
        console.error("Error fetching data:", error);
        this.responseData = `Error: ${error.message}`;
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style>
.controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
}

.flatpickr-input,
.time-step-select {
  width: 20%;
  padding: 10px;
  font-size: 16px;
  margin-right: 10px;
}

.controls button {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 16px;
  cursor: pointer;
}

.controls button:hover {
  background-color: #0056b3;
}

.flatpickr-shortcuts {
  display: flex;
  justify-content: space-around;
  margin-top: 10px;
}

.flatpickr-shortcuts button {
  background: #007bff;
  color: white;
  border: none;
  padding: 5px 10px;
  cursor: pointer;
}

.guild-id-input {
  width: 20%;
  padding: 10px;
  font-size: 16px;
  margin-right: 10px;
}
</style>
