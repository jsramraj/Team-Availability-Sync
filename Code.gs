/**
 * Team Availability Sync - Google Workspace Add-on
 *
 * This Add-on automatically syncs Out of Office (OOO) events
 * from a user's calendar to their team calendars.
 */

const APP_VERSION = '1.0.7'; // Update this when making significant changes

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
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("Team Availability Sync")
      .setSubtitle("Sync your OOO events to team calendars")
      .setImageUrl(
        "https://raw.githubusercontent.com/MuscleMadness/datasource/main/team-calender.jpeg"
      )
  );

  // Add main section
  const mainSection = CardService.newCardSection().addWidget(
    CardService.newTextParagraph().setText(
      "This add-on automatically syncs your Out of Office events to selected team calendars."
    )
  );

  // Add setup button if not configured yet
  const userProperties = PropertiesService.getUserProperties();
  const isConfigured = userProperties.getProperty("isConfigured");

  if (!isConfigured) {
    mainSection.addWidget(
      CardService.newTextParagraph().setText(
        "You need to configure which team calendars should receive your OOO events."
      )
    );

    mainSection.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("Set Up Sync")
          .setOnClickAction(
            CardService.newAction().setFunctionName("showSetupCard")
          )
      )
    );
  } else {
    // Show configured calendars and sync status
    mainSection.addWidget(
      CardService.newTextParagraph().setText(
        "Your OOO events are being synced to team calendars."
      )
    );

    let lastSync = userProperties.getProperty("lastSyncTime");
    let lastSyncDisplay = "Never";
    if (lastSync) {
      try {
        const defaultCalendar = CalendarApp.getDefaultCalendar();

        // Use user's time zone for formatting
        lastSyncDisplay = Utilities.formatDate(
          new Date(lastSync),
          defaultCalendar.getTimeZone(),
          "yyyy-MM-dd HH:mm:ss 'z'"
        );
      } catch (e) {
        lastSyncDisplay = lastSync;
      }
    }
    mainSection.addWidget(
      CardService.newTextParagraph().setText(
        "Last synced at: " + lastSyncDisplay
      )
    );

    mainSection.addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("Sync Now")
            .setOnClickAction(
              CardService.newAction().setFunctionName("syncEvents")
            )
        )
        .addButton(
          CardService.newTextButton()
            .setText("Modify Settings")
            .setOnClickAction(
              CardService.newAction().setFunctionName("showSetupCard")
            )
        )
    );
  }

  mainSection.addWidget(
    CardService.newTextParagraph().setText(
      "Version: " + APP_VERSION
    )
  );

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
  card.setHeader(
    CardService.newCardHeader()
      .setTitle("Set Up Team Availability Sync")
      .setSubtitle("Select team calendars for sync")
  );

  // Create section for display name
  const displayNameSection =
    CardService.newCardSection().setHeader("Your Display Name");

  // Get user's name from their Google account
  const user = Session.getActiveUser();
  const userEmail = user.getEmail();
  const userName = userEmail.split("@")[0]; // Basic fallback

  // Get saved display name if available
  const userProperties = PropertiesService.getUserProperties();
  const savedDisplayName =
    userProperties.getProperty("displayName") || userName;

  displayNameSection.addWidget(
    CardService.newTextInput()
      .setFieldName("displayName")
      .setTitle("Display Name")
      .setValue(savedDisplayName)
      .setHint("How your name should appear in team calendars")
  );

  card.addSection(displayNameSection);

  // Create section for sync settings
  const syncSettingsSection =
    CardService.newCardSection().setHeader("Sync Settings");

  // Get saved sync frequency or use default (6 hours)
  const savedSyncFrequency = userProperties.getProperty("syncFrequency") || "6";
  const shouldImportWfhEvents = userProperties.getProperty("shouldImportWfhEvents") === "true";

  // Add dropdown for sync frequency
  syncSettingsSection.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle("Automatic Sync Frequency")
      .setFieldName("syncFrequency")
      .addItem("1 hour", "1", savedSyncFrequency === "1")
      .addItem("2 hours", "2", savedSyncFrequency === "2")
      .addItem("4 hours", "4", savedSyncFrequency === "4")
      .addItem("6 hours", "6", savedSyncFrequency === "6")
      .addItem("12 hours", "12", savedSyncFrequency === "12")
      .addItem("24 hours", "24", savedSyncFrequency === "24")
  );

    // ✅ Add “Include WFH Events” checkbox
  syncSettingsSection.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.CHECK_BOX)
      .setTitle("Include WFH Events")
      .setFieldName("shouldImportWfhEvents")
      .addItem("Import events marked as Work From Home", "true", shouldImportWfhEvents)
  );

  card.addSection(syncSettingsSection);


  // Create section for calendar selection
  const calendarSection = CardService.newCardSection().setHeader(
    "Select Team Calendars"
  );

  // Get all available calendars
  const calendars = CalendarApp.getAllCalendars();
  const savedCalendarIds = getSavedCalendarIds();

  if (calendars.length > 0) {
    calendars.forEach(function (calendar) {
      // Only include calendars where the user has write access
      // Check if the calendar can be modified
      try {
        // Try to get access level differently
        const calendarId = calendar.getId();
        const isSelected = savedCalendarIds.indexOf(calendarId) !== -1;
        const isWritable = calendar.isOwnedByMe();

        if (isWritable) {
          calendarSection.addWidget(
            CardService.newSelectionInput()
              .setType(CardService.SelectionInputType.CHECK_BOX)
              .setFieldName("calendar_" + calendarId)
              .addItem(calendar.getName(), calendarId, isSelected)
          );
        } else {
          // Add calendar with disabled checkbox for read-only calendars
          calendarSection.addWidget(
            CardService.newSelectionInput()
              .setType(CardService.SelectionInputType.CHECK_BOX)
              .setFieldName("calendar_" + calendarId)
              .addItem(calendar.getName() + " (Read Only)", calendarId, false)
              .setEnabled(false)
          );
        }
      } catch (error) {
        console.error("Error checking calendar access: " + error);
      }
    });
  } else {
    calendarSection.addWidget(
      CardService.newTextParagraph().setText(
        "No writable calendars found. Please create a team calendar or ask for write permissions."
      )
    );
  }

  card.addSection(calendarSection);

  // Add save button
  const buttonSection = CardService.newCardSection();
  buttonSection.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText("Save Configuration")
          .setOnClickAction(
            CardService.newAction().setFunctionName("saveConfiguration")
          )
      )
      .addButton(
        CardService.newTextButton()
          .setText("Cancel")
          .setOnClickAction(
            CardService.newAction().setFunctionName("onHomepage")
          )
      )
  );

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
  const savedCalendarIds = userProperties.getProperty("teamCalendarIds");

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
  userProperties.setProperty("displayName", displayName);

  // Save sync frequency
  const syncFrequency = formInputs.syncFrequency.stringInputs.value[0];
  userProperties.setProperty("syncFrequency", syncFrequency);

  // ✅ Save Include WFH setting
  const shouldImportWfhEvents =
    formInputs.shouldImportWfhEvents &&
    formInputs.shouldImportWfhEvents.stringInputs.value.includes("true");
  userProperties.setProperty("shouldImportWfhEvents", shouldImportWfhEvents);

  // Save selected calendars
  const selectedCalendarIds = [];
  for (let key in formInputs) {
    if (key.startsWith("calendar_")) {
      const selection = formInputs[key].stringInputs.value;
      if (selection && selection.length > 0) {
        selectedCalendarIds.push(selection[0]);
      }
    }
  }

  userProperties.setProperty(
    "teamCalendarIds",
    JSON.stringify(selectedCalendarIds)
  );
  userProperties.setProperty("isConfigured", "true");

  // Perform initial sync
  syncEvents();

  // Set up automatic sync trigger
  setupTrigger();

  // Return to homepage
  return createHomepageCard();
}

