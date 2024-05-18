import { Context } from "@koishijs/client";
import Page from "./page.vue";
import Stats from "./stats.vue";

export default (ctx: Context) => {
  // 此 Context 非彼 Context
  // 我们只是在前端同样实现了一套插件逻辑
  if (process.env.NODE_ENV == "development") {
    ctx.page({
      name: "Victoria-Metrics",
      path: "/stats-db",
      component: Page,
    });
  }
  ctx.page({
    name: "统计报表",
    path: "/stats",
    component: Stats,
  });
};
