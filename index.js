const express = require('express');
const cors = require('cors');
const webhookRoutes = require('./src/routes/webhooks');
const config = require('./src/config');
const EmailValidationService = require('./src/services/email-validator');

// Initialize the app
const app = express();
const emailValidator = new EmailValidationService(config.emailValidation);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/webhooks', webhookRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
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