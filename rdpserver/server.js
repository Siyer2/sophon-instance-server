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

var rdp = require('node-rdpjs-2');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./awsKeys.json');

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

function isInSEB(client) {
	const inSeb = client.handshake.headers['user-agent'].includes("SEB");
	
	return inSeb ? true : false;
}

/**
 * Create proxy between rdp layer and socket io
 * @param server {http(s).Server} http server
 */
module.exports = function (server) {
	var io = require('socket.io')(server);
	io.on('connection', function(client) {
		if (!isInSEB(client)) {
			client.emit("not in seb");
			return;
		}

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
				if (!isInSEB(client)) {
					client.emit("not in seb");
					return;
				}
				else {
					client.emit('rdp-bitmap', bitmap);
				}
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
			await getStudentSubmission(examEntrance.instanceId, submissionLocation);

			// Upload the saved location to mongo as submissionLocation
			await updateExamSubmissionLocation(examEntrance._id, submissionLocation);

			// Update the instance to say it's done
			const tags = [
				{
					Key: "CompletionTime",
					Value: Date.now().toString()
				}
			];
			await updateEC2Tag(examEntrance.instanceId, tags);

			rdpClient.close();
		});
	});
}

function getStudentSubmission(instanceId, submissionLocation) {
	console.log(`Pushing files to instance ${instanceId}...`);
	return new Promise(async (resolve, reject) => {
		try {
			var ssm = new AWS.SSM();
			var sendCommandParams = {
				"DocumentName": "AWS-RunPowerShellScript",
				"InstanceIds": [
					instanceId
				],
				"Parameters": {
					"commands": [
						`Write-S3Object -BucketName ${config.settings.SUBMISSION_BUCKET} -Folder C:\\Users\\DefaultAccount\\Desktop\\submit -KeyPrefix ${submissionLocation} -Region ap-southeast-2 -Recurse`
					]
				}
			}

			ssm.sendCommand(sendCommandParams, function (err, data) {
				if (err) {
					console.log("AWS ERROR SENDING COMMAND", err);
					reject(err);
				}
				else {
					resolve(data);
				}
			});
		} catch (ex) {
			console.log("EXCEPTION PUSHING LECTURER FILE", ex);
		}
	});
}

function updateEC2Tag(instanceId, tags) {
	return new Promise(async (resolve, reject) => {
		try {
			const ec2 = new AWS.EC2();
			var params = {
				Resources: [
					instanceId
				],
				Tags: tags
			};
			ec2.createTags(params, function (err, data) {
				if (err) {
					console.log("AWS ERROR CREATING TAG", err);
					reject(err);
				}
				else {
					resolve();
				}
			});
		} catch (ex) {
			console.log("EXCEPTION UPDATING EC2 TAGS", ex);
		}
	});
}