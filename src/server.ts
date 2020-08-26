/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebHost } from '@microsoft/mixed-reality-extension-sdk';
import dotenv, { parse } from 'dotenv';
import { resolve as resolvePath } from 'path';
import App from './app';
import * as musicMetadata from 'music-metadata'
import fs from 'fs'
import AudioFileInfo from './types'
import socketIO from "socket.io"
import got from 'got'
import dropbox from './dropboxExp'
import Global = NodeJS.Global


export interface GlobalWithCognitoFix extends Global {
	fetch: any
	XMLHttpRequest: any
	ReadableStream : any
}
declare const global: GlobalWithCognitoFix;
global.fetch = require('fetch-readablestream')
global.XMLHttpRequest = require('xhr2')
global.ReadableStream = require('readable-stream')


const io = socketIO()


/* eslint-disable no-console */
process.on('uncaughtException', err => console.log('uncaughtException', err));
process.on('unhandledRejection', reason => console.log('unhandledRejection', reason));
/* eslint-enable no-console */

// Read .env if file exists
dotenv.config();

const musicFileInfoArray : Array<AudioFileInfo> = []
const dropBoxMetaGrabber = new dropbox


// This function starts the MRE server. It will be called immediately unless
// we detect that the code is running in a debuggable environment. If so, a
// small delay is introduced allowing time for the debugger to attach before
// the server starts accepting connections.
async function runApp() {

	console.log("musicMetadata: ", musicFileInfoArray)

	//if we are in dev then we will need to set the base url
	if (!process.env.BASE_URL) process.env.BASE_URL = 'http://127.0.0.1:3901'

	// Start listening for connections, and serve static files.
	const server = new WebHost({
		baseUrl: (process.env.BASE_URL),
		baseDir: resolvePath(__dirname, '../public'),
		port: (process.env.PORT)
	})

	console.log("server info: ", server)

	//get a list of all the music files
	const fileList = fs.readdirSync('./public/music/')

	//loop through the list and capture file properties
	for (let index = 0; index < fileList.length; index++) {
		const fileName = fileList[index]
		const data = await musicMetadata.parseBuffer(fs.readFileSync(`./public/music/${fileName}`)) 
		musicFileInfoArray.push( {name: data.common.title, duration: data.format.duration, url:`${process.env.BASE_URL}/music/${fileName}`, fileName:fileName} )
	}

	// console.log("musicFileInfoArray after creation: ", musicFileInfoArray)

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
// socketio server setup
io.on('connection', (socket: SocketIO.Socket) => { 
	console.log("client connected", socket.client.id)

	//
	socket.on("readDropBoxFolder", (dropBoxfolderUrl) => {
		console.log("readDropBoxFolder dropBoxfolderUrl: ", dropBoxfolderUrl)
		reply(socket, dropBoxfolderUrl)

	})

})

const ReadableWebToNodeStream = require('readable-web-to-node-stream');
const fetch = require('fetch-readablestream')

async function download(url:string) {
	const response = await fetch(url);
	const readableWebStream = response.body;
	const nodeStream = new ReadableWebToNodeStream(readableWebStream);
	const data = await musicMetadata.parseStream(nodeStream, {mimeType: 'audio/vorbis'}, {duration: true, skipCovers: true})
	console.log("data: ", data)
}

async function reply(socket: SocketIO.Socket, url:string) {
	//pull the page from the provided url
	const response = await got(url)
	//create the regex to match the file links
	const regex = /(https:\/\/www\.dropbox\.com\/sh.{1,80}\.ogg\?dl=0)/gm
	//pull all the links from the body
	const matches = response.body.match(regex)
	//get rid of any duplicates
	const links = [... new Set(matches)]


	const myURL = "https://dl.dropboxusercontent.com/sh/4oeq6mdfj59m5su/AADqRhhAegfGQpvXZt6HnRi_a/Backgrounds_Bird_ST028880.ogg"
	console.log("getting meta for file at: ", myURL)

	download(myURL)
	// const data = await musicMetadata.parseStream(myURL)

	// console.log("data: ", data)
	// musicFileInfoArray.push( {name: data.common.title, duration: data.format.duration, url:`${process.env.BASE_URL}/music/Untouchable.ogg`, fileName:"Untouchable.ogg"} )
	// console.log("musicFileInfoArray: ", musicFileInfoArray)


	// dropBoxMetaGrabber.getFileMetadata('https://dl.dropboxusercontent.com/sh/4oeq6mdfj59m5su/AADqRhhAegfGQpvXZt6HnRi_a/Backgrounds_Bird_ST028880.ogg').then(data => {
	// 	console.log("data returned: ", data)
	// })
	


	socket.emit("deliverReadDropBoxfolder", links)
}

io.listen( 3902 )

