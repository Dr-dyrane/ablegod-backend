const webpush = require('web-push');
const fs = require('fs');
const keys = webpush.generateVAPIDKeys();
fs.writeFileSync('tmp/vapid.json', JSON.stringify(keys, null, 2));
