var express = require('express');
var router = express.Router();
var shajs = require('sha.js');
var config = require('../config');

router.get('/healthcheck', function(req, res, next) {
  res.send(`INSTANCE SERVER is working || Version 1588746900 || ${process.env.DEPLOYMENT}`);
});

/* GET home page. */
router.get('/', function(req, res, next) {
  if (!isInSEB(req.headers)) {
    return res.render('error', {
      message: "Can only open this in Safe Exam Browser. Simply open the .seb file downloaded from thesophon.com.",
      error: {}
    });
  }

  const _id = req.query._id;
  if (!_id) {
    return res.render('error', {
      message: "Invalid URL",
      error: {}
    });
  }

  // Deduce the correct config key hash
  const expectedHash = getExpectedHash(_id);
  const returnedHash = req.headers['x-safeexambrowser-configkeyhash'];

  // Only return index if it is the correct config key hash
  const isCorrectFile = expectedHash === returnedHash;
  if (isCorrectFile) {
    res.render('index');
  }
  else {
    console.log("FAILED CONFIG CHECK", `Expected: ${expectedHash}, Returned: ${returnedHash}`);
    res.render('index');
    // res.render('error', {
    //   message: `Cannot enter exam. \nThe config file has been changed or you are not using a compatible version of SEB. \nEnsure you return the .seb file to it's original configuration and have the right SEB version (Windows: SEB 2.4 or greater, iOS: SEB 2.1.16 or greater, Mac: SEB 2.1.5pre2 or higher).\n Expected: ${expectedHash}, Returned: ${returnedHash}`,
    //   error: {}
    // });
  }
});

function getExpectedHash(_id) {
  const url = `${config.settings.INSTANCE_SERVER_URL}/?_id=${_id}`;
  const sebJson = { "browserViewMode": 1,"sendBrowserExamKey": true, "startURL": `${url}` };
  const sebJsonString = JSON.stringify(sebJson).replace(' ', '');
  const hashedSebJson = shajs('sha256').update(sebJsonString).digest('hex');
  const expectedHash = shajs('sha256').update(url + hashedSebJson).digest('hex');

  return expectedHash;
}

function isInSEB(headers) {
  const inSeb = headers['user-agent'].includes("SEB");

  return inSeb ? true : false;
}
module.exports = router;
