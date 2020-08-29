/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk'
import Prompt from './prompt'
import AudioFileInfo from './types'


/** Defines an animation control field */
interface ControlDefinition {
	/** Decorative label for the control */
	label: string
	/** Changes a property, and returns a result string */
	action: (incr: number) => string
	/** Whether the control should be updated on a timer */
	realtime?: boolean
	/** The actor who's text needs to be updated */
	labelActor?: MRE.Actor
}


export default class AudioFilePlayer{

	protected modsOnly = true
	private assets: MRE.AssetContainer
	private musicAssets: MRE.AssetContainer

	private autoAdvanceIntervalSeconds = 1
	private musicIsPlaying = false
	private elapsedPlaySeconds = 0
	private currentsongIndex = 0
	private musicSpeaker : MRE.Actor
	private musicSoundInstance : MRE.MediaInstance
	private volume = 0.04
	private spread = 0.4
	private rolloffStartDistance = 2.5
	private playStateLabel : MRE.Actor
	private playPauseButton : MRE.Actor
	private arrowMesh : MRE.Mesh
	private squareMesh : MRE.Mesh
	private useStreaming = false

	controls: ControlDefinition[] = []
	prompt : Prompt



    /**
     * creates an instance of the player
     * @param context 
	 * @param socket
	 * @param musicFileList
     */
	constructor(
			private context: MRE.Context, 
			private socket: SocketIOClient.Socket, 
			private musicFileList: AudioFileInfo[] = []
		){

    }

	/**
	 * unload all asset containers
	 */
	public cleanup() {
		this.assets.unload()
		this.cleanUpMusic()
	}
	
	/**
	 * unload the music asset container
	 */
	public cleanUpMusic() {
		this.musicAssets.unload()
	}
	

    /**
     * Create the player and controls in world
     * @param rootActor 
     */
	public async run(rootActor: MRE.Actor): Promise<boolean> {

		this.prompt = new Prompt(this.context)
		this.assets = new MRE.AssetContainer(this.context)
		this.musicAssets = new MRE.AssetContainer(this.context)

		this.musicSpeaker = MRE.Actor.Create(this.context, {
			actor: {
				name: `TheSoundSpeaker`,
				parentId: rootActor.id,
			}
		})

		//get a playlist for this session if one exists
		this.socket.emit("getSessionPlaylist", this.context.sessionId)
		//when the playlist is returned capture it
		this.socket.on("deliverSessionPlaylist", (playlist:AudioFileInfo[]) => {
			this.musicFileList = playlist
			//load the first sound into the object
			this.loadNextTrack()
		})

		//default to paused
        if (this.musicSoundInstance) this.musicSoundInstance.pause()
		
		//watch for the track duration to elapse. this will allow us to advance to the next song
		const watchForTrackAutoAdvance = () => {
			//integrate the elapsed play time
			if (this.musicIsPlaying) {this.elapsedPlaySeconds += this.autoAdvanceIntervalSeconds}

			//if music has been loaded we can check for duration to be elapsed
			if (this.musicFileList[this.currentsongIndex]){
				if (this.elapsedPlaySeconds > this.musicFileList[this.currentsongIndex].duration + 2){
					this.skipForward()
				}
			}
		}

		//start the track advance watch	
		setInterval(watchForTrackAutoAdvance, this.autoAdvanceIntervalSeconds * 1000)	
		
		//use to adjust the state of the currently playing sound
		const adjustSoundState = () => {
			if (this.musicSoundInstance){
				this.musicSoundInstance.setState(
					{
						volume: this.volume,
						looping: false,
						spread: this.spread,
						rolloffStartDistance: this.rolloffStartDistance
					}
				)
			}
		}

		//define controls for the stream
		//each of these controls will have up/dn adjustment buttons
		//these controls will be replaced later with a better interface
		this.controls = [
			{
				label: "Volume", action: incr => {
					if (incr > 0) {
						this.volume = this.volume >= 0.99 ? 1.0 : this.volume + .01
					} else if (incr < 0) {
						this.volume = this.volume <= 0.01 ? 0.0 : this.volume - .01
					}
					adjustSoundState()
					return Math.floor(this.volume * 100) + "%"
				}
			},
			{
				label: "Spread", action: incr => {
					if (incr > 0) {
						this.spread = this.spread >= 0.9 ? 1.0 : this.spread + .1
					} else if (incr < 0) {
						this.spread = this.spread <= 0.1 ? 0.0 : this.spread - .1
					}
					adjustSoundState()
					return Math.floor(this.spread * 100) + "%"
				}
			},
			{
				label: "Rolloff", action: incr => {
					if (incr > 0) {
						this.rolloffStartDistance += .1
					} else if (incr < 0) {
						this.rolloffStartDistance = this.rolloffStartDistance <= 0.3 ? 0.2 : this.rolloffStartDistance - .1
                    }
					adjustSoundState()
					return this.rolloffStartDistance.toPrecision(2).toString()
				}
			},
        ]
        
        //the controls are defined now we have to create them
		this.createControls(this.controls, MRE.Actor.Create(this.context, {
			actor: {
				name: 'controlsParent',
				parentId: rootActor.id,
				appearance:{ enabled: new MRE.GroupMask( this.context, ['moderator'])},
				transform: { local: { position: { x: 0.6, y: -1, z: -1 } } }
			}
		}))

		//when the track list is delivered from the server set it as th active list
		this.socket.on("deliverReadDropBoxfolder", (dropboxFileList:AudioFileInfo[]) => {
			console.log("the returned file list: ", dropboxFileList)
			this.musicFileList = dropboxFileList
		})

		return true
	}

