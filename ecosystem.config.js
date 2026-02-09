module.exports = {
  apps: [{
    name: 'pos-advanced',
    script: 'npm',
    args: 'start',
    interpreter: 'none',
    cwd: 'C:/BIGVOUNTRY/POS-ADVANCED',  // ADD THIS LINE - force the working directory
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      NEXT_PUBLIC_SUPABASE_URL: 'https://nyjlayvobgpuwifzlrcb.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55amxheXZvYmdwdXdpZnpscmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NzIwODMsImV4cCI6MjA4MzA0ODA4M30.DHqswfj2-fnz2ILRBTGg1YQvXu3LRkGkBJaie6Jco7Q',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55amxheXZvYmdwdXdpZnpscmNiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQ3MjA4MywiZXhwIjoyMDgzMDQ4MDgzfQ.aysENn1m1Z1-ABisQ9OScm9IVuCRgK6Owg43aLdV4kY'
    }
  }]
}