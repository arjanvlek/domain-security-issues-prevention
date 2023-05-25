import http from 'http';
import fs from 'fs';
import {writeAccessLogEntry} from './logging.mjs';
import {initializeDatabase, readStatisticsFromDatabase, writeDatabaseEntry} from './database.mjs';

const DEFAULT_CONFIG = {
  // Specifies which files are used for access logs and error logs
  ACCESS_LOG_FILE: 'access.log',
  ERROR_LOG_FILE: 'error.log',

  // Specifies the location of the SQlite3 database file that is used to store request statistics.
  DATA_BASE_FILE: 'data/requests.db',

  // HTTP port this instance listens on.
  SERVER_INSTANCE_HTTP_PORT: 8089,

  // Mode: is either 'redirect' or 'warn_user'.
  // If 'redirect', we redirect the user to a different domain. This works best for misspelled domains, such as a redirect from 'arjanvle.nl' to 'arjanvlek.nl'
  // If 'warn_user', we warn the user that they have landed on a misleading domain, such as a file name. This works best for domains which should not have been issued, such as 'videofile.mov'.
  MODE: 'redirect',

  // If mode is 'redirect', specifies the domain to redirect the user to.
  REDIRECT_DOMAIN: 'https://arjanvlek.nl',

  // If mode is 'warn_user', specifies the current domain the user is on.
  WARN_USER_DOMAIN_NAME: 'videofile.mov',

  // If mode is 'warn_user', explains to the user what just happened and why user is here.
  WARN_USER_DOMAIN_EXPLANATION: 'You are currently on the Web page named %DOMAINNAME%. You may have wanted to click on a file name, but this is not the case!',

  STATISTICS_GRAPH_TITLE: 'Requests',
  STATISTICS_GRAPH_DESCRIPTION: 'Amount of requests to arjanvle.nl instead of arjanvlek.nl'
}

function parseConfig(env) {
  const _config = {};

  for (let configKey of Object.keys(DEFAULT_CONFIG)) {
    if (env[configKey]) {
      _config[configKey] = env[configKey];
    } else {
      _config[configKey] = DEFAULT_CONFIG[configKey];
    }
  }

  console.log('Starting up with config', JSON.stringify(_config));

  return _config;
}

const CONFIG = parseConfig(process.env);
initializeDatabase(CONFIG.DATA_BASE_FILE);

// Handles requests to the incorrectly spelled domain and redirects them to the properly spelled domain.
// It also exposes a stats page at /request-stats to see how many requests were redirected.
// Every incoming request will create an access log entry. All redirected requests are also stored in SQLite database so they can be retrieved by the stats page.
const requestListener = (req, res) => {
  // Create the access log item for this request
  writeAccessLogEntry(req, CONFIG.ACCESS_LOG_FILE);

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
    const htmlFileContents = fs.readFileSync('request-statistics.tpl.html', { encoding: 'utf-8' })
        .replace('%GRAPH_TITLE%', CONFIG.STATISTICS_GRAPH_TITLE)
        .replace('%GRAPH_DESCRIPTION%', CONFIG.STATISTICS_GRAPH_DESCRIPTION);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.write(htmlFileContents);
    res.end();
    return;
  }

  // Return the statistics data as CSV when requesting the data from the stats page
  if (req.url === '/request-stats/data.csv') {
    readStatisticsFromDatabase(CONFIG.DATA_BASE_FILE, (rows) => {
      const csvHeader = 'Day;Number of requests';
      const csvContents = rows
          .map(row => `${row.date};${row.numberOfRequests}`)
          .join('\n');

      const csv = `${csvHeader}\n${csvContents}`;

      res.writeHead(200, { 'Content-Type': 'text/csv; charset=UTF-8' });
      res.write(csv);
      res.end();
    }, () => {
      // Return 500 on DB error - we can't show the stats then.
      res.writeHead(500, 'Internal Server Error');
      res.end();
    })
    return;
  }

  // Redirect all other calls to the properly spelled domain
  writeDatabaseEntry(req, CONFIG.DATA_BASE_FILE);

  const redirDomain = CONFIG.REDIRECT_DOMAIN.startsWith('http') ? CONFIG.REDIRECT_DOMAIN : 'https://' + CONFIG.REDIRECT_DOMAIN;
  res.writeHead(301, { 'Cache-Control': 'no-cache', 'Location': redirDomain });
  res.end();
};

http.createServer(requestListener).listen(CONFIG.SERVER_INSTANCE_HTTP_PORT);

console.log("Node.js HTTP server listening at port " + CONFIG.SERVER_INSTANCE_HTTP_PORT);

