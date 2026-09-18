import { spawn } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const processes = [
  spawn(pnpm, ["--filter", "@workspace/api-server", "dev"], {
    env: { ...process.env, NODE_ENV: "development", PORT: "3001" },
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
  spawn(pnpm, ["--filter", "@workspace/star-line", "dev"], {
    env: {
      ...process.env,
      PORT: "5173",
      BASE_PATH: "/",
      API_URL: "http://localhost:3001",
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
];

const stopProcesses = () => {
  for (const child of processes) {
    if (child.killed) continue;

    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        shell: true,
      });
    } else {
      child.kill();
    }
  }
};

for (const child of processes) {
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) process.exitCode = code;
    stopProcesses();
  });
}

process.on("SIGINT", () => {
  stopProcesses();
  process.exit(0);
});