const { google } = require('googleapis');
const { oauth2Client } = require('../auth/googleAuth');
const config = require('../../config/config');

// Get user's calendar list
async function getUserCalendars(auth) {
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.calendarList.list();
  return response.data.items;
}

// Get OOO events from user's calendar with updatedMin parameter for incremental sync
async function getOOOEvents(auth, timeMin, timeMax, updatedMin = null) {
  const calendar = google.calendar({ version: 'v3', auth });
  console.log(`Searching for OOO events between ${timeMin} and ${timeMax}${updatedMin ? `, updated since ${updatedMin}` : ''}`);
  
  // Build request parameters
  const params = {
    calendarId: 'primary',
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100 // Increase the number of events we look at
  };
  
  // Add updatedMin parameter if provided
  if (updatedMin) {
    params.updatedMin = updatedMin;
    console.log(`Using incremental sync: only fetching events updated since ${updatedMin}`);
  }
  
  // Fetch events from Google Calendar API
  const response = await calendar.events.list(params);
  
  console.log(`Found ${response.data.items.length} total events in calendar${updatedMin ? ' (updated since last sync)' : ''}`);
  
  // Use the keywords from config for more comprehensive detection
  const oooKeywords = config.oooKeywords || [
    'out of office', 'ooo', 'vacation', 'leave', 'away', 'holiday', 'time off', 'pto', 'offline',
    'unavailable', 'not available', 'absence', 'absent', 'day off', 'off work'
  ];
  
  // Filter events to find OOO events
  const oooEvents = response.data.items.filter(event => {
    const title = (event.summary || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    const eventType = (event.eventType || '').toLowerCase();
    const status = (event.status || '').toLowerCase();
    
    // Log each event for debugging
    console.log(`Checking event: "${event.summary}" (${new Date(event.start.dateTime || event.start.date).toLocaleDateString()}) - Updated: ${new Date(event.updated).toLocaleString()}`);
    
    // Check for canceled/deleted events
    if (status === 'cancelled') {
      console.log(`  - Event "${event.summary}" is cancelled/deleted`);
      // We want to include cancelled events in our results so we can remove them from team calendars
      return true;
    }
    
    // Check for OOO keywords in title or description
    for (const keyword of oooKeywords) {
      if (title.includes(keyword) || description.includes(keyword)) {
        console.log(`  - Event "${event.summary}" matches OOO keyword: "${keyword}"`);
        return true;
      }
    }
    
    // Check if calendar event has "out of office" flag set
    if (eventType === 'outofoffice') {
      console.log(`  - Event "${event.summary}" has OOO event type`);
      return true;
    }
    
    return false;
  });
  
  console.log(`Detected ${oooEvents.length} OOO events out of ${response.data.items.length} total events`);
  
  return oooEvents;
}

// Sync OOO events to team calendars
async function syncOOOToTeamCalendars(auth, oooEvents, teamCalendars, userDisplayName) {
  const calendar = google.calendar({ version: 'v3', auth });
  const results = {
    success: [],
    errors: [],
    skipped: [] // Track events that were skipped because they already exist
  };

  console.log(`Starting sync of ${oooEvents.length} OOO events to ${teamCalendars.length} team calendars`);
  
  if (oooEvents.length === 0) {
    console.log('No OOO events to sync');
    return results;
  }

  for (const teamCalendarId of teamCalendars) {
    console.log(`Syncing to team calendar: ${teamCalendarId}`);
    
    for (const event of oooEvents) {
      try {
        const eventTitle = `${userDisplayName} - OOO: ${event.summary}`;
        console.log(`Processing event: "${eventTitle}"`);
        
        // Check if this event is already synced to this team calendar
        // Instead of querying by userDisplayName which can cause API errors,
        // Let's get all events in the date range and filter client-side
        const eventStartTime = event.start.dateTime || event.start.date;
        const eventEndTime = event.end.dateTime || event.end.date;
        
        try {
          // Make sure we use ISO string format for dates and properly format them
          const timeMin = new Date(eventStartTime).toISOString();
          const timeMax = new Date(eventEndTime).toISOString();
          
          console.log(`  - Checking for existing events between ${timeMin} and ${timeMax}`);
          const existingEvents = await calendar.events.list({
            calendarId: teamCalendarId,
            timeMin: timeMin,
            timeMax: timeMax,
            // Remove the query parameter that's causing the 400 error
            // q: userDisplayName // This was causing the Bad Request error
          });
          
          // Instead, filter the events client-side
          const alreadySynced = existingEvents.data.items.some(existingEvent => 
            existingEvent.summary === eventTitle || 
            (existingEvent.summary && existingEvent.summary.includes(`${userDisplayName} - OOO`))
          );
          
          if (alreadySynced) {
            console.log(`  - Event already exists in team calendar, skipping`);
            results.skipped.push({
              calendarId: teamCalendarId,
              summary: eventTitle
            });
            continue;
          }
        } catch (listError) {
          console.error(`  - Error checking for existing events:`, listError);
          // We'll continue anyway and try to create the event
          console.log(`  - Continuing with event creation despite list error`);
        }
        
        console.log(`  - Creating new event in team calendar`);
        // Create a new event in the team calendar
        const teamEvent = {
          summary: eventTitle,
          description: `Automatically synced OOO event from ${userDisplayName}'s calendar.\nOriginal event: ${event.description || 'No description provided'}`,
          start: event.start,
          end: event.end,
          transparency: 'transparent',  // Out of office events should not block time on the team calendar
          reminders: {
            useDefault: false
          }
        };

        const result = await calendar.events.insert({
          calendarId: teamCalendarId,
          resource: teamEvent,
        });

        console.log(`  - Successfully created event in team calendar`);
        results.success.push({
          calendarId: teamCalendarId,
          eventId: result.data.id,
          summary: teamEvent.summary
        });
      } catch (error) {
        console.error(`Error syncing event to ${teamCalendarId}:`, error);
        results.errors.push({
          calendarId: teamCalendarId,
          eventSummary: event.summary,
          error: error.message
        });
      }
    }
  }

  console.log(`Sync completed. Results: ${results.success.length} successes, ${results.skipped.length} skipped, ${results.errors.length} errors`);
  return results;
}

// Update team calendars when OOO event changes
async function updateSyncedEvents(auth, oooEvent, teamCalendars, userDisplayName) {
  const calendar = google.calendar({ version: 'v3', auth });
  const results = {
    success: [],
    errors: []
  };

  for (const teamCalendarId of teamCalendars) {
    try {
      // Find synced events
      const existingEvents = await calendar.events.list({
        calendarId: teamCalendarId,
        q: `${userDisplayName} - OOO: ${oooEvent.summary}`
      });

      if (existingEvents.data.items.length > 0) {
        // Update the synced event
        const syncedEvent = existingEvents.data.items[0];
        
        const updatedEvent = {
          summary: `${userDisplayName} - OOO: ${oooEvent.summary}`,
          description: `Automatically synced OOO event from ${userDisplayName}'s calendar.\nOriginal event: ${oooEvent.description || 'No description provided'}`,
          start: oooEvent.start,
          end: oooEvent.end
        };

        const result = await calendar.events.update({
          calendarId: teamCalendarId,
          eventId: syncedEvent.id,
          resource: updatedEvent,
        });

        results.success.push({
          calendarId: teamCalendarId,
          eventId: result.data.id,
          summary: updatedEvent.summary
        });
      }
    } catch (error) {
      console.error('Error updating event:', error);
      results.errors.push({
        calendarId: teamCalendarId,
        eventSummary: oooEvent.summary,
        error: error.message
      });
    }
  }

  return results;
}

// Delete synced OOO event from team calendars
async function deleteSyncedEvent(auth, oooEvent, teamCalendars, userDisplayName) {
  const calendar = google.calendar({ version: 'v3', auth });
  const results = {
    success: [],
    errors: []
  };

  for (const teamCalendarId of teamCalendars) {
    try {
      // Find synced events
      const existingEvents = await calendar.events.list({
        calendarId: teamCalendarId,
        q: `${userDisplayName} - OOO: ${oooEvent.summary}`
      });

      if (existingEvents.data.items.length > 0) {
        // Delete the synced event
        const syncedEvent = existingEvents.data.items[0];
        
        await calendar.events.delete({
          calendarId: teamCalendarId,
          eventId: syncedEvent.id
        });

        results.success.push({
          calendarId: teamCalendarId,
          eventId: syncedEvent.id,
          summary: syncedEvent.summary
        });
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      results.errors.push({
        calendarId: teamCalendarId,
        eventSummary: oooEvent.summary,
        error: error.message
      });
    }
  }

  return results;
}

// Clean up deleted OOO events - remove them from team calendars
async function cleanupDeletedEvents(auth, currentOooEvents, teamCalendars, userDisplayName, lastSyncTime = null) {
  const calendar = google.calendar({ version: 'v3', auth });
  const results = {
    success: [],
    errors: []
  };
  
  console.log(`Starting cleanup of deleted events in ${teamCalendars.length} team calendars${lastSyncTime ? ' (checking changes since last sync)' : ''}`);
  
  // Create a map of current OOO events for faster lookup
  const currentEventsMap = new Map();
  currentOooEvents.forEach(event => {
    // Use the event summary as a key
    currentEventsMap.set(event.summary.toLowerCase(), event);
    
    // Also keep track of cancelled events
    if (event.status === 'cancelled') {
      console.log(`Tracking cancelled event: "${event.summary}"`);
    }
  });
  
  // Process each team calendar
  for (const teamCalendarId of teamCalendars) {
    console.log(`Checking for deleted events in team calendar: ${teamCalendarId}`);
    
    try {
      // Get all events in the team calendar that were synced for this user
      const timeMin = new Date();
      timeMin.setMonth(timeMin.getMonth() - 1); // Look back 1 month
      
      const timeMax = new Date();
      timeMax.setMonth(timeMax.getMonth() + 6); // Look ahead 6 months
      
      // Get all synced events in the team calendar within the time range
      const teamEvents = await calendar.events.list({
        calendarId: teamCalendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        maxResults: 100 // Reasonable number of events to process
      });
      
      // Filter to only include events that were synced from this user's calendar
      const syncedEvents = teamEvents.data.items.filter(event => 
        event.summary && event.summary.startsWith(`${userDisplayName} - OOO:`)
      );
      
      console.log(`Found ${syncedEvents.length} previously synced events for ${userDisplayName}`);
      
      // Check each synced event to see if it still exists in the current OOO events
      for (const syncedEvent of syncedEvents) {
        // Extract the original event summary from the synced event
        // Format: "{userDisplayName} - OOO: {originalEventSummary}"
        const syncedEventPrefix = `${userDisplayName} - OOO: `;
        const originalEventSummary = syncedEvent.summary.substring(syncedEventPrefix.length).toLowerCase();
        
        // Check if this event still exists in the current OOO events
        const originalEvent = currentEventsMap.get(originalEventSummary);
        const isDeleted = !originalEvent || originalEvent.status === 'cancelled';
        
        if (isDeleted) {
          console.log(`Event "${originalEventSummary}" no longer exists in personal calendar, deleting from team calendar`);
          
          // Delete the synced event since it no longer exists in the personal calendar
          await calendar.events.delete({
            calendarId: teamCalendarId,
            eventId: syncedEvent.id
          });
          
          results.success.push({
            calendarId: teamCalendarId,
            eventId: syncedEvent.id,
            summary: syncedEvent.summary,
            action: 'deleted'
          });
        }
      }
    } catch (error) {
      console.error(`Error cleaning up events in ${teamCalendarId}:`, error);
      results.errors.push({
        calendarId: teamCalendarId,
        error: error.message
      });
    }
  }
  
  console.log(`Cleanup completed. Deleted ${results.success.length} outdated events with ${results.errors.length} errors`);
  return results;
}

// Full sync process with incremental updates
async function fullSyncProcess(auth, timeMin, timeMax, teamCalendars, userDisplayName, lastSyncTime = null) {
  console.log(`Starting full sync process with${lastSyncTime ? ' incremental' : ' full'} sync`);
  
  // Get current OOO events, using lastSyncTime for incremental updates if available
  const oooEvents = await getOOOEvents(auth, timeMin, timeMax, lastSyncTime);
  
  // First, sync new and existing events
  const syncResults = await syncOOOToTeamCalendars(auth, oooEvents, teamCalendars, userDisplayName);
  
  // Then, clean up deleted events
  const cleanupResults = await cleanupDeletedEvents(auth, oooEvents, teamCalendars, userDisplayName, lastSyncTime);
  
  // Combine the results
  return {
    sync: syncResults,
    cleanup: cleanupResults,
    success: [...syncResults.success, ...cleanupResults.success],
    skipped: syncResults.skipped || [],
    errors: [...syncResults.errors, ...cleanupResults.errors],
    eventCount: oooEvents.length,
    deletedCount: cleanupResults.success.length,
    syncType: lastSyncTime ? 'incremental' : 'full'
  };
}

module.exports = {
  getUserCalendars,
  getOOOEvents,
  syncOOOToTeamCalendars,
  updateSyncedEvents,
  deleteSyncedEvent,
  cleanupDeletedEvents,
  fullSyncProcess
};