/*
 * Copyright (c) 2015 Sylvain Peyrefitte
 *
 * This file is part of mstsc.js.
 *
 * mstsc.js is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var rdp = require('node-rdpjs');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./awsKeys.json');
var Client = require('ssh2-sftp-client');
var sftp = new Client();

/**
 * Create proxy between rdp layer and socket io
 * @param server {http(s).Server} http server
 */
module.exports = function (server) {
	var io = require('socket.io')(server);
	io.on('connection', function(client) {
		var rdpClient = null;
		client.on('infos', function (infos) {
			if (rdpClient) {
				// clean older connection
				rdpClient.close();
			};
			
			rdpClient = rdp.createClient({ 
				domain : infos.domain, 
				userName : 'DefaultAccount',
				password: '4mbA49H?vdO-mIp(=nTeP*psl4*j=Vwt',
				enablePerf : true,
				autoLogin : true,
				decompress: false,
				screen : infos.screen,
				locale : infos.locale,
				logLevel : process.argv[2] || 'INFO'
			}).on('connect', function () {
				client.emit('rdp-connect');
			}).on('bitmap', function(bitmap) {
				client.emit('rdp-bitmap', bitmap);
			}).on('close', function() {
				client.emit('rdp-close');
			}).on('error', function(err) {
				client.emit('rdp-error', err);
			}).connect(infos.ip, infos.port);
		}).on('mouse', function (x, y, button, isPressed) {
			if (!rdpClient)  return;

			rdpClient.sendPointerEvent(x, y, button, isPressed);
		}).on('wheel', function (x, y, step, isNegative, isHorizontal) {
			if (!rdpClient) {
				return;
			}
			rdpClient.sendWheelEvent(x, y, step, isNegative, isHorizontal);
		}).on('scancode', function (code, isPressed) {
			if (!rdpClient) return;

			rdpClient.sendKeyEventScancode(code, isPressed);
		}).on('unicode', function (code, isPressed) {
			if (!rdpClient) return;

			rdpClient.sendKeyEventUnicode(code, isPressed);
		}).on('disconnect', async function() {
			if(!rdpClient) return;
			
			// Get the student submission here
			console.log("getting student submission...");
			await getStudentSubmission('13.211.63.85', 'z5113480_i09');

			rdpClient.close();
		});
	});
}

function getStudentSubmission(publicIpAddress, directory) {
	return new Promise(async (resolve, reject) => {
		try {
			console.log("Attempting connection to instance...", publicIpAddress);
			sftp.connect({
				host: publicIpAddress,
				username: 'Administrator',
				password: '4mbA49H?vdO-mIp(=nTeP*psl4*j=Vwt',
				port: '22'
			}).then(() => {
				return sftp.list('C:/Users/DefaultAccount/Desktop/submit');
			}).then((data) => {
				len = data.length;
				data.forEach(x => {
					let remoteFilePath = 'C:/Users/DefaultAccount/Desktop/submit/' + x.name;
					sftp.get(remoteFilePath).then(async (stream) => {
						let file = `${directory}/${x.name}`;

						// Save the submission in S3
						// const savedLocation = await uploadToS3(stream, file, config.settings.SUBMISSION_BUCKET);
						const savedLocation = await uploadToS3(stream, file, 'student-submissions.optricom.com');

						// TO-DO: Upload the saved location to mongo, 
						// collection: examEntrances, field: submissionLocation
						console.log(savedLocation);
					});
				});

				resolve();
			}).catch((err) => {
				console.log(err, 'catch error');
				reject(err);
			});
		} catch (ex) {
			reject(ex);
			console.log("EXCEPTION GETTING SUBMIT FOLDER", ex);
		}
	});
}

function uploadToS3(file, filepath, bucket) {
	return new Promise(async (resolve, reject) => {
		try {
			var s3 = new AWS.S3({
				apiVersion: '2006-03-01',
				params: {
					Bucket: bucket
				}
			});

			const uploadParams = {
				Bucket: bucket,
				Key: filepath,
				Body: file
			}

			s3.upload(uploadParams, function (err, data) {
				if (err) {
					console.log("AWS ERROR UPLOADING TO S3", err);
				} if (data) {
					resolve(data.Location);
				}
			});
		} catch (ex) {
			console.log("EXCEPTION UPLOADING TO S3", ex);
			reject(ex);
		}
	});
}