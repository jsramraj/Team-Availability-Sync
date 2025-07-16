// To learn how to use this script, refer to the documentation:
// https://developers.google.com/apps-script/samples/automations/vacation-calendar

/*
Copyright 2022 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Set the ID of the team calendar to add events to. You can find the calendar's
// ID on the settings page.
let TEAM_CALENDAR_ID = 'TEAM_CALENDER_ID';

// Set the email address of the Google Group that contains everyone in the team.
// Ensure the group has less than 500 members to avoid timeouts.
// Change to an array in order to add indirect members frrm multiple groups, for example:
let GROUP_EMAIL = ['ENTER_GOOGLE_GROUP_EMAIL_HERE', 'ENTER_ANOTHER_GOOGLE_GROUP_EMAIL_HERE'];

// When the team member adds an event that contain any of these keywords in the summary, it will be added to the team calender.
// Feel free to customize this according to your need
let KEYWORDS = ['vacation', 'ooo', 'out of office', 'offline', 'wfh', 'wfo'];

// By default, this script scans events upto 3 months.
let MONTHS_IN_ADVANCE = 3;

let IMPORT_WORKING_LOCATION_EVENTS = false;
let IMPORT_OUT_OF_OFFICE_EVENTS = true;

// Triggers a team to the team email ID whenever a event is added to the team calender
let SHOULD_NOTIFY_TEAM = false;

// This will be mentioned in the email notification
let TEAM_NAME = 'Forestry Team'

let ONLY_DIRECT_MEMBERS = false;

/**
 * Sets up the script to run automatically every hour.
 */
function setup() {
  let triggers = ScriptApp.getProjectTriggers();
  if (triggers.length > 0) {
    throw new Error('Triggers are already setup.');
  }
  ScriptApp.newTrigger('sync').timeBased().everyHours(1).create();
  // Runs the first sync immediately.
  sync();
}

/**
 * Looks through all group members public calenders and add any out of office, work location type events
 * and also events that has the specified keyword
 */
function sync() {
  // Gets the list of users in the Google Group.
  let users = getAllMembers(GROUP_EMAIL);
  if (ONLY_DIRECT_MEMBERS) {
     users = GroupsApp.getGroupByEmail(GROUP_EMAIL).getUsers();
  }
  if (Array.isArray(GROUP_EMAIL)) {
    users = getUsersFromGroups(GROUP_EMAIL);
  }
  console.log('Found ' + users.length + ' users');

  syncEventsWithKeywords(users);
  syncOutofOfficeAndWorkLocationEvents(users);

  // Set the last run date to avoid scanning duplicate events
  let today = new Date();
  PropertiesService.getScriptProperties().setProperty('lastRun', today);

}

/**
 * Looks through the group members' public calendars and adds any
 * 'vacation' or 'out of office' events to the team calendar.
 */
function syncEventsWithKeywords(users) {
  // Defines the calendar event date range to search.
  let today = new Date();
  let maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + MONTHS_IN_ADVANCE);

  // Determines the time the the script was last run.
  let lastRun = PropertiesService.getScriptProperties().getProperty('lastRun');
  lastRun = lastRun ? new Date(lastRun) : null;

  // For each user, finds events having one or more of the keywords in the event
  // summary in the specified date range. Imports each of those to the team
  // calendar.
  users.forEach(function (user) {
    let username = user.getEmail().split('@')[0];
    console.log('Fetching events with keywords from ' + user.getUsername() + 's calender');
    KEYWORDS.forEach(function (keyword) {
      let events = findEvents(user, keyword, today, maxDate, lastRun);
      if (events.count > 0) {
        console.log('Got ' + events.count + ' events')
      }
      events.forEach(function (event) {
        if (SHOULD_NOTIFY_TEAM) {
          notifyTeamMembers(event, user);
        }
        importEvent(username, event);
      }); // End foreach event.
    }); // End foreach keyword.
  }); // End foreach user.
}


function syncOutofOfficeAndWorkLocationEvents(users) {
  users.forEach(function (user) {
    let username = user.getEmail().split('@')[0];
    console.log('Fetching special events from ' + username + 's calender');

    if (IMPORT_WORKING_LOCATION_EVENTS) {
      listAndImportAllEvents(user, 'workingLocation');
    }
    if (IMPORT_OUT_OF_OFFICE_EVENTS) {
      listAndImportAllEvents(user, 'outOfOffice');
    }
  }); // End foreach user.
}

