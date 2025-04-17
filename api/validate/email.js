const EmailValidationService = require('../../src/services/email-validator');

// Load configuration
const config = {
  emailValidation: {
    removeGmailAliases: process.env.REMOVE_GMAIL_ALIASES !== 'false',
    checkAustralianTlds: process.env.CHECK_AUSTRALIAN_TLDS !== 'false',
  }
};

// Initialize the email validation service
const emailValidator = new EmailValidationService(config.emailValidation);

module.exports = async (req, res) => {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
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
};