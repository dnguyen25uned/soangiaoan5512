'use strict';
// Vercel serverless entry: xuất Express app (không gọi listen ở đây).
// vercel.json sẽ điều hướng mọi request tới function này.
const app = require('../server');

module.exports = app;