function listAndImportAllEvents(user, eventType) {
  // Defines the calendar event date range to search.
  let today = new Date();
  let maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 1);

  // Determines the time the the script was last run.
  let lastRun = PropertiesService.getScriptProperties().getProperty('lastRun');
  lastRun = lastRun ? new Date(lastRun) : null;

  let username = user.getEmail().split('@')[0];
  //console.log(`Fetching ${eventType} events from ${username}'s calender`);

  var events = listEvents(user, eventType, today, maxDate, lastRun);

  if (events.count > 0) {
    console.log('Got ' + events.count + ' events')
  }
  events.forEach(function (event) {
    if (SHOULD_NOTIFY_TEAM) {
      notifyTeamMembers(event, user);
    }
    importEvent(username, event);
  }); // End foreach event.
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
    console.log(exception.message);
  }
}

/**
  * Parses working location properties of an event into a string.
  * See https://developers.google.com/calendar/api/v3/reference/events#resource
  */
function parseWorkingLocation(event) {
  if (event.eventType != "workingLocation") {
    throw new Error("'" + event.summary + "' is not a working location event.");
  }

  var location = 'No Location';
  const workingLocation = event.workingLocationProperties;
  if (workingLocation) {
    if (workingLocation.type === 'homeOffice') {
      location = 'Home';
    }
    if (workingLocation.type === 'officeLocation') {
      location = workingLocation.officeLocation.label;
    }
    if (workingLocation.type === 'customLocation') {
      location = workingLocation.customLocation.label;
    }
  }
  return location;
}

/**
 * Imports the given event from the user's calendar into the shared team
 * calendar.
 * @param {string} username The team member that is attending the event.
 * @param {Calendar.Event} event The event to import.
 */
function importEvent(username, event) {
  try {
    // Try to find the user's first name.
    // Normally every email has a firsttime_lastname
    username = username.split('_')[0];
    username = capitalizeFirstLetter(username);
  } catch (exception) {
    console.log(exception.message);
  }

  if (event.eventType == "workingLocation") {
    event.summary = '[' + username + '] ' + parseWorkingLocation(event);
  } else if (event.eventType == "outOfOffice") {
    event.summary = '[' + username + '] OOO';
  }
  else {
    event.summary = '[' + username + '] ' + event.summary;
  }

  event.organizer = {
    id: TEAM_CALENDAR_ID,
  };
  event.attendees = [];

  // If the event is not of type 'default', it can't be imported, so it needs
  // to be changed.
  if (event.eventType != 'default') {
    event.eventType = 'default';
    delete event.outOfOfficeProperties;
    delete event.focusTimeProperties;
    delete event.workingLocationProperties;
  }

  console.log('Importing: %s', event.summary);
  try {
    Calendar.Events.import(event, TEAM_CALENDAR_ID);
  } catch (e) {
    console.error('Error attempting to import event: %s. Skipping.',
      e.toString());
  }
}

/**
 * In a given user's calendar, looks for occurrences of the given keyword
 * in events within the specified date range and returns any such events
 * found.
 * @param {Session.User} user The user to retrieve events for.
 * @param {string} keyword The keyword to look for.
 * @param {Date} start The starting date of the range to examine.
 * @param {Date} end The ending date of the range to examine.
 * @param {Date} optSince A date indicating the last time this script was run.
 * @return {Calendar.Event[]} An array of calendar events.
 */
function findEvents(user, keyword, start, end, optSince) {
  let params = {
    q: keyword,
    timeMin: formatDateAsRFC3339(start),
    timeMax: formatDateAsRFC3339(end),
    showDeleted: true,
  };
  if (optSince) {
    // This prevents the script from examining events that have not been
    // modified since the specified date (that is, the last time the
    // script was run).
    params.updatedMin = formatDateAsRFC3339(optSince);
  }
  let pageToken = null;
  let events = [];
  do {
    params.pageToken = pageToken;
    let response;
    try {
      console.log(`Parameters for fetching events: ${JSON.stringify(params)}`);
      response = Calendar.Events.list(user.getEmail(), params);
    } catch (e) {
      console.error('Error retriving events for %s, %s: %s; skipping',
        user, keyword, e.toString());
      continue;
    }
    events = events.concat(response.items.filter(function (item) {
      return shouldImportEvent(user, keyword, item);
    }));
    pageToken = response.nextPageToken;
  } while (pageToken);
  return events;
}

