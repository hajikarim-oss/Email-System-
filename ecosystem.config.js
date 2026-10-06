module.exports = {
  apps: [
    {
      name: "nexus-outbound",
      cwd: "./nexus-outbound",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      exp_backoff_restart_delay: 100,
      error_file: "./logs/nexus-error.log",
      out_file: "./logs/nexus-out.log",
      time: true,
    },
    {
      name: "email-system-api",
      cwd: ".",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "api/index.ts",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      exp_backoff_restart_delay: 100,
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      time: true,
    },
    {
      name: "daily-refresh-cron",
      cwd: "./nexus-outbound",
      script: "../node_modules/tsx/dist/cli.mjs",
      args: "scripts/daily_refresh.ts",
      cron_restart: "5 0 * * *", // Runs every midnight at 00:05 UTC
      autorestart: false,
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/cron-error.log",
      out_file: "./logs/cron-out.log",
      time: true,
    },
  ],
};