function syncEvents(e) {
  const userProperties = PropertiesService.getUserProperties();
  const teamCalendarIds = JSON.parse(
    userProperties.getProperty("teamCalendarIds") || "[]"
  );
  const displayName = userProperties.getProperty("displayName");

  if (!teamCalendarIds.length) {
    return createNotificationCard(
      "No team calendars configured",
      "Please set up team calendars to sync with."
    );
  }

  try {
    // Get the user's primary calendar
    const userCalendar = CalendarApp.getDefaultCalendar();

    const now = new Date();
    // Get the last sync time, if available
    let lastSyncStr = userProperties.getProperty("lastSyncTime");
    let lastSyncTime = lastSyncStr ? new Date(lastSyncStr) : now;
    Logger.log(lastSyncTime);

    // If last sync time is older than 89 days, clamp it
    if (lastSyncStr) {
      const maxAgeMs = 10 * 24 * 60 * 60 * 1000; // 89 days
      const oldestAllowed = new Date(now.getTime() - maxAgeMs);
      if (lastSyncTime < oldestAllowed) {
        Logger.log(
          `Last sync too old (${lastSyncTime}). Clamping to ${now}.`
        );
        lastSyncTime = oldestAllowed;
      }
    }

    // If this is the first sync or last sync is too old, get all events for the next 3 months
    const threeMonthsLater = new Date(
      now.getFullYear(),
      now.getMonth() + 3,
      now.getDate()
    );

    // Store current sync time for the next sync operation
    const currentSyncTime = now;

    // Keep track of all current OOO events in the user's calendar
    const currentOooEventIds = new Map();

    // Get events from the primary calendar
    let events;
    if (lastSyncTime && now - lastSyncTime < 90 * 24 * 60 * 60 * 1000) {
      // If last sync was within 90 days
      console.info("Getting events updated since: " + lastSyncTime);
      // events = userCalendar.getEvents(lastSyncTime, threeMonthsLater);
    } else {
      console.info("Getting all events for the next 3 months");
      // events = userCalendar.getEvents(now, threeMonthsLater);
    }

    const user = Session.getActiveUser();
    const defaultEvents = listEvents(user, 'default', now, threeMonthsLater, lastSyncTime);
    const eventsWithOOOType = listEvents(user, 'outOfOffice', now, threeMonthsLater, lastSyncTime);
    events = [...defaultEvents, ...eventsWithOOOType];

    console.log('Got ' + events?.length + ' events')

    // Filter for OOO events (including PTO)
    const oooEvents = events.filter(function (event) {
      const title = (event.summary ?? '').toLowerCase();

      const isOoo =
        title.includes("ooo") ||
        title.includes("out of office") ||
        title.includes("vacation") ||
        title.includes("leave") ||
        title.includes("pto") ||
        title.includes("wfh") ||
        title.includes("work from home");

      if (isOoo) {
        // Store this event's ID as a current OOO event
        currentOooEventIds.set(event.getId(), true);
      }

      return isOoo;
    });

    const shouldImportWfhEvents = userProperties.getProperty('shouldImportWfhEvents') === 'true';
    let wfhEvents;
    let allEventsToImport = [...oooEvents];
    if (shouldImportWfhEvents) {
      const workingLocationEvents = listEvents(user, 'workingLocation', now, threeMonthsLater, lastSyncTime);
      wfhEvents = filterWfhEvents(workingLocationEvents);
      allEventsToImport = [...allEventsToImport, ...wfhEvents];
    }

    if (allEventsToImport.length > 0) {
      allEventsToImport.forEach(function (event) {
        importEvent(displayName, event, teamCalendarIds);
      });

      notificationCard = createNotificationCard(
        "Sync Completed",
        "Successfully synced " +
          allEventsToImport.length +
          " events (" +
          oooEvents.length +
          " OOO" +
          (shouldImportWfhEvents ? " + " + wfhEvents.length + " WFH" : "") +
          ") across " +
          teamCalendarIds.length +
          " team calendars."
      );
    } else {
      console.log("No events to sync");
      notificationCard = createNotificationCard(
        "No new OOO or WFH Events Found",
        shouldImportWfhEvents
          ? 'No new OOO or WFH events were found in your calendar. Add events with "OOO", "Out of Office", "Vacation", or mark working location as "Home".'
          : 'No new OOO events were found in your calendar. Add events with "OOO", "Out of Office", or "Vacation" in the title.'
      );
    }

    // Store the current sync time for the next sync operation
    userProperties.setProperty("lastSyncTime", currentSyncTime.toISOString());
    userProperties.setProperty("lastSync", currentSyncTime.toLocaleString());

    return notificationCard;
  } catch (error) {
    console.error("Error syncing to calendar : " + error);

    return createNotificationCard(
      "Error During Sync",
      "An error occurred during sync: " + error.toString()
    );
  }
}

