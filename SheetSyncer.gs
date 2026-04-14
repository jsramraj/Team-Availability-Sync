function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Team Availability')
    .addItem('Sync Calendar', 'updateLeaveSheet')
    .addItem('Sync Selected Leave Range', 'updateSelectedLeaveRange')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function updateLeaveSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  Logger.log("🚀 Script started");

  const syncConfig = getSheetSyncConfig(sheet);
  const calendarId = syncConfig.calendarId;
  const INCLUDE_WFH = syncConfig.includeWfh;

  if (!calendarId) {
    Logger.log("❌ Calendar ID not found");
    throw new Error('Calendar ID not found in first row');
  }

  const calendar = CalendarApp.getCalendarById(calendarId);

  // Clear existing data
  Logger.log("🧹 Clearing old data...");
  sheet.getRange(3, 2, sheet.getLastRow() - 2, sheet.getLastColumn() - 1).clearContent();

  // Get headers
  const header = sheet.getRange(2, 2, 1, sheet.getLastColumn() - 1).getValues()[0];
  const headerDates = header.map(h => new Date(h));
  Logger.log("📆 Header dates count: " + headerDates.length);

  // Get names
  const names = sheet.getRange(3, 1, sheet.getLastRow() - 2, 1).getValues().flat();
  Logger.log("👥 Total users: " + names.length);

  // Map names
  const nameRowMap = {};
  names.forEach((name, index) => {
    if (name) {
      nameRowMap[normalizePersonName(name)] = index + 3;
    }
  });

  Logger.log("🗺️ Name map created");

  // Date range
  const startDate = new Date(headerDates[0]);
  const endDate = new Date(headerDates[headerDates.length - 1]);
  endDate.setHours(23, 59, 59, 999);

  Logger.log("📅 Fetching events from " + startDate + " to " + endDate);

  const events = calendar.getEvents(startDate, endDate);
  Logger.log("📥 Total events fetched: " + events.length);

  let matchedEvents = 0;

  events.forEach(event => {
    const title = event.getTitle();

    const match = title.match(/\[(.*?)\]\s*(.*)/);
    if (!match) {
      Logger.log("⚠️ Skipped event (invalid format): " + title);
      return;
    }

    const name = match[1].trim();
    const status = normalizeStatus(match[2].trim());

    if (!INCLUDE_WFH && status === 'WFH') {
      Logger.log("⏭️ Skipping WFH event for: " + name);
      return;
    }

    const eventDate = new Date(event.getStartTime());

    let found = false;

    headerDates.forEach((date, colIndex) => {
      if (isSameDay(date, eventDate)) {
        const row = nameRowMap[normalizePersonName(name)];
        if (row) {
          sheet.getRange(row, colIndex + 2).setValue(status);
          matchedEvents++;
          found = true;
          Logger.log(`✅ Marked ${status} for ${name} on ${eventDate.toDateString()}`);
        } else {
          Logger.log(`❌ Name not found in sheet: ${name}`);
        }
      }
    });

    if (!found) {
      Logger.log(`⚠️ Date not found in header for event: ${title}`);
    }
  });

  Logger.log("🎯 Total matched events: " + matchedEvents);
  Logger.log("✅ Script completed");
}

function normalizeStatus(status) {
  status = status.toLowerCase();
  if (status.includes('wfh')) return 'WFH';
  if (status.includes('out')) return 'Out of Office';
  return status;
}

function updateSelectedLeaveRange() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const selection = sheet.getActiveRange();

  if (!selection) {
    throw new Error('Select a range that includes the name column and the header row with dates.');
  }

  Logger.log('🚀 Selected-range leave sync started');

  const syncConfig = getSheetSyncConfig(sheet);
  if (!syncConfig.calendarId) {
    throw new Error('Calendar ID not found in first row');
  }

  const selectionData = getSelectedLeaveRangeData(selection);
  const calendar = CalendarApp.getCalendarById(syncConfig.calendarId);

  resetSelectedCheckboxes(selectionData);

  const events = calendar.getEvents(selectionData.startDate, selectionData.endDate);
  Logger.log('📥 Total events fetched: ' + events.length);

  let matchedEvents = 0;

  events.forEach(event => {
    const parsedEvent = parseCalendarEvent(event);
    if (!parsedEvent) {
      Logger.log('⚠️ Skipped event (invalid format): ' + event.getTitle());
      return;
    }

    if (parsedEvent.status === 'WFH') {
      Logger.log('⏭️ Skipping WFH event for leave-only sheet: ' + parsedEvent.name);
      return;
    }

    const row = selectionData.nameRowMap[normalizePersonName(parsedEvent.name)];
    const dateKey = formatDateKey(event.getStartTime());
    const column = selectionData.dateColumnMap[dateKey];

    if (!row || !column) {
      return;
    }

    if (!selectionData.checkboxCells[row] || !selectionData.checkboxCells[row][column]) {
      Logger.log('⚠️ Target cell is not a checkbox for ' + parsedEvent.name + ' on ' + dateKey);
      return;
    }

    sheet.getRange(row, column).setValue(true);
    matchedEvents++;
    Logger.log('✅ Checked leave for ' + parsedEvent.name + ' on ' + dateKey);
  });

  Logger.log('🎯 Total matched leave events: ' + matchedEvents);
  Logger.log('✅ Selected-range leave sync completed');
}

