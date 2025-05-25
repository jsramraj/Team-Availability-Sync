/**
 * Team Availability Sync - Google Workspace Add-on
 * 
 * This Add-on automatically syncs Out of Office (OOO) events 
 * from a user's calendar to their team calendars.
 */

/**
 * Runs when the add-on is installed.
 */
function onInstall(e) {
  onHomepage(e);
}

/**
 * Runs when the add-on is opened in Google Calendar.
 */
function onHomepage(e) {
  return createHomepageCard();
}

/**
 * Creates the main homepage card for the add-on.
 */
function createHomepageCard() {
  const card = CardService.newCardBuilder();
  
  // Add header
  card.setHeader(CardService.newCardHeader()
    .setTitle('Team Availability Sync')
    .setSubtitle('Sync your OOO events to team calendars')
    .setImageUrl('https://raw.githubusercontent.com/MuscleMadness/datasource/main/team-calender.png'));
  
  // Add main section
  const mainSection = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph()
      .setText('This add-on automatically syncs your Out of Office events to selected team calendars.'));
  
  // Add setup button if not configured yet
  const userProperties = PropertiesService.getUserProperties();
  const isConfigured = userProperties.getProperty('isConfigured');
  
  if (!isConfigured) {
    mainSection.addWidget(CardService.newTextParagraph()
      .setText('You need to configure which team calendars should receive your OOO events.'));
    
    mainSection.addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Set Up Sync')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('showSetupCard'))));
  } else {
    // Show configured calendars and sync status
    mainSection.addWidget(CardService.newTextParagraph()
      .setText('Your OOO events are being synced to team calendars.'));
    
    const lastSync = userProperties.getProperty('lastSync') || 'Never';
    mainSection.addWidget(CardService.newTextParagraph()
      .setText('Last synced: ' + lastSync));
    
    mainSection.addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Sync Now')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('syncEvents')))
      .addButton(CardService.newTextButton()
        .setText('Modify Settings')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('showSetupCard'))));
  }
  
  card.addSection(mainSection);
  
  return CardService.newUniversalActionResponseBuilder()
    .displayAddOnCards([card.build()])
    .build();
}

/**
 * Shows the setup card to configure team calendars.
 */
