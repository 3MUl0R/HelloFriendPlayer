import * as MRE from '@microsoft/mixed-reality-extension-sdk'
import * as musicMetadata from 'music-metadata'
import fetch from 'node-fetch'
import got from 'got'

import AudioFileInfo, { SessionState } from './types'
import DBConnect from './db'
import socketIO from "socket.io"




export default class SocketServer{
    io: socketIO.Server
    db: DBConnect

    constructor(){
        //create the db connection
        this.db = new DBConnect()
        //create and start the socket server
        this.io = socketIO()
        this.io.listen( parseInt(process.env.PORT)+1 )
        //initialze the server functions
        this.setup()
    }

    /**
     * defines the socket interface
     */
    private setup(){
        //===================
        //socketio setup
        //this is where we provide backend functionality for our app
        this.io.on('connection', (socket: SocketIO.Socket) => { 

            //log when a client connects
            MRE.log.info('app', "client connected", socket.client.id)
    
            //when a client requests a new dropbox folder url be assigned as thier playlist
            //logg the request and begin processing the request
            socket.on("readDropBoxFolder", (dropBoxfolderUrl, sessionId:string) => {
                MRE.log.info('app', `getting dropBoxfolder for ${sessionId}: `, dropBoxfolderUrl)
                this.processDropBoxfolderAndReply(dropBoxfolderUrl, socket, sessionId)
            })
    
            //when the session state is requested we will attemp to find it in the db
            //failing that we will return a default state
            socket.on('getSessionState', (sessionId:string) => {
    
                this.db.getSessionData(sessionId).then(sessionData => {
                    //if no list is found we wil need to return an empty one
                    const emptyPlaylist : AudioFileInfo[] = []
                    sessionData.playlist = sessionData.playlist ? sessionData.playlist : emptyPlaylist
                    sessionData.state = sessionData.state ? sessionData.state : new SessionState
                    
                    //deliver it to the client
                    socket.emit('deliverSessionState', sessionData)
                })
    
            })

            //save the session state upon request
            socket.on('saveSessionState', (sessionId:string, state:SessionState) => {
                this.db.saveSessionState(sessionId, state)
            })
    
        })
    }


    /**
     * pulls meta data for one audio file url
     * @param url 
     */
    private async parseStream (url:string): Promise<musicMetadata.IAudioMetadata> {
        MRE.log.info('app', "getting meta for: ", url)
        // Read HTTP headers
        const response:any = await fetch(url); 
        // Extract the content-type
        const contentType = response.headers.get('content-type'); 
        //parse the stream
        const metadata = await musicMetadata.parseStream(response.body, {mimeType: contentType}, {duration:true, skipPostHeaders:true, skipCovers:true})
        return metadata
    }

    /**
     * pulls the file name from the end of a dropbox link
     * @param url 
     */
    private extractFileName(url:string):string{
        const splitString = url.split('/')
        let name = splitString[splitString.length - 1]
        name = name.replace(/\.ogg/gmi, '')
        name = name.replace(/%20/gmi, ' ')
        name = name.replace(/%5b/gmi, '[')
        name = name.replace(/%5d/gmi, ']')
        return name
    }

    
    /**
     * Gathers .oop links from a dropbox folder, formats them for download,
     * pulls all metadata, and then sends it back to the client
     * @param url 
     * @param socket
     * @param sessionId
     */
    private async processDropBoxfolderAndReply (url:string, socket:socketIO.Socket, sessionId:string) {
        //pull the page from the provided url
        const response = await got(url as string)
        //create the regex to match the file links
        const regex = /(https:\/\/www.dropbox\.com\/sh[a-zA-Z0-9%-?_]*(\.ogg))/gm
        //pull all the links from the body
        const matches = response.body.match(regex)
        //get rid of any duplicates
        const links = [... new Set(matches)]
        //log all of the links
        MRE.log.info('app', `${sessionId} links found: `, links)
        //create the array for the file info we will find
        const musicFileInfoArray : AudioFileInfo[] = []
        //pull the metadata for each file and save it to the array
        for (let index = 0; index < links.length; index++) {
            var link = links[index]
            link = link.replace('www.dropbox', 'dl.dropboxusercontent')
            const data = await this.parseStream(link)
            musicFileInfoArray.push( {
                name: data.common.title=='' ? data.common.title : this.extractFileName(link), 
                duration: data.format.duration, 
                url:link, 
                fileName: this.extractFileName(link)
            })
        }
        //save the results for next time the user:session starts
        MRE.log.info('app', `saving playlist for: `, sessionId)
        this.db.saveNewSessionList(sessionId, musicFileInfoArray)
        //send the final results back to the user
        socket.emit('deliverReadDropBoxFolder', musicFileInfoArray)
    }

}