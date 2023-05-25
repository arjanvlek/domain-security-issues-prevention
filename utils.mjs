// Adds a zero to the number if less than 10
function zeroPad(n) {
    return n < 10 ? "0" + n : "" + n;
}

// Returns a timestamp in the format YYYY-MM-DD HH:mm:ss
export function getCurrentTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = zeroPad(now.getMonth() + 1);
    const day = zeroPad(now.getDate());
    const hour = zeroPad(now.getHours());
    const minutes = zeroPad(now.getMinutes());
    const seconds = zeroPad(now.getSeconds());

    return `${year}-${month}-${day} ${hour}:${minutes}:${seconds}`;
}