function filterWfhEvents(workingLocationEvents) {
  console.log(workingLocationEvents.length);

  const wfhEvents = workingLocationEvents.filter(e => {
    console.log(e.workingLocationProperties?.type);
    return e.workingLocationProperties?.type === 'homeOffice';
  });

  console.log(wfhEvents.length);
  return wfhEvents;
  // const wfhEvents = workingLocationEvents.filter(e => {
  //   console.log(e);
  //   const workingLocationProps = e.workingLocationProperties;
  //   if (!workingLocationProps) return false;

  //   // Can be home office, custom location, or office
  //   const home = workingLocationProps.homeOffice;
  //   const custom = workingLocationProps.customLocation?.label;
  //   const office = workingLocationProps.officeLocation?.buildingId;

  //   // Check if any indicate "Home"
  //   var wfhEvent = (
  //     (home && home === true) ||
  //     (custom && custom.toLowerCase().includes('home')) ||
  //     (office && office.toLowerCase().includes('home'))
  //   );
  //   return wfhEvent;
  // });
  // return wfhEvents;
}

function importEvent(username, event, teamCalendarIds) {
  event.summary = '[' + username + '] ' + event.summary;


  event.attendees = [];

  // If the event is not of type 'default', it can't be imported, so it needs
  // to be changed.
  if (event.eventType != 'default') {
    event.eventType = 'default';
    delete event.outOfOfficeProperties;
    delete event.focusTimeProperties;
    delete event.workingLocationProperties;
  }

  teamCalendarIds.forEach(function (calenderId) {
    event.organizer = {
      id: calenderId,
    };
    console.info('Importing: %s', event.summary);
    try {
      Calendar.Events.import(event, calenderId);
    } catch (e) {
      console.error('Error attempting to import event: %s. Skipping.',
        e.toString());
    }
  })
}

