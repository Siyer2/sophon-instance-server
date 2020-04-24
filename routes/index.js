var express = require('express');
var router = express.Router();
var shajs = require('sha.js');
var config = require('../config');

/* GET home page. */
router.get('/', function(req, res, next) {
  // Deduce the correct config key hash
  const _id = req.query._id;
  const expectedHash = getExpectedHash(_id);

  const returnedHash = req.headers['x-safeexambrowser-configkeyhash'];

  // Only return index if it is the correct config key hash (otherwise say the config key has changed, please reset it to the original that was downloaded from sophon.it)
  const isCorrectFile = expectedHash === returnedHash;
  if (isCorrectFile) {
    res.render('index');
  }
  else {
    res.render('error', {
      message: `Cannot enter exam. \nThe config file has been changed or you are not using a compatible version of SEB. \nEnsure you return the .seb file to it's original configuration and have the right SEB version (Windows: 2.4 or greater, iOS: 2.1.16 or greater, Mac: 2.1.5pre2 or higher)`,
      error: {}
    });
  }

});

function getExpectedHash(_id) {
  const url = `${config.settings.INSTANCE_SERVER_URL}/?_id=${_id}`;
  const sebJson = { "sendBrowserExamKey": true, "startURL": `${url}` };
  const sebJsonString = JSON.stringify(sebJson).replace(' ', '');
  const hashedSebJson = shajs('sha256').update(sebJsonString).digest('hex');
  const expectedHash = shajs('sha256').update(url + hashedSebJson).digest('hex');

  return expectedHash;
}

module.exports = router;