function showSetupCard(e) {
  const card = CardService.newCardBuilder();
  
  // Add header
  card.setHeader(CardService.newCardHeader()
    .setTitle('Set Up Team Availability Sync')
    .setSubtitle('Select team calendars for sync'));
  
  // Create section for display name
  const displayNameSection = CardService.newCardSection()
    .setHeader('Your Display Name');
  
  // Get user's name from their Google account
  const user = Session.getActiveUser();
  const userEmail = user.getEmail();
  const userName = userEmail.split('@')[0]; // Basic fallback
  
  // Get saved display name if available
  const userProperties = PropertiesService.getUserProperties();
  const savedDisplayName = userProperties.getProperty('displayName') || userName;
  
  displayNameSection.addWidget(CardService.newTextInput()
    .setFieldName('displayName')
    .setTitle('Display Name')
    .setValue(savedDisplayName)
    .setHint('How your name should appear in team calendars'));
  
  card.addSection(displayNameSection);
  
  // Create section for sync settings
  const syncSettingsSection = CardService.newCardSection()
    .setHeader('Sync Settings');
  
  // Get saved sync frequency or use default (6 hours)
  const savedSyncFrequency = userProperties.getProperty('syncFrequency') || '6';
  
  // Add dropdown for sync frequency
  syncSettingsSection.addWidget(CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Automatic Sync Frequency')
    .setFieldName('syncFrequency')
    .addItem('1 hour', '1', savedSyncFrequency === '1')
    .addItem('2 hours', '2', savedSyncFrequency === '2')
    .addItem('4 hours', '4', savedSyncFrequency === '4')
    .addItem('6 hours', '6', savedSyncFrequency === '6')
    .addItem('12 hours', '12', savedSyncFrequency === '12')
    .addItem('24 hours', '24', savedSyncFrequency === '24'));
  
  card.addSection(syncSettingsSection);
  
  // Create section for calendar selection
  const calendarSection = CardService.newCardSection()
    .setHeader('Select Team Calendars');
  
  // Get all available calendars
  const calendars = CalendarApp.getAllCalendars();
  const savedCalendarIds = getSavedCalendarIds();
  
  if (calendars.length > 0) {
    calendars.forEach(function(calendar) {
      // Only include calendars where the user has write access
      // Check if the calendar can be modified
      try {
        // Try to get access level differently
        const calendarId = calendar.getId();
        const isSelected = savedCalendarIds.indexOf(calendarId) !== -1;
        const isWritable = calendar.isOwnedByMe();
        
        if (isWritable) {
          calendarSection.addWidget(CardService.newSelectionInput()
            .setType(CardService.SelectionInputType.CHECK_BOX)
            .setFieldName('calendar_' + calendarId)
            .addItem(calendar.getName(), calendarId, isSelected));
        } else {
          // Add calendar with disabled checkbox for read-only calendars
          calendarSection.addWidget(CardService.newSelectionInput()
            .setType(CardService.SelectionInputType.CHECK_BOX)
            .setFieldName('calendar_' + calendarId)
            .addItem(calendar.getName() + ' (Read Only)', calendarId, false)
            .setEnabled(false));
        }
      } catch (error) {
        Logger.log('Error checking calendar access: ' + error);
      }
    });
  } else {
    calendarSection.addWidget(CardService.newTextParagraph()
      .setText('No writable calendars found. Please create a team calendar or ask for write permissions.'));
  }
  
  card.addSection(calendarSection);
  
  // Add save button
  const buttonSection = CardService.newCardSection();
  buttonSection.addWidget(CardService.newButtonSet()
    .addButton(CardService.newTextButton()
      .setText('Save Configuration')
      .setOnClickAction(CardService.newAction()
        .setFunctionName('saveConfiguration')))
    .addButton(CardService.newTextButton()
      .setText('Cancel')
      .setOnClickAction(CardService.newAction()
        .setFunctionName('onHomepage'))));
  
  card.addSection(buttonSection);
  
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}

/**
 * Gets the previously saved calendar IDs.
 */
function getSavedCalendarIds() {
  const userProperties = PropertiesService.getUserProperties();
  const savedCalendarIds = userProperties.getProperty('teamCalendarIds');
  
  if (savedCalendarIds) {
    return JSON.parse(savedCalendarIds);
  }
  
  return [];
}

/**
 * Saves the user's configuration.
 */
function saveConfiguration(e) {
  const formInputs = e.commonEventObject.formInputs;
  const userProperties = PropertiesService.getUserProperties();
  
  // Save display name
  const displayName = formInputs.displayName.stringInputs.value[0];
  userProperties.setProperty('displayName', displayName);
  
  // Save sync frequency
  const syncFrequency = formInputs.syncFrequency.stringInputs.value[0];
  userProperties.setProperty('syncFrequency', syncFrequency);
  
  // Save selected calendars
  const selectedCalendarIds = [];
  for (let key in formInputs) {
    if (key.startsWith('calendar_')) {
      const selection = formInputs[key].stringInputs.value;
      if (selection && selection.length > 0) {
        selectedCalendarIds.push(selection[0]);
      }
    }
  }
  
  userProperties.setProperty('teamCalendarIds', JSON.stringify(selectedCalendarIds));
  userProperties.setProperty('isConfigured', 'true');
  
  // Perform initial sync
  syncEvents();
  
  // Set up automatic sync trigger
  setupTrigger();
  
  // Return to homepage
  return createHomepageCard();
}

/**
 * Syncs OOO events to team calendars.
 */
