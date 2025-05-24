# Team Calendar OOO Sync

A Node.js application that automatically syncs individuals' Out of Office (OOO) events from their personal Google Calendar to designated team calendars.

## Features

- OAuth 2.0 authentication with Google Calendar API
- Smart detection of Out of Office events based on keywords
- Sync OOO events to multiple team calendars
- Manual and automatic sync options (every 6 hours)
- User-friendly interface for configuration

## Prerequisites

- Node.js (v14 or higher)
- Google Cloud Platform account with Calendar API enabled
- Google OAuth 2.0 credentials

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/team-calender.git
cd team-calender
```

2. Install dependencies:
```
npm install
```

3. Create a `.env` file in the root directory with your Google API credentials:
```
CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
REDIRECT_URI=http://localhost:3000/auth/callback
PORT=3000
```

## Google API Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Calendar API
4. Configure the OAuth consent screen
5. Create OAuth 2.0 credentials (Web application type)
6. Add `http://localhost:3000/auth/callback` as an authorized redirect URI
7. Copy the Client ID and Client Secret to your `.env` file

## Usage

1. Start the application:
```
node index.js
```

2. Open your browser and navigate to `http://localhost:3000`
3. Click "Get Started" and log in with your Google account
4. Configure your sync settings:
   - Enter your display name
   - Select team calendars to sync with
   - Enable automatic sync if desired
5. Click "Save Configuration" to start the initial sync

## How it Works

1. The application uses the Google Calendar API to detect events that look like Out of Office time (based on keywords like "OOO", "vacation", "leave", etc.)
2. When an OOO event is detected, it creates corresponding events in the selected team calendars
3. The event in the team calendar is marked with the user's name and "OOO" prefix
4. If automatic sync is enabled, the app will check for new or modified OOO events every 6 hours

## Permissions

The application requires the following Google Calendar permissions:
- `https://www.googleapis.com/auth/calendar.readonly` - To read your personal calendar events
- `https://www.googleapis.com/auth/calendar.events` - To create events in team calendars

## Deployment

For production deployment, consider:
- Using a database to store user configurations instead of in-memory storage
- Setting up proper session management with a production-ready session store
- Implementing proper error handling and logging
- Using HTTPS with a valid SSL certificate

## License

MIT