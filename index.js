const { onRequest } = require('firebase-functions/v2/https');

const app = require('./server');

exports.app = onRequest(
  {
    region: process.env.FIREBASE_FUNCTIONS_REGION || 'southamerica-east1',
    memory: '512MiB',
    timeoutSeconds: 60
  },
  app
);
