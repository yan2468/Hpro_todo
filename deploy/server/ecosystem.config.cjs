module.exports = {
  apps: [
    {
      name: 'dave-tasks-server',
      script: 'npx',
      args: 'tsx server/index.ts',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      log_file: './logs/combined.log',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
    },
  ],
};
