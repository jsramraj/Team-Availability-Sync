const express = require('express');
const { setCredentials } = require('../auth/googleAuth');
const { 
  getUserCalendars, 
  getOOOEvents,
  syncOOOToTeamCalendars
} = require('../calendar/calendarService');
const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.tokens) {
    return res.redirect('/auth/login');
  }
  next();
};

// Get user's calendars
router.get('/calendars', isAuthenticated, async (req, res) => {
  try {
    const auth = setCredentials(req.session.tokens);
    const calendars = await getUserCalendars(auth);
    res.json(calendars);
  } catch (error) {
    console.error('Error fetching calendars:', error);
    res.status(500).json({ error: 'Failed to fetch calendars' });
  }
});

// Get OOO events from user's calendar
router.get('/ooo-events', isAuthenticated, async (req, res) => {
  try {
    const auth = setCredentials(req.session.tokens);
    const timeMin = req.query.timeMin || new Date().toISOString();
    const timeMax = req.query.timeMax || new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString();
    
    const events = await getOOOEvents(auth, timeMin, timeMax);
    res.json(events);
  } catch (error) {
    console.error('Error fetching OOO events:', error);
    res.status(500).json({ error: 'Failed to fetch OOO events' });
  }
});

// Sync OOO events to team calendars
router.post('/sync', isAuthenticated, async (req, res) => {
  try {
    const { teamCalendarIds, userDisplayName } = req.body;
    
    if (!teamCalendarIds || !Array.isArray(teamCalendarIds) || teamCalendarIds.length === 0) {
      return res.status(400).json({ 
        error: 'Team calendar IDs are required',
        details: 'Please provide at least one team calendar ID to sync with.'
      });
    }
    
    if (!userDisplayName) {
      return res.status(400).json({ 
        error: 'User display name is required',
        details: 'Please provide your display name for OOO events on team calendars.'
      });
    }
    
    const auth = setCredentials(req.session.tokens);
    const timeMin = req.body.timeMin || new Date().toISOString();
    const timeMax = req.body.timeMax || new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString();
    
    // Get OOO events from user's calendar
    const oooEvents = await getOOOEvents(auth, timeMin, timeMax);
    
    if (oooEvents.length === 0) {
      // No OOO events found, but this isn't an error - just return early with info
      // Store sync configuration in session anyway to track last sync attempt
      req.session.syncConfig = {
        teamCalendarIds,
        userDisplayName,
        lastSync: new Date().toISOString()
      };
      
      return res.json({ 
        success: [], 
        errors: [],
        skipped: [],
        message: 'No OOO events found to sync.',
        info: {
          timeRange: {
            from: new Date(timeMin).toLocaleDateString(),
            to: new Date(timeMax).toLocaleDateString()
          },
          teamCalendarCount: teamCalendarIds.length
        }
      });
    }
    
    // Sync events to team calendars
    const results = await syncOOOToTeamCalendars(auth, oooEvents, teamCalendarIds, userDisplayName);
    
    // Store sync configuration in session
    req.session.syncConfig = {
      teamCalendarIds,
      userDisplayName,
      lastSync: new Date().toISOString()
    };
    
    // Add some additional metadata to the response
    let messageText = '';
    if (results.success.length > 0) {
      messageText = `Sync completed. ${results.success.length} events synced successfully.`;
    } else if (results.skipped.length > 0) {
      messageText = `No new events to sync. ${results.skipped.length} events were already synced.`;
    } else {
      messageText = 'No OOO events found that matched the criteria.';
    }
    
    results.message = messageText;
    results.info = {
      timeRange: {
        from: new Date(timeMin).toLocaleDateString(),
        to: new Date(timeMax).toLocaleDateString()
      },
      syncTime: new Date().toISOString(),
      eventCount: oooEvents.length,
      teamCalendarCount: teamCalendarIds.length
    };
    
    res.json(results);
  } catch (error) {
    console.error('Error syncing OOO events:', error);
    res.status(500).json({ 
      error: 'Failed to sync OOO events',
      message: error.message || 'An unexpected error occurred during sync',
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Get current sync configuration
router.get('/sync-config', isAuthenticated, (req, res) => {
  const syncConfig = req.session.syncConfig || null;
  res.json(syncConfig);
});

module.exports = router;