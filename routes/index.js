var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  // Use the URL to get the correct config URL
  // Deduce the correct config key hash
  // Only return index if it is the correct config key hash (otherwise say the config key has changed, please reset it to the original that was downloaded from sophon.it)
  console.log("headers", req.headers);
  console.log("absoluteURL", req.baseUrl)
  res.render('index');
});

/* Example headers:
{
  host: 'localhost:3001',
  connection: 'keep-alive',
  'upgrade-insecure-requests': '1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9; q = 0.8',
  'x-safeexambrowser-requesthash': 'deef6d06d75923f5fe46f0751f8737c31fbce0adb6ce070bbfc862d21546f442',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15 SEB/2.1.4',
  'accept-language': 'en-au',
  'x-safeexambrowser-configkeyhash': '09477bf2ac1fa97804c302dbbe00c67a72979979c2e12fc00d777c4285c5ac28',
  'accept-encoding': 'gzip, deflate'
}
*/

module.exports = router;
