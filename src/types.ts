import * as MRE from '@microsoft/mixed-reality-extension-sdk'


/**
 * defines all info needed for each audio file
 */
export default class AudioFileInfo {
    name = ''
    duration = 0
    url = ''
    fileName = ""
}

export class SessionData{
    playlist : AudioFileInfo[]
    state : SessionState
}

/**
 * stores the setting for a session id
 */
export class SessionState{
    volume = 0.04
    spread = 0.4
    rolloffStartDistance = 2.5
    musicIsPlaying = false
    currentsongIndex = 0
}

/**
 * holds the defaults for app configuration
 * used to create the .env file on the first start
 */
export class DefaultEnv {
    //define the index type so we can access it
    [key: string]: string

    BASE_URL = 'http://127.0.0.1'
    PORT = '3901'

    PG_USER = 'postgres'
    PG_HOST = '127.0.0.1'
    PG_DATABASE = 'dbNameHere'
    PG_PASSWORD = 'postgres'
    PG_PORT = '5432'
}


/**
 * stores a button and information about it
 */
export class ButtonStorage{
    button : MRE.Actor
	wristPlayPauseButtonHasBeenMoved = false
}


