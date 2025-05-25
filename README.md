# OOO Calendar Sync Google Workspace Add-on

This Google Workspace Add-on automatically synchronizes your Out of Office (OOO) events from your personal calendar to team calendars, ensuring your team is always aware of your availability.

> **Note:** This project has been migrated from a Node.js application to a Google Workspace Add-on using Google Apps Script (GAS).

## Features

- Automatically syncs events with "OOO", "Out of Office", "Vacation", or "Leave" in the title or description
- Works directly within Google Calendar
- Simple setup process to select which team calendars should receive your OOO events
- Manual sync option with detailed results
- Automatic background sync every 6 hours

## Deployment Instructions

### Option 1: Deploy as a personal script (for testing)

1. Go to [Google Apps Script](https://script.google.com/home) and create a new project
2. Delete any code in the default `Code.gs` file
3. Copy and paste the contents of `Code.gs` from this repository into the editor
4. Create a new file called `appsscript.json` by clicking File > New > Script file
5. Copy and paste the contents of `appsscript.json` from this repository
6. Save the project with File > Save
7. Deploy the project:
   - Click Deploy > New deployment
   - Select "Deploy as Add-on" as the deployment type
   - Set deployment configuration to "Install add-on for myself" or "Install add-on for domain"
   - Click Deploy
8. After deployment, refresh your Google Calendar and look for the add-on in the side panel

### Option 2: Deploy to Google Workspace Marketplace (for your organization)

1. Follow steps 1-6 from Option 1
2. Create a Google Cloud Platform project:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Enable the Google Workspace Marketplace SDK
3. Configure the Google Workspace Marketplace SDK:
   - Set up your app's listing information, including name, description, and icons
   - Configure the app's URL and scopes based on your Google Apps Script project
4. Publish to Google Workspace Marketplace:
   - Complete the publisher verification process if needed
   - Submit your app for review
   - Once approved, your app will be available in the Google Workspace Marketplace

## Usage Instructions

1. Install the add-on from Google Workspace Marketplace or via direct deployment
2. Open Google Calendar
3. Click on the OOO Calendar Sync icon in the side panel
4. Click "Set Up Sync" to configure:
   - Enter your display name (how your name will appear in team calendars)
   - Select the team calendars where your OOO events should appear
5. Click "Save Configuration" to save settings and perform initial sync
6. Your OOO events will now automatically sync to selected team calendars

## Requirements

- Google Workspace account (G Suite)
- Access to one or more shared team calendars with write permissions

## Privacy & Security

- This add-on only accesses calendar data to perform the sync function
- No data is stored outside of your Google Workspace account
- Configuration settings are stored in user properties within Google Apps Script
- The add-on requires calendar read/write permissions to function properly

## Original Node.js Project

The original Node.js implementation has been deprecated in favor of the Google Workspace Add-on approach. The code remains in this repository for reference purposes but is no longer maintained.