function syncEvents(e) {
  const userProperties = PropertiesService.getUserProperties();
  const teamCalendarIds = JSON.parse(userProperties.getProperty('teamCalendarIds') || '[]');
  const displayName = userProperties.getProperty('displayName');
  
  if (!teamCalendarIds.length) {
    return createNotificationCard('No team calendars configured', 
      'Please set up team calendars to sync with.');
  }
  
  try {
    // Get the user's primary calendar
    const userCalendar = CalendarApp.getDefaultCalendar();
    
    // Get the last sync time, if available
    const lastSyncStr = userProperties.getProperty('lastSyncTime');
    let lastSyncTime = lastSyncStr ? new Date(lastSyncStr) : null;
    
    // If this is the first sync or last sync is too old, get all events for the next 3 months
    const now = new Date();
    const threeMonthsLater = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
    
    // Store current sync time for the next sync operation
    const currentSyncTime = now;
    
    // Keep track of all current OOO events in the user's calendar
    const currentOooEventIds = new Map();
    
    // Get events from the primary calendar
    let events;
    if (lastSyncTime && (now - lastSyncTime) < (90 * 24 * 60 * 60 * 1000)) { // If last sync was within 90 days
      Logger.log('Getting events updated since: ' + lastSyncTime);
      events = userCalendar.getEvents(lastSyncTime, threeMonthsLater);
    } else {
      Logger.log('Getting all events for the next 3 months');
      events = userCalendar.getEvents(now, threeMonthsLater);
    }
    
    // Filter for OOO events
    const oooEvents = events.filter(function(event) {
      const title = event.getTitle().toLowerCase();
      const description = event.getDescription() ? event.getDescription().toLowerCase() : '';
      
      const isOoo = title.includes('ooo') || 
                    title.includes('out of office') || 
                    title.includes('vacation') || 
                    title.includes('leave') ||
                    description.includes('ooo') ||
                    description.includes('out of office');
      
      if (isOoo) {
        // Store this event's ID as a current OOO event
        currentOooEventIds.set(event.getId(), true);
      }
      
      return isOoo;
    });
    
    // Process events
    let syncedCount = 0;
    let removedCount = 0;
    
    // Sync new/updated OOO events to team calendars
    if (oooEvents.length > 0) {
      teamCalendarIds.forEach(function(calendarId) {
        try {
          const teamCalendar = CalendarApp.getCalendarById(calendarId);
          
          // Create a mapping of existing synced events in this team calendar
          const syncedEventsMap = new Map();
          
          // Get all events in the team calendar that match our sync pattern
          const existingTeamEvents = teamCalendar.getEvents(
            now, 
            threeMonthsLater,
            {search: displayName + ' - '});
          
          // Store existing events in a map for quick lookup
          existingTeamEvents.forEach(function(teamEvent) {
            const title = teamEvent.getTitle();
            const description = teamEvent.getDescription() || '';
            
            // Only process events that were synced by this add-on
            if (title.startsWith(displayName + ' - ') && 
                description.includes('Automatically synced from ' + displayName)) {
              
              // Extract the original title (remove the displayName prefix)
              const originalTitle = title.substring((displayName + ' - ').length);
              
              // Store team event with a key that can be recreated from source events
              const syncKey = originalTitle + '|' + teamEvent.getStartTime().getTime() + '|' + teamEvent.getEndTime().getTime();
              syncedEventsMap.set(syncKey, teamEvent);
            }
          });
          
          // Process each OOO event from the user's calendar
          oooEvents.forEach(function(event) {
            // Create a key for this event
            const eventKey = event.getTitle() + '|' + event.getStartTime().getTime() + '|' + event.getEndTime().getTime();
            
            // Check if this event already exists in the team calendar
            const existingEvent = syncedEventsMap.get(eventKey);
            
            if (!existingEvent) {
              // Create new event in team calendar
              teamCalendar.createEvent(
                displayName + ' - ' + event.getTitle(),
                event.getStartTime(),
                event.getEndTime(),
                {
                  description: (event.getDescription() || '') + '\n\nAutomatically synced from ' + displayName + '\'s calendar',
                  location: event.getLocation(),
                  guests: event.getGuestList().map(guest => guest.getEmail()).join(','),
                  sendInvites: false
                }
              );
              syncedCount++;
            } else {
              // Mark this event as processed
              syncedEventsMap.delete(eventKey);
            }
          });
          
          // Remove any synced events that no longer exist in the source calendar
          syncedEventsMap.forEach(function(teamEvent) {
            teamEvent.deleteEvent();
            removedCount++;
          });
          
        } catch (error) {
          Logger.log('Error syncing to calendar ' + calendarId + ': ' + error);
        }
      });
    } else {
      // No OOO events found, remove all previously synced events
      teamCalendarIds.forEach(function(calendarId) {
        try {
          const teamCalendar = CalendarApp.getCalendarById(calendarId);
          
          // Get all events in the team calendar that match our sync pattern
          const existingTeamEvents = teamCalendar.getEvents(
            now, 
            threeMonthsLater,
            {search: displayName + ' - '});
          
          // Delete events that were synced by this add-on
          existingTeamEvents.forEach(function(teamEvent) {
            const title = teamEvent.getTitle();
            const description = teamEvent.getDescription() || '';
            
            if (title.startsWith(displayName + ' - ') && 
                description.includes('Automatically synced from ' + displayName)) {
              teamEvent.deleteEvent();
              removedCount++;
            }
          });
          
        } catch (error) {
          Logger.log('Error removing synced events from calendar ' + calendarId + ': ' + error);
        }
      });
    }
    
    // Store the current sync time for the next sync operation
    userProperties.setProperty('lastSyncTime', currentSyncTime.toISOString());
    userProperties.setProperty('lastSync', currentSyncTime.toLocaleString());
    
    // Return notification
    if (syncedCount > 0 && removedCount > 0) {
      return createNotificationCard('Sync Completed', 
        'Successfully synced ' + syncedCount + ' new OOO events and removed ' + removedCount + 
        ' cancelled events across ' + teamCalendarIds.length + ' team calendars.');
    } else if (syncedCount > 0) {
      return createNotificationCard('Sync Completed', 
        'Successfully synced ' + syncedCount + ' OOO events to ' + teamCalendarIds.length + ' team calendars.');
    } else if (removedCount > 0) {
      return createNotificationCard('Sync Completed', 
        'Successfully removed ' + removedCount + ' cancelled OOO events from ' + teamCalendarIds.length + ' team calendars.');
    } else if (oooEvents.length === 0) {
      return createNotificationCard('No OOO Events Found', 
        'No OOO events were found in your calendar. Add events with "OOO", "Out of Office", or "Vacation" in the title.');
    } else {
      return createNotificationCard('No Changes Detected', 
        'All OOO events are already synced to team calendars.');
    }
  } catch (error) {
    return createNotificationCard('Error During Sync', 
      'An error occurred during sync: ' + error.toString());
  }
}

/**
 * Creates a notification card.
 */
function createNotificationCard(title, message) {
  const card = CardService.newCardBuilder();
  
  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(message))
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Back to Home')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('onHomepage'))));
  
  card.setHeader(CardService.newCardHeader().setTitle(title));
  card.addSection(section);
  
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}

/**
 * Set up a trigger to sync OOO events periodically.
 */
function setupTrigger() {
  // Delete any existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncEvents') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Get user-configured sync frequency (in hours) or use default (6 hours)
  const userProperties = PropertiesService.getUserProperties();
  const syncFrequency = parseInt(userProperties.getProperty('syncFrequency')) || 6;
  
  // Create a new trigger to run at the specified frequency
  ScriptApp.newTrigger('syncEvents')
    .timeBased()
    .everyHours(syncFrequency)
    .create();
    
  Logger.log('Trigger set up: Team Availability Sync will run every ' + syncFrequency + ' hours');
}