import * as MRE from '@microsoft/mixed-reality-extension-sdk'
import { Pool } from 'pg'

import AudioFileInfo, { SessionData, SessionState } from './types'




export default class DBConnect{

    pool = new Pool({
        user: process.env.PG_USER,
        host: process.env.PG_HOST,
        database: process.env.PG_DATABASE,
        password: process.env.PG_PASSWORD,
        port: parseInt( process.env.PG_PORT)
    })

    /**
     * creates a db connection
     */
    constructor(){
        //action to be take on pool connection
        this.pool.on('connect', (client)=>{ })
        //db error action
        this.pool.on('error', (err, client) => {
            MRE.log.error('app', 'db error on idle client', err)
            process.exit(-1)
        })
        //test the connection to the db on startup
        this.pool.connect().then(client => {
            return client
            .query('SELECT * FROM sessiondata WHERE id = $1', [1])
            .then(res => {
                client.release()
                MRE.log.info('app', "db connection test returned: ", res.rows[0])
            })
            .catch(err => {
                client.release()
                MRE.log.info('app', "db error:", err.stack)
            })
        })
    }
    
    /**
     * pull the current playlist for a given sessionid from the db
     * @param sessionId 
     */
    async getSessionData(sessionId:string):Promise<SessionData> {
        const text = 'SELECT * FROM sessiondata WHERE sessionId=$1'
        const values = [sessionId]
        const res = await this.pool.query(text, values)
        //if nothing was found in the db return undefined
        let sessionData = new SessionData()
        sessionData.playlist = res.rows[0] ? JSON.parse(res.rows[0].playlistjson) as AudioFileInfo[] : undefined
        sessionData.state = res.rows[0] ? JSON.parse(res.rows[0].state) as SessionState : undefined
        return sessionData
        
    }

    /**
     * save a new playlist to the db
     * @param sessionId 
     * @param musicFileList 
     */ //INSERT INTO users(name, email) VALUES($1, $2)
    async saveNewSessionList(sessionId:string, musicFileList: AudioFileInfo[]){
        //first we check to see if an entry exists
        let text = 'select * from sessiondata WHERE sessionid = $1'
        let values = [sessionId]
        const res = await this.pool.query(text, values)

        //set the values for the insert or update
        values = [sessionId, JSON.stringify(musicFileList) ]
        //if the select didn't find anything then we do an insert
        if (!res.rows[0]) {
            let text = 'INSERT INTO sessiondata (sessionid, playlistjson) VALUES ($1, $2)'
            const res = await this.pool.query(text, values)
            MRE.log.info('app', `saving playlist for ${sessionId} with ${musicFileList.length} tracks`)

        //else update the existing row
        }else{
            let text = 'UPDATE sessiondata SET playlistjson = $2 WHERE sessionid = $1'
            const res = await this.pool.query(text, values)
            MRE.log.info('app', `updating playlist for ${sessionId} to new list with ${musicFileList.length} tracks`)

        }
    }



    /**
     * clear playlist for session
     * @param sessionId 
     */
     async clearSessionPlaylist(sessionId:string){
        //first we check to see if an entry exists
        let text = 'select * from sessiondata WHERE sessionid = $1'
        let values = [sessionId]
        const res = await this.pool.query(text, values)

        //set the values for the insert or update
        values = [sessionId, JSON.stringify([]) ]
        //if the select didn't find anything then we do an insert
        if (!res.rows[0]) {
            let text = 'INSERT INTO sessiondata (sessionid, playlistjson) VALUES ($1, $2)'
            const res = await this.pool.query(text, values)
            MRE.log.info('app', `clearing playlist for ${sessionId}`)

        //else update the existing row
        }else{
            let text = 'UPDATE sessiondata SET playlistjson = $2 WHERE sessionid = $1'
            const res = await this.pool.query(text, values)
            MRE.log.info('app', `clearing playlist for ${sessionId} t`)

        }
    }



    /**
     * save session settings to the db
     * to receive session settings just load a playlist
     * @param state 
     */
    async saveSessionState(sessionId:string, state:SessionState){

        MRE.log.info('app', `saving session state for ${sessionId}: `, state)

        //first we check to see if an entry exists
        let text = 'select * from sessiondata WHERE sessionid = $1'
        let values = [sessionId]
        const res = await this.pool.query(text, values)

        //set the values for the insert or update
        values = [sessionId, JSON.stringify(state) ]
        //if the select didn't find anything then we do an insert
        if (!res.rows[0]) {
            let text = 'INSERT INTO sessiondata (sessionid, state) VALUES ($1, $2)'
            const res = await this.pool.query(text, values)

        //else update the existing row
        }else{
            let text = 'UPDATE sessiondata SET state = $2 WHERE sessionid = $1'
            const res = await this.pool.query(text, values)

        }
    }
    
    
}

