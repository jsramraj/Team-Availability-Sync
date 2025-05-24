# Resolving "Access Blocked" for Team Availability Sync

This guide helps you resolve the "Access blocked: Team Availability Sync has not completed the Google verification process" error.

## Why You're Seeing This Error

When you create a new OAuth application in Google Cloud Platform, it starts in "Testing" mode, which limits access to specific users you designate as testers. This is a security measure by Google to prevent unauthorized applications from accessing user data.

## Quick Solution: Add Yourself as a Test User

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (e.g., "team-ooo-sync")
3. Navigate to "APIs & Services" > "OAuth consent screen"
4. Scroll down to the "Test users" section
5. Click "ADD USERS"
6. Enter your Google email address and any other users who need access
7. Click "SAVE"

After adding yourself as a test user, try to authenticate again. You should now be able to proceed past the warning screen.

## Handling the Consent Screen

Even with test users added, you'll still see a warning screen that says:

```
This app isn't verified
If you're not comfortable with the data sharing or app policies, you can go back.
```

To proceed:
1. Click on the small text that says "Continue" or "Advanced"
2. Click on "Go to [Your App Name] (unsafe)"
3. You'll then be able to grant consent and proceed with the authentication flow

## Completing Verification (For Production Apps)

If you plan to make this application available to more than 100 users or if you want to remove the warning screens, you'll need to complete Google's verification process:

1. Go to "APIs & Services" > "OAuth consent screen"
2. Add all required information:
   - Application homepage link
   - Application privacy policy link
   - Application terms of service link
3. Add any authorized domains
4. Submit your app for verification

The verification process typically involves:
- Validating your domain ownership
- Reviewing your privacy policy
- Google assessing your application's data usage and security practices

## Recommended Approach for Internal Tools

If this is an internal tool used by your team or organization:

1. Consider creating the project under your organization's Google Workspace account
2. Select "Internal" for the OAuth consent screen type instead of "External"
3. This will limit the app to users within your organization but removes the need for verification

## Need More Help?

If you continue experiencing issues, refer to the [Google OAuth 2.0 documentation](https://developers.google.com/identity/protocols/oauth2).