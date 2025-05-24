const { google } = require('googleapis');
require('dotenv').config();

// Configure Google OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Define scopes we need for Google Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',  // For reading user's calendars
  'https://www.googleapis.com/auth/calendar.events',    // For adding events to team calendars
];

// Generate authentication URL
const getAuthUrl = () => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // We need offline access to get refresh token
    scope: SCOPES,
    prompt: 'consent'
  });
};

// Get tokens from authorization code
const getTokens = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

// Set credentials to auth client
const setCredentials = (tokens) => {
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

// Refresh token if needed
const refreshAccessToken = async (refreshToken) => {
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
};

module.exports = {
  oauth2Client,
  getAuthUrl,
  getTokens,
  setCredentials,
  refreshAccessToken,
  SCOPES
};