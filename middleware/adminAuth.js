'use strict';

const crypto = require('crypto');

/**
 * Admin authentication middleware.
 *
 * Access: GET /admin?pass=YOUR_PASSWORD
 * - If the ?pass= query param matches ADMIN_PASSWORD env var, session is set
 * - Subsequent requests to /admin/* use the session (no need to pass ?pass= again)
 * - If neither session nor valid pass: 403 page
 */
module.exports = function adminAuth(req, res, next) {
  const passParam = req.query.pass;
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  // Validate the password param and set session
  if (passParam) {
    // Use timing-safe comparison to prevent timing attacks
    const inputBuf = Buffer.from(passParam);
    const expectedBuf = Buffer.from(adminPassword);
    const match = inputBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(inputBuf, expectedBuf);

    if (match) {
      req.session.isAdmin = true;
    } else {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Access Denied</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
        </head>
        <body class="bg-dark d-flex align-items-center justify-content-center" style="min-height:100vh">
        <div class="card text-center p-5 shadow" style="max-width:400px">
          <h2 class="text-danger">🔒 Access Denied</h2>
          <p class="text-muted mt-3">Incorrect password. Please check your credentials and try again.</p>
          <a href="/admin?pass=" class="btn btn-outline-danger mt-3">Try Again</a>
        </div>
        </body></html>
      `);
    }
  }

  if (req.session.isAdmin) {
    return next();
  }

  // Not authenticated
  res.status(403).send(`
    <!DOCTYPE html>
    <html>
    <head><title>Admin Login</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
    </head>
    <body class="bg-dark d-flex align-items-center justify-content-center" style="min-height:100vh">
    <div class="card text-center p-5 shadow" style="max-width:450px">
      <h2 class="mb-3">🔐 Admin Access</h2>
      <p class="text-muted">Visit <code>/admin?pass=YOUR_PASSWORD</code> to log in.</p>
      <form method="GET" action="/admin" class="mt-3">
        <div class="input-group">
          <input type="password" name="pass" class="form-control" placeholder="Enter admin password">
          <button type="submit" class="btn btn-primary">Login</button>
        </div>
      </form>
    </div>
    </body></html>
  `);
};
