/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import dotenv from 'dotenv';
import { resolve as resolvePath } from 'path';
import App from './app';
import * as musicMetadata from 'music-metadata'
import fs from 'fs'
import AudioFileInfo from './types'
import socketIO from "socket.io"
import fetch from 'node-fetch'
import got from 'got'

const io = socketIO()
var userRecords : Map<string, AudioFileInfo[]> = new Map


/* eslint-disable no-console */
process.on('uncaughtException', err => console.log('uncaughtException', err));
process.on('unhandledRejection', reason => console.log('unhandledRejection', reason));
/* eslint-enable no-console */

// Read .env if file exists
dotenv.config();



// This function starts the MRE server. It will be called immediately unless
// we detect that the code is running in a debuggable environment. If so, a
// small delay is introduced allowing time for the debugger to attach before
// the server starts accepting connections.
async function runApp() {

	const musicFileInfoArray : Array<AudioFileInfo> = []

	//load playlist data from disk
	const a = fs.readFileSync('./data/playlistData.json')
	const b = JSON.parse(a.toString())
	userRecords = new Map([...b])

	//if one was not provided then we will need to set the base url
	if (!process.env.BASE_URL) process.env.BASE_URL = 'http://127.0.0.1:3901'

	// Start listening for connections, and serve static files.
	const server = new MRE.WebHost({
		baseUrl: (process.env.BASE_URL),
		baseDir: resolvePath(__dirname, '../public'),
		port: (process.env.PORT)
	})

	console.log("server started: ", server)

	//get a list of all the music files stored on the local disk
	const fileList = fs.readdirSync('./public/music/')

	//loop through the list and capture file properties
	for (let index = 0; index < fileList.length; index++) {
		const fileName = fileList[index]
		const data = await musicMetadata.parseBuffer(fs.readFileSync(`./public/music/${fileName}`)) 
		musicFileInfoArray.push( {name: data.common.title, duration: data.format.duration, url:`${process.env.BASE_URL}/music/${fileName}`, fileName:fileName} )
	}

	// Handle new application sessions
	server.adapter.onConnection(context => new App(context, server.baseUrl, musicFileInfoArray))
	
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
// socketio setup
//this is where we provide backend functionality for our app
io.on('connection', (socket: SocketIO.Socket) => { 
	console.log("client connected", socket.client.id)

	//
	socket.on("readDropBoxFolder", (dropBoxfolderUrl, sessionId:string) => {
		console.log(`getting dropBoxfolder for ${sessionId}: `, dropBoxfolderUrl)
		processDropBoxfolderAndReply(dropBoxfolderUrl, socket, sessionId)
	})

	socket.on('getSessionPlaylist', (sessionId:string) => {
		const sid = sessionId 
		const blank : AudioFileInfo[] = []
		const playlist = userRecords.has(sid) ? userRecords.get(sid) : blank
		socket.emit('deliverSessionPlaylist', playlist)
		console.log(`sending playlist for ${sessionId}: `, playlist)
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
 * Gathers .oop links from a dropbox folder, formats them for download, and puls all metadata
 * and send it back to the client
 * @param url 
 */
const processDropBoxfolderAndReply = async function (url:string, socket:socketIO.Socket, sessionId:string) {
	//pull the page from the provided url
	const response = await got(url as string)
	//create the regex to match the file links
	const regex = /(https:\/\/www\.dropbox\.com\/sh.{1,80}\.ogg)/gm
	//pull all the links from the body
	const matches = response.body.match(regex)
	//get rid of any duplicates
	const links = [... new Set(matches)]
	console.log("links found: ", links)
	//create the array for the file info we will find
	const musicFileInfoArray : Array<AudioFileInfo> = []
	//pull the metadata for each file and save it to the array
	for (let index = 0; index < links.length; index++) {
		var link = links[index]
		link = link.replace('www.dropbox', 'dl.dropboxusercontent')
		const data = await parseStream(link)
		musicFileInfoArray.push( {name: data.common.title, duration: data.format.duration, url:link, fileName:''} )
	}
	//save the results for next time the user:session starts
	console.log(`setting playlist for user:`, sessionId)
	userRecords.set(sessionId, musicFileInfoArray)
	// console.log("userRecords ", userRecords)
	fs.writeFileSync('./data/playlistData.json', JSON.stringify([...userRecords], null, 2))


	//send the final results back to the user
	socket.emit('deliverReadDropBoxfolder', musicFileInfoArray)
}


io.listen( 3902 )

