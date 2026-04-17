/**
 * Entrada serverless na Vercel — reexporta o app Express definido em server.js.
 * @see https://vercel.com/guides/using-express-with-vercel
 */
const { app } = require("../server.js");
module.exports = app;