function getSheetSyncConfig(sheet) {
  const config = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  let calendarId = '';
  let includeWfh = true;

  for (let i = 0; i < config.length; i++) {
    const key = config[i] ? config[i].toString().trim().toLowerCase() : '';
    const value = config[i + 1];

    if (key === 'team calender id' || key === 'team calendar id') {
      calendarId = value;
      Logger.log('📅 Calendar ID found: ' + calendarId);
    }

    if (key === 'sync wfh events') {
      includeWfh = String(value).toLowerCase() === 'true';
      Logger.log('🏠 INCLUDE_WFH: ' + includeWfh);
    }
  }

  return {
    calendarId: calendarId,
    includeWfh: includeWfh,
  };
}

function getSelectedLeaveRangeData(selection) {
  const values = selection.getValues();
  const validations = selection.getDataValidations();
  const headerRow = values[0];
  const dateColumnIndexes = [];

  headerRow.forEach((value, index) => {
    if (isValidDateValue(value)) {
      dateColumnIndexes.push(index);
    }
  });

  if (dateColumnIndexes.length === 0) {
    throw new Error('The first row of the selected range must contain date cells.');
  }

  const firstDateColumnIndex = dateColumnIndexes[0];
  let nameColumnIndex = 0;

  for (let index = 0; index < firstDateColumnIndex; index++) {
    if (headerRow[index] !== '') {
      nameColumnIndex = index;
    }
  }

  const dateColumnMap = {};
  dateColumnIndexes.forEach(index => {
    const headerDate = new Date(headerRow[index]);
    dateColumnMap[formatDateKey(headerDate)] = selection.getColumn() + index;
  });

  const nameRowMap = {};
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const rawName = values[rowIndex][nameColumnIndex];
    if (!rawName) {
      continue;
    }

    nameRowMap[normalizePersonName(rawName)] = selection.getRow() + rowIndex;
  }

  const checkboxCells = {};
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const sheetRow = selection.getRow() + rowIndex;
    checkboxCells[sheetRow] = {};

    dateColumnIndexes.forEach(columnIndex => {
      const validation = validations[rowIndex][columnIndex];
      const isCheckbox =
        validation &&
        validation.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX;

      checkboxCells[sheetRow][selection.getColumn() + columnIndex] = Boolean(isCheckbox);
    });
  }

  const startDate = new Date(headerRow[dateColumnIndexes[0]]);
  const endDate = new Date(headerRow[dateColumnIndexes[dateColumnIndexes.length - 1]]);
  endDate.setHours(23, 59, 59, 999);

  return {
    checkboxCells: checkboxCells,
    dateColumnMap: dateColumnMap,
    endDate: endDate,
    nameRowMap: nameRowMap,
    sheet: selection.getSheet(),
    startDate: startDate,
  };
}

function resetSelectedCheckboxes(selectionData) {
  Object.keys(selectionData.checkboxCells).forEach(rowKey => {
    const rowCells = selectionData.checkboxCells[rowKey];

    Object.keys(rowCells).forEach(columnKey => {
      if (rowCells[columnKey]) {
        selectionData.sheet
          .getRange(Number(rowKey), Number(columnKey))
          .setValue(false);
      }
    });
  });
}

function parseCalendarEvent(event) {
  const title = event.getTitle();
  const match = title.match(/\[(.*?)\]\s*(.*)/);

  if (!match) {
    return null;
  }

  return {
    name: match[1].trim(),
    status: normalizeStatus(match[2].trim()),
  };
}

function isValidDateValue(value) {
  return value instanceof Date && !isNaN(value.getTime());
}

function formatDateKey(date) {
  return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function normalizePersonName(name) {
  return name.toString().trim().toLowerCase();
}

// Helper function to compare dates
function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}