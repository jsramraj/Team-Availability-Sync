const express = require('express');
const { getAuthUrl, getTokens } = require('../auth/googleAuth');
const router = express.Router();

// Route to initiate Google OAuth flow
router.get('/login', (req, res) => {
  const authUrl = getAuthUrl();
  res.redirect(authUrl);
});

// Callback route for Google OAuth
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const { error } = req.query;
  
  // Handle error parameter returned from Google OAuth
  if (error) {
    if (error === 'access_denied') {
      return res.render('auth-error', {
        title: 'Authentication Error',
        error: 'Access was denied',
        message: 'You denied access to your Google Calendar. Please try again and approve the requested permissions.',
        actionText: 'Try Again',
        actionUrl: '/auth/login'
      });
    }
    
    return res.render('auth-error', {
      title: 'Authentication Error',
      error: `Error: ${error}`,
      message: 'An error occurred during the authentication process.',
      actionText: 'Try Again',
      actionUrl: '/auth/login'
    });
  }
  
  if (!code) {
    return res.redirect('/');
  }
  
  try {
    // Get tokens from authorization code
    const tokens = await getTokens(code);
    
    // Store tokens in session
    req.session.tokens = tokens;
    
    // Redirect to the dashboard
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error during authentication:', error);
    
    // Check for specific error messages related to verification
    const errorMessage = error.message || '';
    if (errorMessage.includes('invalid_client') || 
        errorMessage.includes('verification') || 
        errorMessage.includes('not verified')) {
      return res.render('auth-error', {
        title: 'Verification Error',
        error: 'Application Not Verified',
        message: 'This application has not completed the Google verification process. Please check the GOOGLE_AUTH_GUIDE.md file for instructions on how to resolve this issue.',
        actionText: 'Go to Home',
        actionUrl: '/'
      });
    }
    
    res.render('auth-error', {
      title: 'Authentication Failed',
      error: 'Authentication Failed',
      message: 'An error occurred during the authentication process. Please try again later.',
      actionText: 'Try Again',
      actionUrl: '/auth/login'
    });
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;