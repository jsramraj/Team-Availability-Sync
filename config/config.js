require('dotenv').config();

// Configuration object for the application
const config = {
  // Google OAuth configuration
  google: {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback',
  },
  
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    sessionSecret: process.env.SESSION_SECRET || 'ooo-sync-secret',
    cookieMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  },
  
  // Sync schedule configuration (cron format)
  sync: {
    schedule: process.env.SYNC_SCHEDULE || '0 */6 * * *', // Every 6 hours by default
  },
  
  // OOO detection keywords
  oooKeywords: [
    'out of office',
    'ooo',
    'vacation',
    'leave',
    'away',
    'holiday',
    'time off',
    'pto'
  ],

  // Validation for configuration
  validate: function() {
    const errors = [];
    
    if (!this.google.clientId) {
      errors.push('Missing CLIENT_ID environment variable');
    }
    
    if (!this.google.clientSecret) {
      errors.push('Missing CLIENT_SECRET environment variable');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

// Export the configuration object
module.exports = config;