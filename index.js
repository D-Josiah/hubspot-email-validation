const express = require('express');
const cors = require('cors');
const EmailValidationService = require('./src/services/email-validator');
require('dotenv').config();

// Configuration
const config = {
  port: process.env.PORT || 3000,
  environment: process.env.NODE_ENV || 'development',
  
  // Email validation settings
  emailValidation: {
    removeGmailAliases: process.env.REMOVE_GMAIL_ALIASES !== 'false',
    checkAustralianTlds: process.env.CHECK_AUSTRALIAN_TLDS !== 'false',
  },
  
  // HubSpot settings
  hubspot: {
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
    skipSignatureVerification: process.env.SKIP_SIGNATURE_VERIFICATION === 'true'
  }
};

// Initialize the app
const app = express();
const emailValidator = new EmailValidationService(config.emailValidation);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.post('/api/webhooks/hubspot', async (req, res) => {
  // Import the webhook handler
  const webhookHandler = require('./api/webhooks/hubspot');
  return await webhookHandler(req, res);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(), 
    environment: config.environment 
  });
});

// Email validation endpoint
app.post('/api/validate/email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const result = await emailValidator.validateEmail(email);
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Error validating email:', error);
    return res.status(500).json({
      error: 'Error validating email',
      details: error.message
    });
  }
});

// Start the server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${config.environment}`);
});

module.exports = app;