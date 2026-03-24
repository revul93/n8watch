// PM2 process management configuration
// Usage:
//   pm2 start ecosystem.config.js        # Start the application
//   pm2 stop n8netwatch                  # Stop the application
//   pm2 restart n8netwatch               # Restart the application
//   pm2 logs n8netwatch                  # View logs
//   pm2 monit                            # Monitor in real time
//   pm2 save && pm2 startup              # Enable auto-start on boot

module.exports = {
  apps: [
    {
      name: 'n8netwatch',
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'fork',

      // Logging
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto-restart behaviour
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000, // 2 seconds

      // Memory guard
      max_memory_restart: '500M',

      // Environment
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
      },
    },
  ],
};
