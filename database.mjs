// Connects to the SQLite database for stats
import fs from 'fs';
import sqlite3 from 'sqlite3';
import {writeErrorLogEntry} from './logging.mjs';
import path from 'path';
import {getCurrentTimestamp} from './utils.mjs';

function connectToSqLiteDatabase(DATA_BASE_FILE) {
    return new sqlite3.Database(DATA_BASE_FILE, (err) => {
        if (err) {
            writeErrorLogEntry('Error connecting to the request log database.' + err.message);
        }
    });
}

// Closes a connection to the SQLite database
function closeSqLiteDatabase(db) {
    db.close(err => {
        if (err) {
            writeErrorLogEntry('Error closing connection to the request log database.' + err.message);
        }
    });
}

// If ran for the first time, create the database table.
export function initializeDatabase(DATA_BASE_FILE) {
    if (!fs.existsSync(DATA_BASE_FILE)) {
        if (DATA_BASE_FILE.indexOf(path.sep) > -1) {
            fs.mkdirSync(DATA_BASE_FILE.substr(0, DATA_BASE_FILE.lastIndexOf(path.sep)));
        }
        const db = connectToSqLiteDatabase(DATA_BASE_FILE);
        db.run('CREATE TABLE request_log(id INTEGER PRIMARY KEY AUTOINCREMENT, external_ip INTEGER NOT NULL, url text, user_agent text, referer text, timestamp text NOT NULL)');
        closeSqLiteDatabase(db);
        console.log('Created empty database to store request logs');
    }
}

// Writes a redirected request's details to the SQLite database
export function writeDatabaseEntry(request, DATA_BASE_FILE) {
    const timestamp = getCurrentTimestamp();
    const ip = request.headers['X-Real-IP'] || request.headers['x-real-ip'] || request.connection.remoteAddress.replace('::ffff:', '');
    const userAgent = request.headers['user-agent'] || "-";
    const referer = request.headers['referer'] || "-";
    const url = request.url;

    const db = connectToSqLiteDatabase(DATA_BASE_FILE);
    db.run('INSERT INTO request_log(external_ip, url, user_agent, referer, timestamp) VALUES (?, ?, ?, ?, ?)', [ip, url, userAgent, referer, timestamp], (err) => {
        if (err) {
            writeErrorLogEntry(err.message);
        }
        closeSqLiteDatabase(db);
    });
}

export function readStatisticsFromDatabase(DATA_BASE_FILE, onSuccess, onError) {
    const db = connectToSqLiteDatabase(DATA_BASE_FILE);
    db.all('select date(timestamp) as date, count(*) as numberOfRequests from request_log group by date(timestamp);', (err, rows) => {
        if (err) {
            writeErrorLogEntry(err.message);
            onError(err);
        } else {
            onSuccess(rows);
        }

        closeSqLiteDatabase(db);
    })
}
