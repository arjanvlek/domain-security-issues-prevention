import fs from 'fs';
import {getCurrentTimestamp} from './utils.mjs';

// Writes incoming IP, method, URL and userAgent to the access log
export function writeAccessLogEntry(request, ACCESS_LOG_FILE) {
    const timestamp = getCurrentTimestamp();
    const ip = request.headers['X-Real-IP'] || request.headers['x-real-ip'] || request.connection.remoteAddress.replace('::ffff:', '');
    const userAgent = request.headers['user-agent'] || "-";
    const logEntry = `[${timestamp}] ${ip} "${request.method} ${request.url}" "${userAgent}"`;
    fs.appendFileSync(ACCESS_LOG_FILE, `${logEntry}\n`);
    console.log(logEntry);
}

// Writes the error message prefixed with a timestamp to the error log
export function writeErrorLogEntry(errorMessage, ERROR_LOG_FILE) {
    const timestamp = getCurrentTimestamp();
    const logEntry = `[${timestamp}]: ${errorMessage}`;
    fs.appendFileSync(ERROR_LOG_FILE, `${logEntry}\n`);
    console.error(logEntry);
}
