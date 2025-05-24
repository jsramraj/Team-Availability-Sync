const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const { setCredentials } = require('./src/auth/googleAuth');
const { getOOOEvents, syncOOOToTeamCalendars } = require('./src/calendar/calendarService');
require('dotenv').config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'ooo-sync-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import routes
const authRoutes = require('./src/routes/auth');
const calendarRoutes = require('./src/routes/calendar');

// Use routes
app.use('/auth', authRoutes);
app.use('/calendar', calendarRoutes);

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.tokens) {
    return res.redirect('/auth/login');
  }
  next();
};

// Homepage route
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'OOO Calendar Sync',
    isAuthenticated: !!req.session.tokens 
  });
});

// Dashboard route
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.render('dashboard', {
    title: 'OOO Calendar Sync Dashboard',
    syncConfig: req.session.syncConfig || null
  });
});

// Setup route
app.get('/setup', isAuthenticated, (req, res) => {
  res.render('setup', {
    title: 'Set Up OOO Calendar Sync'
  });
});

// Schedule automatic sync for users with stored configurations
cron.schedule('0 */6 * * *', async () => { // Run every 6 hours
  console.log('Running scheduled sync...');
  
  // In a production app, you would store configurations in a database
  // This is a simplified version using session storage for demo purposes
  
  if (global.syncConfigurations) {
    for (const userId in global.syncConfigurations) {
      const config = global.syncConfigurations[userId];
      
      try {
        const auth = setCredentials(config.tokens);
        const oooEvents = await getOOOEvents(auth);
        await syncOOOToTeamCalendars(auth, oooEvents, config.teamCalendarIds, config.userDisplayName);
        console.log(`Synced OOO events for user ${userId}`);
      } catch (error) {
        console.error(`Error syncing OOO events for user ${userId}:`, error);
      }
    }
  }
});

// Global storage for active sync configurations (in a real app, use a database)
global.syncConfigurations = {};

// Store sync configuration for scheduled syncs
app.post('/save-sync-config', isAuthenticated, (req, res) => {
  const { teamCalendarIds, userDisplayName, enableAutoSync } = req.body;
  
  if (enableAutoSync) {
    // Using a random ID for demo purposes, in a real app use the user's ID from your auth system
    const userId = Math.random().toString(36).substring(2, 15);
    
    global.syncConfigurations[userId] = {
      tokens: req.session.tokens,
      teamCalendarIds,
      userDisplayName
    };
  }
  
  res.json({ success: true });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});