	/**
	 * toggles the music state
	 */
	private cycleMusicState(){
		//toggle the music state
		this.musicIsPlaying = !this.musicIsPlaying
		this.setMusicStateAppearance()
	}

	/**
	 * specifically sets the state to playing
	 */
	private setMusicStateToPlaying(){
		//toggle the music state
		this.musicIsPlaying = true
		this.setMusicStateAppearance()
	}

	/**
	 * sets the label and button appearance and 
	 */
	private setMusicStateAppearance(){
		//set the label with the state
		this.playStateLabel.text.contents = this.getPlayStateAsString()
		//set the appearance of the button
		this.playPauseButton.appearance.meshId = this.musicIsPlaying ? this.squareMesh.id : this.arrowMesh.id
		const zRotation = this.musicIsPlaying ? Math.PI * 0.25 : Math.PI * 0.5
		this.playPauseButton.transform.local.rotation = MRE.Quaternion.FromEulerAngles(0, 0, zRotation)
		this.startStopTheParty()
	}

	/**
	 * toggles the play/pause state of the music
	 */
	private startStopTheParty(){
		//depending on the state control the party
		if (this.musicIsPlaying) {
			this.musicSoundInstance.resume()
		} else {
			this.musicSoundInstance.pause()
		}
	}

	/**
	 * a get function for the play state
	 */
	private getPlayStateAsString(){
		return "Playing:\n"+`${this.musicIsPlaying.toString()}`
	}

	/**
	 * advance to the next track
	 */
	private skipForward(){
		//increment the song index and roll it over when we get to the end of the list
		this.currentsongIndex = this.currentsongIndex > this.musicFileList.length-2 ? 0 : this.currentsongIndex + 1
		this.loadNextTrack()
	}

	/**
	 * skip back a track
	 */
	private skipBackward(){
		//increment the song index and roll it over when we get to the end of the list
		this.currentsongIndex = this.currentsongIndex < 1 ? this.musicFileList.length-2 : this.currentsongIndex - 1
		this.loadNextTrack()
	}

