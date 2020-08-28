// const { Pool, Client } = require('pg')

import { Pool } from 'pg'
import AudioFileInfo from './types'

export default class DBConnect{

    pool = new Pool()

    /**
     * creates a db connection
     */
    constructor(){

        this.pool.on('connect', (client)=>{ })

        this.pool.on('error', (err, client) => {
            console.error('db error on idle client', err)
            process.exit(-1)
        })

        this.pool.connect().then(client => {
            return client
            .query('SELECT * FROM sessiondata WHERE id = $1', [1])
            .then(res => {
                client.release()
                console.log("test returned: ", res.rows[0])
            })
            .catch(err => {
                client.release()
                console.log(err.stack)
            })
        })
    }
    
    /**
     * pull the current playlist for a given sessionid from the db
     * @param sessionId 
     */
    async getSessionList(sessionId:string):Promise<AudioFileInfo[]> {
        const text = 'SELECT * FROM sessiondata WHERE sessionId=$1'
        const values = [sessionId]
        const res = await this.pool.query(text, values)
        //if nothing was found in the db return undefined
        return res.rows[0] ? JSON.parse(res.rows[0].playlistjson) as AudioFileInfo[] : undefined
        
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

        //else update the existing row
        }else{
            let text = 'UPDATE sessiondata SET playlistjson = $2 WHERE sessionid = $1'
            const res = await this.pool.query(text, values)

        }


    }

    
    
}

