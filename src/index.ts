import { Context, h, Logger, Schema, Service } from "koishi";
import path from "path";
import { mkdir } from "fs/promises";
import EasyDl from "easydl";
import { extractTarGz, extractZip } from "./helper";
import spawn from "cross-spawn";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type {} from "@koishijs/plugin-console";
import { InfluxDB, Point, WriteApi } from "@influxdata/influxdb-client";
import queryClient from "./query";
import * as fs from "node:fs";
import { PrometheusDriver } from "./query/driver";

export * from "./chartOptions";
export type * from "./query/types";
export const name = "stats";

declare module "koishi" {
  interface Context {
    stats: Stats;
  }
}

declare module "@koishijs/plugin-console" {
  interface Events {
    rangeQuery: PrometheusDriver["rangeQuery"];
    instantQuery: PrometheusDriver["instantQuery"];
    series: PrometheusDriver["series"];
    alerts: PrometheusDriver["alerts"];
  }
}

export class Stats extends Service {
  influxDB: InfluxDB;
  defaultWriter: WriteApi;
  dbProcess: ChildProcessWithoutNullStreams;
  queryClient = queryClient;
  constructor(
    public ctx: Context,
    public config: Stats.Config,
  ) {
    super(ctx, "stats", true);
    ctx.inject(["console"], (ctx) => {
      ctx.console.addListener("rangeQuery", (...any) => {
        return this.queryClient.rangeQuery(...any);
      });
      ctx.console.addListener("instantQuery", (...any) => {
        return this.queryClient.instantQuery(...any);
      });
      ctx.console.addListener("series", (...any) => {
        return this.queryClient.series(...any);
      });
      ctx.console.addListener("alerts", (...any) => {
        return this.queryClient.alerts(...any);
      });

      ctx.console.addEntry({
        dev: path.resolve(__dirname, "../client/index.ts"),
        prod: path.resolve(__dirname, "../dist"),
      });
    });
  }

  // @ts-ignore
  get logger() {
    return this.ctx?.logger || new Logger(name);
  }

