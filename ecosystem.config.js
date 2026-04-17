module.exports = {
  apps: [
    {
      name: 'codesteam',
      script: './server/src/index.js',
      instances: 'max',          // Use all CPU cores
      exec_mode: 'cluster',      // Cluster mode for load balancing
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      // Graceful reload — zero downtime deploys
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
