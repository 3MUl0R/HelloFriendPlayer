/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebHost } from '@microsoft/mixed-reality-extension-sdk';
import dotenv from 'dotenv';
import { resolve as resolvePath } from 'path';
import App from './app';
import * as musicMetadata from 'music-metadata-browser'
import fs, { promises } from 'fs'
import AudioFileInfo from './types'
import { stringify } from 'querystring';


/* eslint-disable no-console */
process.on('uncaughtException', err => console.log('uncaughtException', err));
process.on('unhandledRejection', reason => console.log('unhandledRejection', reason));
/* eslint-enable no-console */

// Read .env if file exists
dotenv.config();

const musicFileInfoArray : Array<AudioFileInfo> = []

//read in all of the music files
// fs.readdirSync('./public/music/').forEach(file => {

// 	musicMetadata.parseBuffer(fs.readFileSync(`./public/music/${file}`)).then(data => {
// 		console.log(`${file} duration :`, data.format.duration)
// 		musicFileInfoArray.push({name:file, duration:data.format.duration})
// 	})
	
// })


// This function starts the MRE server. It will be called immediately unless
// we detect that the code is running in a debuggable environment. If so, a
// small delay is introduced allowing time for the debugger to attach before
// the server starts accepting connections.
function runApp() {

	console.log("musicMetadata: ", musicFileInfoArray)


	// Start listening for connections, and serve static files.
	const server = new WebHost({
		baseUrl: (process.env.BASE_URL),
		baseDir: resolvePath(__dirname, '../public'),
		port: (process.env.PORT)
	});

	console.log("server info: ", server)

	//read the files from the directory
	fs.readdir('./public/music/', (err, dirList) => {
		//create an array for all of the promises
		const promises : Array<Promise<musicMetadata.IAudioMetadata>> = []

		//loop through the list and save the promises
		dirList.forEach(file => {
			//parse each file for its info
			promises.push( musicMetadata.parseBuffer(fs.readFileSync(`./public/music/${file}`)))
		})

		//when all of the promises are finished save the file info to an array
		Promise.all(promises).then(dataArray => {
			dataArray.forEach(data => {
				// console.log("music file data: ", data)
				musicFileInfoArray.push( {name: data.common.title, duration: data.format.duration, url:'', fileName:""} )
			})
		
		//log the file info and start the app
		}).then(() => {
	
			// Handle new application sessions
			server.adapter.onConnection(context => new App(context, server.baseUrl, musicFileInfoArray))
		})

	})
}

// Check whether code is running in a debuggable watched filesystem
// environment and if so, delay starting the app by one second to give
// the debugger time to detect that the server has restarted and reconnect.
// The delay value below is in milliseconds so 1000 is a one second delay.
// You may need to increase the delay or be able to decrease it depending
// on the speed of your machine.
const delay = 1000;
const argv = process.execArgv.join();
const isDebug = argv.includes('inspect') || argv.includes('debug');

if (isDebug) {
	setTimeout(runApp, delay);
} else {
	runApp();
}