function listEvents(user, eventType = 'default', startDate, endDate, optSince) {
  // Query parameters for the list request.
  const params = {
    eventTypes: [eventType],
    showDeleted: true,
    singleEvents: true,
    timeMax: formatDateAsRFC3339(endDate),
    timeMin: formatDateAsRFC3339(startDate),
  }
  if (optSince) {
    // This prevents the script from examining events that have not been
    // modified since the specified date (that is, the last time the
    // script was run).
    params.updatedMin = formatDateAsRFC3339(optSince);
  }

  try {
    var response = Calendar.Events.list(user.getEmail(), params);
    return response.items;
  } catch (exception) {
      console.error('Error importing events: %s. Skipping.',
        exception.message);
  }
}

function formatDateAsRFC3339(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd\'T\'HH:mm:ssZ');
}

/**
 * Creates a notification card.
 */
function createNotificationCard(title, message) {
  const card = CardService.newCardBuilder();

  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(message))
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("Back to Home")
          .setOnClickAction(
            CardService.newAction().setFunctionName("onHomepage")
          )
      )
    );

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
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "syncEvents") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Get user-configured sync frequency (in hours) or use default (6 hours)
  const userProperties = PropertiesService.getUserProperties();
  const syncFrequency =
    parseInt(userProperties.getProperty("syncFrequency")) || 6;

  // Create a new trigger to run at the specified frequency
  ScriptApp.newTrigger("syncEvents")
    .timeBased()
    .everyHours(syncFrequency)
    .create();

  console.info(
    "Trigger set up: Team Availability Sync will run every " +
    syncFrequency +
    " hours"
  );
}