	/**
	 * clear the current track and load the next one
	 */
	private loadNextTrack(){
		//reset the elapsed time
		this.elapsedPlaySeconds = 0

		//if the current sound exists stop it 
		if (this.musicSoundInstance) this.musicSoundInstance.stop()

		//unload the current music so we don't use all the memory
		this.cleanUpMusic()

		//recreate the asset container
		this.musicAssets = new MRE.AssetContainer(this.context)

		//create the next sound if music has been loaded
		if (this.musicFileList[this.currentsongIndex]){

			if (this.useStreaming){
				this.createStreamInstance()
			}else{
				this.createAudioInstance()
			}

			//Leave the music in the same state
			//if it wasn't marked as playing then stop the newly loaded song
			if (!this.musicIsPlaying) {
				this.musicSoundInstance.pause()
			}
		}
	}

	/**
	 * use to create a streaming audio object
	 */
	private createStreamInstance(){
		//get the next track and create a video stream from it
		let file = this.musicFileList[this.currentsongIndex]
		console.log("playing next track: ", file)
		const currentMusicAsset = this.musicAssets.createVideoStream(file.name, { uri: file.url})

		this.musicSoundInstance = this.musicSpeaker.startVideoStream(
			currentMusicAsset.id,
			{
				volume: this.volume,
				looping: false,
				spread: 1.0,
				rolloffStartDistance: 2.5,
				time: 0.0,
				visible: false
			}
		)

		//creating a stream always results in the music playing
		this.setMusicStateToPlaying()
	}