  async start() {
    let { nodeBinaryPath, dataPath } = this.config;
    const nodeDir = path.resolve(this.ctx.baseDir, nodeBinaryPath);
    const dataDir = path.resolve(this.ctx.baseDir, dataPath);
    await mkdir(nodeDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    let binaryPath = null;
    try {
      binaryPath = await this.getNativeBinding(nodeDir);
    } catch (e) {
      if (e instanceof UnsupportedError) {
        this.logger.error("Stats 目前不支持你的系统");
      }
      this.ctx.scope.dispose();
      throw e;
    }

    this.logger.info(binaryPath);

    this.dbProcess = spawn(binaryPath, ["-storageDataPath", dataDir]);

    // this.dbProcess.stderr.on("data", (data) => {
    //   this.logger.info(data.toString());
    // });

    this.dbProcess.on("close", (code, signal) => {
      this.logger.info(`Database process exited with code ${code}`);
      if (signal !== "SIGTERM" && code !== 0) {
        this.logger.error(`数据库非正常退出 code: ${code}`);
        this.ctx.scope.dispose();
      }
    });

    let retriedCount = 0;
    const removeInterval = this.ctx.setInterval(async () => {
      if (++retriedCount >= 5) {
        this.logger.info(`Timed out, Retried count: ${retriedCount}`);
        this.ctx.scope.dispose();
      }
      try {
        await this.ctx.http.get("http://localhost:8428/").then(() => {
          removeInterval();
          this.influxDB = new InfluxDB({
            url: "http://localhost:8428",
          });
          this.defaultWriter = this.influxDB.getWriteApi(
            undefined,
            undefined,
            "ms",
            {
              batchSize: this.config.DEFAULT_BATCH_LENGTH,
              flushInterval: this.config.DEFAULT_FLUSH_INTERVAL,
            },
          );

          const point = new Point("Stats").booleanField("started", true);
          this.defaultWriter.writePoint(point);
          this.defaultWriter
            .flush()
            .then((e) => this.logger.info(e))
            .catch((e) => {
              this.logger.error(e);
              this.ctx.scope.dispose();
            });
          this.logger.success("Stats 服务启动成功");
        });
      } catch {}
    }, 1000);
  }

  async stop() {
    this.dbProcess.kill("SIGTERM");
  }

  private initStatsListener() {
    this.ctx.on("message", (session) => {
      if (session.selfId == session.userId) return;
      const elementType = session.elements[0].type;
      const msgLength = h
        .transform(session.content, { text: true, default: false })
        .replace(/\n/g, " ").length;
      const userId = session.userId || session.user["id"];
      const point = new Point("message")
        .tag("guildId", session.guildId)
        .tag("userId", userId)
        .tag("type", elementType)
        .intField("length", msgLength);
      this.defaultWriter.writePoint(point);
    });

    this.ctx.any().before("command/execute", ({ command, session }) => {
      const point = new Point("message")
        .tag("guildId", session.guildId)
        .tag("channelId", session.channelId)
        .tag("userId", session.user["id"] || 0)
        .tag("command", command.name)
        .stringField("content", session.content);
      this.defaultWriter.writePoint(point);
    });
  }
  private async getNativeBinding(nodeDir) {
    const { platform, arch } = process;

    const platformArchMap = {
      win32: {
        x64: "windows-amd64",
      },
      darwin: {
        x64: "darwin-amd64",
        arm64: "darwin-arm64",
      },
      freebsd: {
        x64: "freebsd-amd64",
      },
      openbsd: {
        x64: "openbsd-amd64",
      },
      linux: {
        x64: "linux-amd64",
        arm64: "linux-arm64",
        arm: "linux-arm",
      },
    };
    if (!platformArchMap[platform]) {
      throw new UnsupportedError(
        `Unsupported OS: ${platform}, architecture: ${arch}`,
      );
    }
    if (!platformArchMap[platform][arch]) {
      throw new UnsupportedError(
        `Unsupported architecture on ${platform}: ${arch}`,
      );
    }

    const version = "1.101.0";
    let binaryName =
      "victoria-metrics-" + platformArchMap[platform][arch] + `-v${version}`;

    if (platform == "win32") {
      binaryName += ".zip";
    } else {
      binaryName += ".tar.gz";
    }

    const binaryPath = path.resolve(nodeDir, binaryName);
    const url = `${this.config.vmSource}/releases/download/v${version}/${binaryName}`;
    this.logger.info(url);

    const downloader = new EasyDl(url, binaryPath, {
      connections: 3,
      maxRetry: 5,
      existBehavior: "error",
      followRedirect: true,
    });

    await downloader
      .wait()
      .then(async (finished) => {
        this.logger.info("VictoriaMetrics downloaded.");
        if (finished) {
          try {
            if (platform == "win32") {
              await extractZip(binaryPath);
            } else {
              await extractTarGz(binaryPath);
            }
          } catch (e) {
            this.logger.error("Extract Error:", e);
            throw e;
          }
        }
      })
      .catch((e) => {
        if (e.message.startsWith("Destination") == false) {
          this.logger.error("Download Error:", e);
          throw e;
        }
      });

    return new Promise((resolve, reject) => {
      fs.readdir(nodeDir, (err, files) => {
        if (err) {
          reject(
            new Error(
              `An error occurred while reading the output directory: ${err.message}`,
            ),
          );
        } else {
          // Filter out the original archive file from the list
          const extractedFiles = files.filter(
            (file) => file !== path.basename(binaryPath),
          );
          if (extractedFiles.length === 1) {
            resolve(path.join(nodeDir, extractedFiles[0]));
          } else {
            reject(
              new Error("The extraction did not result in a single file."),
            );
          }
        }
      });
    });
  }
}

export namespace Stats {
  export interface Config {
    nodeBinaryPath: string;
    dataPath: string;
    vmSource: string;
    DEFAULT_BATCH_LENGTH?: number;
    DEFAULT_FLUSH_INTERVAL: number;
  }
  export const Config = Schema.object({
    nodeBinaryPath: Schema.path({
      filters: ["directory"],
      allowCreate: true,
    })
      .description("Stats 二进制文件存放目录")
      .default("stats"),
    dataPath: Schema.path({
      filters: ["directory"],
      allowCreate: true,
    })
      .description("Stats 数据存放目录")
      .default("data/stats"),
    vmSource: Schema.string()
      .default(
        "https://ghprxy.kylix.fun/https://github.com/VictoriaMetrics/VictoriaMetrics",
      )
      .role("link")
      .description(
        "VictoriaMetrics 下载源，时序数据库核心。可以在前边添加 gh release 反代提升国内下载速度，这里默认是我自建的。",
      ),
    DEFAULT_BATCH_LENGTH: Schema.natural()
      .default(60)
      .description("默认数据写入器的缓存长度。"),
    DEFAULT_FLUSH_INTERVAL: Schema.natural()
      .default(60000)
      .description("默认数据写入器的缓存时间，以毫秒计。"),
  });
}

export default Stats;
class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedError";
  }
}
