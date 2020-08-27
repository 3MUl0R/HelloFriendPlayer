/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebHost } from '@microsoft/mixed-reality-extension-sdk';
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
	//if one was not provided then we will need to set the base url
	if (!process.env.BASE_URL) process.env.BASE_URL = 'http://127.0.0.1:3901'

	// Start listening for connections, and serve static files.
	const server = new WebHost({
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
	socket.on("readDropBoxFolder", (dropBoxfolderUrl) => {
		console.log("readDropBoxFolder dropBoxfolderUrl: ", dropBoxfolderUrl)
		processDropBoxfolderAndReply(dropBoxfolderUrl, socket)
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
const processDropBoxfolderAndReply = async function (url:string, socket:socketIO.Socket) {
	//pull the page from the provided url
	const response = await got(url as string)
	//create the regex to match the file links
	const regex = /(https:\/\/www\.dropbox\.com\/sh.{1,80}\.ogg)/gm
	//pull all the links from the body
	const matches = response.body.match(regex)
	//get rid of any duplicates
	const links = [... new Set(matches)]

	//create the array for the file info we will find
	const musicFileInfoArray : Array<AudioFileInfo> = []

	for (let index = 0; index < links.length; index++) {
		var link = links[index]
		link = link.replace('www.dropbox', 'dl.dropboxusercontent')
		const data = await parseStream(link)
		musicFileInfoArray.push( {name: data.common.title, duration: data.format.duration, url:link, fileName:''} )
	}

	socket.emit('deliverReadDropBoxfolder', musicFileInfoArray)
}



async function reply(socket: SocketIO.Socket, folderUrl:string) {

	// socket.emit("deliverReadDropBoxfolder", links)
}

io.listen( 3902 )

