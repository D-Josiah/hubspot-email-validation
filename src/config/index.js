require('dotenv').config();

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
    apiKey: process.env.HUBSPOT_API_KEY,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
    skipSignatureVerification: process.env.SKIP_SIGNATURE_VERIFICATION === 'true'
  },
  
  // CSV settings
  csv: {
    knownValidEmailsPath: process.env.KNOWN_VALID_EMAILS_PATH || 'data/known_valid_emails.csv',
    validationResultsPath: process.env.VALIDATION_RESULTS_PATH || 'data/validation_results.csv'
  }
};

module.exports = config;