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

var MongoClient = require('mongodb').MongoClient;
var { ObjectId } = require('mongodb');

var config = require('../config');
var dbClient;

function getDB() {
	return new Promise(async (resolve, reject) => {
		try {
			if (!dbClient) {
				const uri = config.settings.DB_CONNECTION_STRING;
				dbClient = await MongoClient.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
				resolve(dbClient);
			}
			else {
				resolve(dbClient);
			}
		} catch (ex) {
			console.log("EXCEPTION GETTING DB", ex);
			reject(ex);
		}
	})
}

function getExamEntrance(id) {
	return new Promise(async (resolve, reject) => {
		try {
			const db = await getDB();
			const examEntrance = await db.db("osStag").collection("examEntrances").findOne({ _id: ObjectId(id) });
			resolve(examEntrance);
		} catch (ex) {
			console.log("ERROR GETTING EXAM ENTRANCE", ex);
			reject(ex);
		}

	});
}

function updateExamSubmissionLocation(id, submissionLocation) {
	return new Promise(async (resolve, reject) => {
		try {
			const db = await getDB();
			db.db("osStag").collection("examEntrances").updateOne({ _id: id }, {
				$set: {
					submissionLocation
				}
			});

			resolve();
		} catch (ex) {
			console.log("ERROR UPDATING EXAM SUBMISSION LOCATION", ex);
			reject(ex);
		}	
	})
}

function deleteInstanceById(instanceId) {
	return new Promise(async (resolve, reject) => {
		try {
			const ec2 = new AWS.EC2();
			var params = {
				InstanceIds: [instanceId]
			};
			ec2.terminateInstances(params, function (err, data) {
				if (err) {
					console.log("AWS ERROR TERMINATING INSTANCES", err);
				}
				else {
					resolve();
				}
			});
			resolve();
		} catch (ex) {
			console.log("EXCEPTION DELETING INSTANCE", ex);
			reject(ex);
		}
	});
}

/**
 * Create proxy between rdp layer and socket io
 * @param server {http(s).Server} http server
 */
module.exports = function (server) {
	var io = require('socket.io')(server);
	io.on('connection', function(client) {
		var rdpClient = null;
		client.on('infos', async function (infos) {
			if (rdpClient) {
				// clean older connection
				rdpClient.close();
			};

			// Get examEntrance document by ID (infos.id)
			const examEntrance = await getExamEntrance(infos.id);
			const studentIp = examEntrance.ip;

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
			}).connect(studentIp, 3389);
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
			const id = client.handshake.query._id;

			// Get the student submission here
			const examEntrance = await getExamEntrance(id);
			const submissionLocation = `${examEntrance.examCode}/${examEntrance.studentId}`;
			await getStudentSubmission(examEntrance.ip, submissionLocation);

			// Upload the saved location to mongo as submissionLocation
			await updateExamSubmissionLocation(examEntrance._id, submissionLocation);

			// Delete the instance
			await deleteInstanceById(examEntrance.instanceId);

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
						await uploadToS3(stream, file, config.settings.SUBMISSION_BUCKET);
					});
				});

				sftp.on('error', error => {
					console.log(error);
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