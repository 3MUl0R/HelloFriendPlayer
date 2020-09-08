import * as MRE from '@microsoft/mixed-reality-extension-sdk'




export class SoundManager{

    private userMediaMap : Map<MRE.Guid, UserMedia> = new Map

    /**
     * create a new manager
     * @param context 
     */
    constructor(private context:MRE.Context){

    }

    /**
     * stop the music for all instances
     */
    stop(){
        this.userMediaMap.forEach(mediaSet => {
            if (mediaSet.mediaInstance) mediaSet.mediaInstance.stop()
        })
    }

    /**
     * pause the music for all instances
     */
    pause(){
        this.userMediaMap.forEach(mediaSet => {
            if (mediaSet.mediaInstance) mediaSet.mediaInstance.pause()
        })
    }

    /**
     * resume the music for all instances
     */
    resume(){
        this.userMediaMap.forEach(mediaSet => {
            if (mediaSet.mediaInstance) mediaSet.mediaInstance.resume()
        })
    }

    
    /**
     * set the sound state for all instances
     * @param volume 
     * @param spread 
     * @param rolloffStartDistance 
     */
    setState(volume:number, spread:number, rolloffStartDistance:number){
        this.userMediaMap.forEach(mediaSet => {
            if (mediaSet.mediaInstance){
                mediaSet.mediaInstance.setState({
                    volume: volume,
                    looping: false,
                    spread: spread,
                    rolloffStartDistance: rolloffStartDistance
                })
            }
        })
    }


    /**
     * create a speaker and sound instance for a user and save them
     * @param musicAssetId 
     * @param volume 
     * @param spread 
     * @param rolloffStartDistance 
     * @param startTime 
     */
    startNewStreamForAllUsers(musicAssetId:MRE.Guid, volume:number, spread:number, rolloffStartDistance:number, startTime:number){
        //loop through all of the user sets
        this.userMediaMap.forEach(mediaSet => {
            //start the stream on each speaker and save the media instance
            mediaSet.mediaInstance = mediaSet.speaker.startVideoStream(
                musicAssetId,
                {
                    volume: volume,
                    looping: false,
                    spread: spread,
                    rolloffStartDistance: rolloffStartDistance,
                    time: startTime,
                    visible: false
                }
            )
        })
    }


    /**
     * create a speaker and sound instance for a user and save them
     * @param user 
     * @param parentActor 
     * @param musicAssetId 
     * @param volume 
     * @param spread 
     * @param rolloffStartDistance 
     * @param startTime 
     */
    createStreamForUser(user:MRE.User, parentActor:MRE.Actor, musicAssetId:MRE.Guid, volume:number, spread:number, rolloffStartDistance:number, startTime:number, musicIsPlaying:boolean){

        //create the speaker exclusive to the user
        const newSpeaker = MRE.Actor.Create(this.context, {
			actor: {
				name: `SpeakerForUser-${user.id}`,
                parentId: parentActor.id,
                exclusiveToUser:user.id
			}
        })
        
        var newMediaInstance : MRE.MediaInstance
        //create and start the stream if a music asset has been loaded
        if (musicAssetId){
            newMediaInstance = newSpeaker.startVideoStream(
                musicAssetId,
                {
                    volume: volume,
                    looping: false,
                    spread: spread,
                    rolloffStartDistance: rolloffStartDistance,
                    time: startTime,
                    visible: false
                }
            )
    
            //if the music isn't playing then stop it for this user
            if (!musicIsPlaying) newMediaInstance.pause()
            
        }else{
            newMediaInstance = undefined
        }


        //save the users media instances
        this.userMediaMap.set(user.id, new UserMedia(user, newSpeaker, newMediaInstance))
        
    }

    


}



/**
 * defines the media for a single user
 */
class UserMedia{
    
    user: MRE.User
    speaker: MRE.Actor
    mediaInstance: MRE.MediaInstance

    constructor( user: MRE.User, speaker: MRE.Actor, mediaInstance: MRE.MediaInstance){
        this.user = user
        this.speaker = speaker
        this.mediaInstance = mediaInstance
    }
}