	/**
	 * use to create a file based audio object
	 */
	private createAudioInstance(){
		//get the next track and create an mre.sound from it
		let file = this.musicFileList[this.currentsongIndex]
		console.log("playing next track: ", file)
		const currentMusicAsset = this.musicAssets.createSound(file.name, { uri: file.url})

		//save the next sound into the active instance
		this.musicSoundInstance = this.musicSpeaker.startSound(
			currentMusicAsset.id,
			{
				volume: this.volume,
				looping: false,
				doppler: 0.0,
				spread: 0.4,
				rolloffStartDistance: 2.5,
				time: 0.0
			}
		)
	}

	
	/**
     * loops through an array of controls adding up/dn buttons for each
     * @param controls 
     * @param parent 
     */
	private createControls(controls: ControlDefinition[], parent: MRE.Actor) {
		this.arrowMesh = this.assets.createCylinderMesh('arrow', 0.01, 0.08, 'z', 3)
		this.squareMesh = this.assets.createCylinderMesh('square', 0.01, 0.08, 'z', 4)
		const layout = new MRE.PlanarGridLayout(parent)

		let i = 2
		let label: MRE.Actor, button: MRE.Actor

		//create a button for setting a new dropbox folder
		layout.addCell({
			row: 0,
			column: 0,
			width: 0.3,
			height: 0.25,
			contents: button = MRE.Actor.Create(this.context, {
				actor: {
					name: 'setNewDropBoxButton',
					parentId: parent.id,
					appearance: { meshId: this.squareMesh.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 1.5) } }
				}
			})
		})

		//set the action for the button
		button.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			user.prompt("Enter your dropbox folder url", true).then(res => {
				if (res.submitted) this.socket.emit('readDropBoxFolder', res.text, user.context.sessionId)
			})
			.catch(err => {
				console.error(err)
			})
		})

		//create a label for the set folder button
		layout.addCell({
			row: 0,
			column: 1,
			width: 0.3,
			height: 0.25,
			contents: label = MRE.Actor.Create(this.context, {
				actor: {
					name: 'setNewDropBoxLabel',
					parentId: parent.id,
					text: {
						contents: '      Set dropbox folder',
						height: 0.1,
						anchor: MRE.TextAnchorLocation.MiddleCenter,
						justify: MRE.TextJustify.Right,
						color: MRE.Color3.FromInts(255, 200, 255)
					}
				}
			})
		})

		//play/pause and skip controls
		//create a button for setting a new dropbox folder
		layout.addCell({
			row: 1,
			column: 0,
			width: 0.3,
			height: 0.25,
			contents: this.playPauseButton = MRE.Actor.Create(this.context, {
				actor: {
					name: 'playPauseButton',
					parentId: parent.id,
					appearance: { meshId: this.arrowMesh.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 0.5) } }
				}
			})
		})

		//set the action for the button
		this.playPauseButton.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			this.cycleMusicState()
		})

		//create a label for the play/pause button
		layout.addCell({
			row: 1,
			column: 1,
			width: 0.3,
			height: 0.25,
			contents: this.playStateLabel = MRE.Actor.Create(this.context, {
				actor: {
					name: 'playPauseLabel',
					parentId: parent.id,
					text: {
						contents: this.getPlayStateAsString(),
						height: 0.1,
						anchor: MRE.TextAnchorLocation.MiddleCenter,
						justify: MRE.TextJustify.Center,
						color: MRE.Color3.FromInts(255, 200, 255)
					}
				}
			})
		})

		//create the skip forward button
		layout.addCell({
			row: 1,
			column: 3,
			width: 0.05,
			height: 0.25,
			contents: button = MRE.Actor.Create(this.context, {
				actor: {
					name: 'skipForwardButton',
					parentId: parent.id,
					appearance: { meshId: this.arrowMesh.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 0.5) } }
				}
			})
		})

		//set the action for the button
		button.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			this.skipForward()
		})

		//create the skip back button
		layout.addCell({
			row: 1,
			column: 2,
			width: 0.3,
			height: 0.25,
			contents: button = MRE.Actor.Create(this.context, {
				actor: {
					name: 'skipBackwardButton',
					parentId: parent.id,
					appearance: { meshId: this.arrowMesh.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, -Math.PI*.5) } }
				}
			})
		})

		//set the action for the button
		button.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			this.skipBackward()
		})

		//loop through the controls defined earlier. 
		//create buttons and set actions for each of them
		for (const controlDef of controls) {
			let label: MRE.Actor, more: MRE.Actor, less: MRE.Actor
			layout.addCell({
				row: i,
				column: 1,
				width: 0.6,
				height: 0.25,
				contents: label = MRE.Actor.Create(this.context, {
					actor: {
						name: `${controlDef.label}-label`,
						parentId: parent.id,
						text: {
							contents: `${controlDef.label}:\n${controlDef.action(0)}`,
							height: 0.1,
							anchor: MRE.TextAnchorLocation.MiddleCenter,
							justify: MRE.TextJustify.Center,
							color: MRE.Color3.FromInts(255, 200, 255)
						}
					}
				})
			})
			controlDef.labelActor = label

			layout.addCell({
				row: i,
				column: 0,
				width: 0.3,
				height: 0.25,
				contents: less = MRE.Actor.Create(this.context, {
					actor: {
						name: `${controlDef.label}-less`,
						parentId: parent.id,
						appearance: { meshId: this.arrowMesh.id },
						collider: { geometry: { shape: MRE.ColliderType.Auto } },
						transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, 0) } }
					}
				})
			})

			layout.addCell({
				row: i,
				column: 2,
				width: 0.3,
				height: 0.25,
				contents: more = MRE.Actor.Create(this.context, {
					actor: {
						name: `${controlDef.label}-more`,
						parentId: parent.id,
						appearance: { meshId: this.arrowMesh.id },
						collider: { geometry: { shape: MRE.ColliderType.Auto } },
						transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI) } }
					}
				})
			})

			less.setBehavior(MRE.ButtonBehavior).onButton("pressed", () => {
				controlDef.labelActor.text.contents = `${controlDef.label}:\n${controlDef.action(-1)}`
			})

			more.setBehavior(MRE.ButtonBehavior).onButton("pressed", () => {
				controlDef.labelActor.text.contents = `${controlDef.label}:\n${controlDef.action(1)}`
			})

			i++
		}

		layout.applyLayout()

	}

}