const http = require('http');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

/**
 * Specifies which files are used for access logs, error logs and stats data
 */
const ACCESS_LOG_FILE = 'access.log';
const ERROR_LOG_FILE = 'error.log';
const DATA_BASE_FILE = 'data/requests.db';

/**
 * The domain to which we will redirect
 */
const PROPERLY_SPELLED_DOMAIN = 'https://coronamelder.nl';

/**
 * Server port this instance runs on
 */
const SERVER_HTTP_PORT = 8089;

// Connects to the SQLite database for stats
const connectToSqLiteDatabase = () =>
  new sqlite3.Database(DATA_BASE_FILE, (err) => {
    if (err) {
      writeErrorLogEntry('Error connecting to the request log database.' + err.message);
    }
  });

// Closes a connection to the SQLite database
const closeSqLiteDatabase = db =>
  db.close(err => {
    if (err) {
      writeErrorLogEntry('Error closing connection to the request log database.' + err.message);
    }
  });

// If ran for the first time, create the database table.
if (!fs.existsSync(DATA_BASE_FILE)) {
  if (DATA_BASE_FILE.indexOf(path.sep) > -1) {
    fs.mkdirSync(DATA_BASE_FILE.substr(0, DATA_BASE_FILE.lastIndexOf(path.sep)));
  }
  const db = connectToSqLiteDatabase();
  db.run('CREATE TABLE request_log(id INTEGER PRIMARY KEY AUTOINCREMENT, external_ip INTEGER NOT NULL, url text, user_agent text, referer text, timestamp text NOT NULL)');
  closeSqLiteDatabase(db);
  console.log('Created empty database to store request logs');
}

// Adds a zero to the number if less than 10
function zeroPad(n) {
  return n < 10 ? "0" + n : "" + n;
}

// Returns a timestamp in the format YYYY-MM-DD HH:mm:ss
function getCurrentTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = zeroPad(now.getMonth() + 1);
  const day = zeroPad(now.getDate());
  const hour = zeroPad(now.getHours());
  const minutes = zeroPad(now.getMinutes());
  const seconds = zeroPad(now.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minutes}:${seconds}`;
}

// Writes incoming IP, method, URL and userAgent to the access log
const writeAccessLogEntry = request => {
  const timestamp = getCurrentTimestamp();
  const ip = request.headers['X-Real-IP'] || request.headers['x-real-ip'] || request.connection.remoteAddress.replace('::ffff:', '');
  const userAgent = request.headers['user-agent'] || "-";
  const logEntry = `[${timestamp}] ${ip} "${request.method} ${request.url}" "${userAgent}"`;
  fs.appendFileSync(ACCESS_LOG_FILE, `${logEntry}\n`);
  console.log(logEntry);
};

// Writes the error message prefixed with a timestamp to the error log
const writeErrorLogEntry = errorMessage => {
  const timestamp = getCurrentTimestamp();
  const logEntry = `[${timestamp}]: ${errorMessage}`;
  fs.appendFileSync(ERROR_LOG_FILE, `${logEntry}\n`);
  console.error(logEntry);
};

// Writes a redirected request's details to the SQLite database
const writeDatabaseEntry = request => {
  const timestamp = getCurrentTimestamp();
  const ip = request.headers['X-Real-IP'] || request.headers['x-real-ip'] || request.connection.remoteAddress.replace('::ffff:', '');
  const userAgent = request.headers['user-agent'] || "-";
  const referer = request.headers['referer'] || "-";
  const url = request.url;

  const db = connectToSqLiteDatabase();
  db.run('INSERT INTO request_log(external_ip, url, user_agent, referer, timestamp) VALUES (?, ?, ?, ?, ?)', [ip, url, userAgent, referer, timestamp], (err) => {
    if (err) {
      writeErrorLogEntry(err.message);
    }
    closeSqLiteDatabase(db);
  });
}

// Handles requests to the incorrectly spelled domain and redirects them to the properly spelled domain.
// It also exposes a stats page at /request-stats to see how many requests were redirected.
// Every incoming request will create an access log entry. All redirected requests are also stored in SQLite database so they can be retrieved by the stats page.
const requestListener = (req, res) => {
  // Create the access log item for this request
  writeAccessLogEntry(req);

  // We don't have a favicon and manifest
  if (req.url === '/favicon.ico' || req.url === '/manifest.json') {
    res.writeHead(404, 'Not Found');
    res.end();
    return;
  }

  // Do not allow search engines to index this site
  if (req.url === '/robots.txt') {
    const robotsTxtContents = fs.readFileSync('robots.txt', { encoding: 'utf-8' });
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.write(robotsTxtContents);
    res.end();
    return;
  }


  // Return the statistics HTML page if navigated to /request-stats
  if (req.url === '/request-stats' || req.url === '/request-stats/') {
    const htmlFileContents = fs.readFileSync('request-statistics.html', { encoding: 'utf-8' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.write(htmlFileContents);
    res.end();
    return;
  }

  // Return the statistics data as CSV when requesting the data from the stats page
  if (req.url === '/request-stats/data.csv') {
    const db = connectToSqLiteDatabase();
    db.all('select date(timestamp) as date, count(*) as numberOfRequests from request_log group by date(timestamp);', (err, rows) => {
      if (err) {
        // Return 500 on DB error - we can't show the stats then.
        writeErrorLogEntry(err);
        res.writeHead(500, 'Internal Server Error');
        res.end();
        closeSqLiteDatabase(db);
        return;
      }

      const csvHeader = 'Day;Number of requests';
      const csvContents = rows
        .map(row => `${row.date};${row.numberOfRequests}`)
        .join('\n');

      const csv = `${csvHeader}\n${csvContents}`;

      res.writeHead(200, { 'Content-Type': 'text/csv; charset=UTF-8' });
      res.write(csv);
      res.end();
      closeSqLiteDatabase(db);
    })
    return;
  }

  // Redirect all other calls to the properly spelled domain
  writeDatabaseEntry(req);
  res.writeHead(301, { 'Location': PROPERLY_SPELLED_DOMAIN });
  res.end();
};

http.createServer(requestListener).listen(SERVER_HTTP_PORT);

console.log("Node.js HTTP server listening at port " + SERVER_HTTP_PORT);

