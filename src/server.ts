/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk'
import { resolve as resolvePath } from 'path'
import dotenv from 'dotenv'
import fs from 'fs'

import App from './app'
import { DefaultEnv } from './types'
import SocketServer from './socket'
import { Permissions } from '@microsoft/mixed-reality-extension-sdk'


//if the .env configuration file doesn't exist create it using defaults
if (!fs.existsSync('.env')) { 
	const defaults = new DefaultEnv
	let defaultString = ''
	for (let key in defaults) {
		if (Object.prototype.hasOwnProperty.call(defaults, key)) {
			const value = defaults[key]
			defaultString += `${key}=${value}\n`
		}
	}
	fs.writeFileSync('.env', defaultString)
	console.log("created the default .env")
}


//read the .env configuration
dotenv.config()


/* eslint-disable no-console */
process.on('uncaughtException', err => console.log('uncaughtException', err))
process.on('unhandledRejection', reason => console.log('unhandledRejection', reason))
/* eslint-enable no-console */


//create the socket server
const socketServer = new SocketServer()


// This function starts the MRE server. It will be called immediately unless
// we detect that the code is running in a debuggable environment. If so, a
// small delay is introduced allowing time for the debugger to attach before
// the server starts accepting connections.
async function runApp() {
	//log that the app is starting
	console.log("starting server")

	// Start listening for connections and serve static files
	const server = new MRE.WebHost({
		baseUrl: `${process.env.BASE_URL}:${parseInt(process.env.PORT)}`,
		baseDir: resolvePath(__dirname, '../public'),
		port: (process.env.PORT),
		permissions: [Permissions.UserInteraction, Permissions.UserTracking]
	})

	console.log("server started: ", server)

	// Handle new application sessions
	server.adapter.onConnection((context, params) => {
		new App(context)
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