/**
 * Determines if the given event should be imported into the shared team
 * calendar.
 * @param {Session.User} user The user that is attending the event.
 * @param {string} keyword The keyword being searched for.
 * @param {Calendar.Event} event The event being considered.
 * @return {boolean} True if the event should be imported.
 */
function shouldImportEvent(user, keyword, event) {
  // Filters out events where the keyword did not appear in the summary
  // (that is, the keyword appeared in a different field, and are thus
  // is not likely to be relevant).
  if (event.summary.toLowerCase().indexOf(keyword) < 0) {
    return false;
  }
  if (!event.organizer || event.organizer.email == user.getEmail()) {
    // If the user is the creator of the event, always imports it.
    return true;
  }
  // Only imports events the user has accepted.
  if (!event.attendees) return false;
  let matching = event.attendees.filter(function (attendee) {
    return attendee.self;
  });
  return matching.length > 0 && matching[0].responseStatus == 'accepted';
}

/**
 * Returns an RFC3339 formated date String corresponding to the given
 * Date object.
 * @param {Date} date a Date.
 * @return {string} a formatted date string.
 */
function formatDateAsRFC3339(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd\'T\'HH:mm:ssZ');
}

/**
* Get both direct and indirect members (and delete duplicates).
* @param {string} the e-mail address of the group.
* @return {object} direct and indirect members.
*/
function getAllMembers(groupEmail) {
  var users = [];

  try {
    var group = GroupsApp.getGroupByEmail(groupEmail);
    users = group.getUsers();
    var childGroups = group.getGroups();
    for (var i = 0; i < childGroups.length; i++) {
      var childGroup = childGroups[i];
      users = users.concat(getAllMembers(childGroup.getEmail()));
    }
  } catch (exception) {
    // probably a individual email
    users = users.concat(groupEmail);
  }
  // Remove duplicate members
  var uniqueUsers = [];
  var userEmails = {};
  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    if (!userEmails[user.getEmail()]) {
      uniqueUsers.push(user);
      userEmails[user.getEmail()] = true;
    }
  }
  return uniqueUsers;
}

function notifyTeamMembers(event, user) {
  let username = user.getUsername();
  try {
    username = username.split('_')[0];
    username = capitalizeFirstLetter(username);
  } catch (exception) {
    console.log(exception.message);
  }

  let subject = `[${TEAM_NAME}] `;
  if (event.eventType === "workingLocation") {
    subject += formEmailSubjectForWorkingLocation(event, username);
  } else if (event.eventType === "outOfOffice") {
    subject += formEmailSubjectForOutOfOffice(event, username);
  }
  else {
    if (event.status === 'confirmed') {
      subject += `${username} created an event '${event.summary}' @ ${new Date(event.start.dateTime).toDateString()} `;
    } else {
      subject += `${username} deleted an event '${event.summary}' @ ${new Date(event.start.dateTime).toDateString()} `;
    }
  }

  if (subject !== `[${TEAM_NAME}] `) {
    MailApp.sendEmail({
      to: GROUP_EMAIL,
      subject: subject
    });
  }

}

function formEmailSubjectForWorkingLocation(event, username) {
  if (event.status === 'confirmed') {
    return `${username} will be working from ${parseWorkingLocation(event)} @ ${event.start.getDate()}`;
  }
  return '';
}

function formEmailSubjectForOutOfOffice(event, username) {
  if (event.status === 'confirmed') {
    return `${username} will be OOO @ ${new Date(event.start.dateTime).toDateString()}`;
  } else {
    return `${username} cancelled a OOO event @ ${new Date(event.start.dateTime).toDateString()}`;
  }
}

/**
* Get indirect members from multiple groups (and delete duplicates).
* @param {array} the e-mail addresses of multiple groups.
* @return {object} indirect members of multiple groups.
*/
function getUsersFromGroups(groupEmails) {
  let users = [];
  for (let groupEmail of groupEmails) {
    let groupUsers = getAllMembers(groupEmail);// GroupsApp.getGroupByEmail(groupEmail).getUsers();
    for (let user of groupUsers) {
      if (!users.some(u => u.getEmail() === user.getEmail())) {
        users.push(user);
      }
    }
  }
  return users;
}

function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

