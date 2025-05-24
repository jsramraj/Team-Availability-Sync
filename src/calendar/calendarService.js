const { google } = require('googleapis');
const { oauth2Client } = require('../auth/googleAuth');
const config = require('../../config/config');

// Get user's calendar list
async function getUserCalendars(auth) {
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.calendarList.list();
  return response.data.items;
}

// Get OOO events from user's calendar
async function getOOOEvents(auth, timeMin, timeMax) {
  const calendar = google.calendar({ version: 'v3', auth });
  console.log(`Searching for OOO events between ${timeMin} and ${timeMax}`);
  
  // First, get all events without filtering
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100 // Increase the number of events we look at
  });
  
  console.log(`Found ${response.data.items.length} total events in calendar`);
  
  // Use the keywords from config for more comprehensive detection
  const oooKeywords = config.oooKeywords || [
    'out of office', 'ooo', 'vacation', 'leave', 'away', 'holiday', 'time off', 'pto', 'offline',
    'unavailable', 'not available', 'absence', 'absent', 'day off', 'off work'
  ];
  
  // Also check event status for "out of office" status
  const oooEvents = response.data.items.filter(event => {
    const title = (event.summary || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    const eventType = (event.eventType || '').toLowerCase();
    const status = (event.status || '').toLowerCase();
    
    // Log each event for debugging
    console.log(`Checking event: "${event.summary}" (${new Date(event.start.dateTime || event.start.date).toLocaleDateString()} - ${new Date(event.end.dateTime || event.end.date).toLocaleDateString()})`);
    
    // Check event transparency (outOfOffice is a special value in Google Calendar)
    if (event.transparency === 'transparent' || status === 'outofoffice') {
      console.log(`  - Event "${event.summary}" has out-of-office transparency or status`);
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
    // Some calendar events specifically have an OOO flag
    if (eventType === 'outofoffice') {
      console.log(`  - Event "${event.summary}" has OOO event type`);
      return true;
    }
    
    // Also check for standard calendar events that have "free" availability
    // as these are often used for OOO
    if (event.transparency === 'transparent') {
      console.log(`  - Event "${event.summary}" has transparent time (doesn't block calendar)`);
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
        const existingEvents = await calendar.events.list({
          calendarId: teamCalendarId,
          timeMin: event.start.dateTime || event.start.date,
          timeMax: event.end.dateTime || event.end.date,
          q: userDisplayName // More relaxed query to find potential matches
        });

        const alreadySynced = existingEvents.data.items.some(existingEvent => 
          existingEvent.summary === eventTitle || 
          existingEvent.summary.includes(`${userDisplayName} - OOO`)
        );
        
        if (alreadySynced) {
          console.log(`  - Event already exists in team calendar, skipping`);
          results.skipped.push({
            calendarId: teamCalendarId,
            summary: eventTitle
          });
          continue;
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

module.exports = {
  getUserCalendars,
  getOOOEvents,
  syncOOOToTeamCalendars,
  updateSyncedEvents,
  deleteSyncedEvent
};