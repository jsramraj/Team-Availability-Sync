const express = require('express');
const { setCredentials } = require('../auth/googleAuth');
const { 
  getUserCalendars, 
  getOOOEvents,
  syncOOOToTeamCalendars,
  fullSyncProcess
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
    
    console.log('Fetching OOO events for UI display');
    // We'll use the same method that's used for syncing to ensure consistency
    const events = await getOOOEvents(auth, timeMin, timeMax);
    console.log(`Returning ${events.length} OOO events for display`);
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
    
    // Get the last sync time from the session if available
    let lastSyncTime = null;
    if (req.session.syncConfig && req.session.syncConfig.lastSync) {
      lastSyncTime = req.session.syncConfig.lastSync;
      console.log(`Using incremental sync with last sync time: ${lastSyncTime}`);
    } else {
      console.log('No previous sync found, performing full sync');
    }
    
    // Force a full sync if requested
    if (req.body.forceFullSync) {
      console.log('Force full sync requested, ignoring last sync time');
      lastSyncTime = null;
    }
    
    console.log(`Starting ${lastSyncTime ? 'incremental' : 'full'} sync process`);
    
    // Use the updated fullSyncProcess that supports incremental updates
    const results = await fullSyncProcess(
      auth, 
      timeMin, 
      timeMax, 
      teamCalendarIds, 
      userDisplayName,
      lastSyncTime
    );
    
    // Store sync configuration in session with current timestamp
    req.session.syncConfig = {
      teamCalendarIds,
      userDisplayName,
      lastSync: new Date().toISOString()
    };
    
    // Add some additional metadata to the response
    let messageText = '';
    
    if (results.success.length > 0) {
      const addedCount = results.sync.success.length;
      const deletedCount = results.deletedCount || 0;
      
      if (addedCount > 0 && deletedCount > 0) {
        messageText = `Sync completed. Added ${addedCount} events and removed ${deletedCount} deleted events.`;
      } else if (addedCount > 0) {
        messageText = `Sync completed. Added ${addedCount} events.`;
      } else if (deletedCount > 0) {
        messageText = `Sync completed. Removed ${deletedCount} deleted events.`;
      } else {
        messageText = `Sync completed.`;
      }
    } else if (results.skipped && results.skipped.length > 0) {
      const deletedCount = results.deletedCount || 0;
      
      if (deletedCount > 0) {
        messageText = `Sync completed. No new events to add, but removed ${deletedCount} deleted events.`;
      } else {
        messageText = `No new events to sync. ${results.skipped.length} events were already synced.`;
      }
    } else if (results.eventCount === 0) {
      messageText = 'No OOO events found to sync.';
    } else {
      messageText = 'Sync completed, but no changes were made.';
    }
    
    results.message = messageText;
    results.info = {
      timeRange: {
        from: new Date(timeMin).toLocaleDateString(),
        to: new Date(timeMax).toLocaleDateString()
      },
      syncTime: new Date().toISOString(),
      eventCount: results.eventCount,
      teamCalendarCount: teamCalendarIds.length,
      deletedCount: results.deletedCount || 0,
      syncType: results.syncType || (lastSyncTime ? 'incremental' : 'full')
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

// Add a new route to force a full sync
router.post('/full-sync', isAuthenticated, async (req, res) => {
  try {
    // Get the sync config from the session
    const syncConfig = req.session.syncConfig;
    
    if (!syncConfig) {
      return res.status(400).json({
        error: 'No sync configuration found',
        details: 'Please set up sync configuration first.'
      });
    }
    
    // Forward the request to the regular sync endpoint with forceFullSync flag
    req.body = {
      ...req.body,
      teamCalendarIds: syncConfig.teamCalendarIds,
      userDisplayName: syncConfig.userDisplayName,
      forceFullSync: true
    };
    
    // Call the regular sync handler
    await router.handle(req, res, 'post', '/sync');
    
  } catch (error) {
    console.error('Error performing full sync:', error);
    res.status(500).json({ 
      error: 'Failed to perform full sync',
      message: error.message || 'An unexpected error occurred during sync'
    });
  }
});

// Get current sync configuration
router.get('/sync-config', isAuthenticated, (req, res) => {
  const syncConfig = req.session.syncConfig || null;
  res.json(syncConfig);
});

module.exports = router;