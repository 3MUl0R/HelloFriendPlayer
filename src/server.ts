/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk'
import * as musicMetadata from 'music-metadata'
import { resolve as resolvePath } from 'path'
import dotenv from 'dotenv'
import socketIO from "socket.io"
import fetch from 'node-fetch'
import got from 'got'
import fs from 'fs'

import App from './app'
import AudioFileInfo, { DefaultEnv } from './types'
import DBConnect from './db'


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

//create the socket server
const io = socketIO()
//create the db connection
const db = new DBConnect

/* eslint-disable no-console */
process.on('uncaughtException', err => console.log('uncaughtException', err))
process.on('unhandledRejection', reason => console.log('unhandledRejection', reason))
/* eslint-enable no-console */


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
		port: (process.env.PORT)
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


//===================
//socketio setup
//this is where we provide backend functionality for our app
io.on('connection', (socket: SocketIO.Socket) => { 
	//log when a client connects
	console.log("client connected", socket.client.id)

	//when a client requests a new dropbox folder url be assigned as thier playlist
	//logg the request and begin processing the request
	socket.on("readDropBoxFolder", (dropBoxfolderUrl, sessionId:string) => {
		console.log(`getting dropBoxfolder for ${sessionId}: `, dropBoxfolderUrl)
		processDropBoxfolderAndReply(dropBoxfolderUrl, socket, sessionId)
	})

	//when a session playlist is requested find it and deliver it to the client
	socket.on('getSessionPlaylist', (sessionId:string) => {

		db.getSessionList(sessionId).then(playlistData => {
			//if no list is found we wil need to return an empty one
			const blank : AudioFileInfo[] = []
			const playlist = playlistData ? playlistData : blank
			//log the playlist
			console.log(`sending playlist for session: ${sessionId}: `, playlist)
			//deliver it to the client
			socket.emit('deliverSessionPlaylist', playlist)
		})

	})

})



/**
 * pulls meta data for one audio file url
 * @param url 
 */
const parseStream = async function (url:string): Promise<musicMetadata.IAudioMetadata> {
	console.log("getting meta for: ", url)
	// Read HTTP headers
	const response:any = await fetch(url); 
	// Extract the content-type
	const contentType = response.headers.get('content-type'); 
	//parse the stream
	const metadata = await musicMetadata.parseStream(response.body, {mimeType: contentType}, {duration:true, skipPostHeaders:true, skipCovers:true})
	return metadata
}

/**
 * Gathers .oop links from a dropbox folder, formats them for download,
 * pulls all metadata, and then sends it back to the client
 * @param url 
 */
const processDropBoxfolderAndReply = async function (url:string, socket:socketIO.Socket, sessionId:string) {
	//pull the page from the provided url
	const response = await got(url as string)
	//create the regex to match the file links
	const regex = /(https:\/\/www.dropbox\.com\/sh[a-zA-Z0-9%-?_]*(\.ogg))/gm
	//pull all the links from the body
	const matches = response.body.match(regex)
	//get rid of any duplicates
	const links = [... new Set(matches)]
	//log all of the links
	console.log(`${sessionId} links found: `, links)
	//create the array for the file info we will find
	const musicFileInfoArray : AudioFileInfo[] = []
	//pull the metadata for each file and save it to the array
	for (let index = 0; index < links.length; index++) {
		var link = links[index]
		link = link.replace('www.dropbox', 'dl.dropboxusercontent')
		const data = await parseStream(link)
		musicFileInfoArray.push( {name: data.common.title, duration: data.format.duration, url:link, fileName:''} )
	}
	//save the results for next time the user:session starts
	console.log(`saving playlist for: `, sessionId)
	db.saveNewSessionList(sessionId, musicFileInfoArray)
	//send the final results back to the user
	socket.emit('deliverReadDropBoxfolder', musicFileInfoArray)
}


io.listen( parseInt(process.env.PORT)+1 )

